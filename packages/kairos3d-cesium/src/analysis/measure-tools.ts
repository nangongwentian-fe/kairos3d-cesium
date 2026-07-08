import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  ConstantProperty,
  Entity,
  ScreenSpaceEventType,
} from "cesium";
import type { KairosMap } from "../core";
import {
  lineStyleWithHeight,
  serializeHeightOptions,
  type AreaMeasureMode,
  type DistanceMeasureMode,
  type HeightOptions
} from "../height";
import type { ResultSymbolStyle } from "../style";
import {
  createLabelGraphics,
  createLineGraphics,
  createPolygonGraphics,
  mergeSymbolStyles
} from "../style";
import type {
  ResultPrimitiveRuntime,
  ResultRenderMode
} from "../primitives";
import { InteractiveTool } from "../tools/interactive-tool";
import { registerTool } from "../tools/registry";
import {
  renderMeasurePrimitives,
  resolveMeasureRenderMode
} from "./manager";
import {
  formatArea,
  formatDistance,
  measureArea,
  measureDistance,
  measureHeight
} from "./measure-utils";
import type { MeasureResult, MeasureToolOptions, MeasureType, MeasureUnit } from "./types";

abstract class BaseMeasureTool extends InteractiveTool<MeasureToolOptions> {
  protected positions: Cartesian3[] = [];
  protected previewPosition?: Cartesian3;
  protected entities: Entity[] = [];
  protected options: MeasureToolOptions = {};
  protected resolvedStyle?: ResultSymbolStyle;
  protected completed = false;

  override start(options: MeasureToolOptions = {}): void {
    super.start(options);
    this.positions = [];
    this.previewPosition = undefined;
    this.entities = [];
    this.options = options;
    this.resolvedStyle = undefined;
    this.completed = false;
  }

  override stop(): void {
    this.discardDraft();
    super.stop();
  }

  override destroy(): void {
    super.destroy();
  }

  protected addLabel(
    position: Cartesian3,
    text: string,
    style?: ResultSymbolStyle["label"]
  ): Entity {
    const entity = this.viewer.entities.add({
      position,
      label: createLabelGraphics(text, style)
    });
    this.entities.push(entity);
    return entity;
  }

  protected notifyMeasurePointAdd(): void {
    this.notifyPointAdd(clonePositions(this.positions));
  }

  protected renderPositions(): Cartesian3[] {
    return this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;
  }

  protected createResult(
    type: MeasureType,
    positions: Cartesian3[],
    value: number,
    unit: MeasureUnit,
    label?: string,
    renderMode?: ResultRenderMode,
    primitives?: ResultPrimitiveRuntime[]
  ): MeasureResult {
    return this.map.analysis.measure.addResult({
        id: createMeasureId(type),
        type,
        positions,
        value,
        unit,
        label,
        entities: [...this.entities],
        entityIds: this.entities.map((entity) => entity.id),
        createdAt: new Date(),
        style: this.resolveStyle(type),
        height: serializeHeightOptions(resolveMeasureHeightOptions(type, this.options)),
        mode: resolveMeasureMode(type, this.options),
        renderMode,
        primitives
      });
  }

  protected discardDraft(): void {
    if (!this.completed) {
      for (const entity of this.entities) {
        this.viewer.entities.remove(entity);
      }
    }
    this.entities = [];
    this.positions = [];
    this.previewPosition = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }

  protected freezePolyline(entity: Entity, positions: Cartesian3[]): void {
    if (entity.polyline) {
      entity.polyline.positions = new ConstantProperty(positions);
    }
  }

  protected freezePolygon(entity: Entity, positions: Cartesian3[]): void {
    if (entity.polygon) {
      entity.polygon.hierarchy = new ConstantProperty(positions);
    }
  }

  protected resolveStyle(type: MeasureType): ResultSymbolStyle {
    this.resolvedStyle ??= this.map.styles.resolveMeasureStyle(
      type,
      measureOptionsToStyle(this.options)
    );
    return this.resolvedStyle;
  }
}

export class DistanceMeasureTool extends BaseMeasureTool {
  private line?: Entity;

  constructor(map: KairosMap) {
    super(map, "measure.distance");
  }

  override start(options: MeasureToolOptions = {}): void {
    super.start(options);

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensureLine();
      this.notifyMeasurePointAdd();

      if (this.positions.length > 1) {
        if (resolveDistanceMeasureMode(this.options) === "space") {
          this.addLabel(
            position,
            formatDistance(measureDistance(this.positions)),
            this.resolveStyle("distance").label
          );
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (this.positions.length === 0) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.previewPosition = Cartesian3.clone(position);
      this.ensureLine();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => void this.finish(), ScreenSpaceEventType.RIGHT_CLICK);
    this.handler?.setInputAction(() => void this.finish(), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  private ensureLine(): void {
    if (this.line) {
      return;
    }

    this.line = this.viewer.entities.add({
      polyline: createLineGraphics(
        new CallbackProperty(() => this.renderPositions(), false),
        lineStyleWithHeight(
          this.resolveStyle("distance").line,
          resolveMeasureHeightOptions("distance", this.options)
        )
      )
    });
    this.entities.push(this.line);
  }

  private async finish(): Promise<void> {
    if (!this.line || this.positions.length < 2 || this.completed) {
      return;
    }

    this.completed = true;
    const positions = await resolveDistancePositions(this.map, this.positions, this.options);
    const total = measureDistance(positions);
    const display = distanceDisplay(total);
    this.freezePolyline(this.line, positions);
    const renderMode = resolveMeasureRenderMode("distance", this.options.renderMode);
    const primitives = this.replaceLineWithPrimitive(renderMode, positions);
    if (resolveDistanceMeasureMode(this.options) === "surface") {
      this.addLabel(
        positions[positions.length - 1],
        display.label,
        this.resolveStyle("distance").label
      );
    }
    const result = this.createResult(
      "distance",
      positions,
      display.value,
      display.unit,
      display.label,
      renderMode,
      primitives
    );
    this.emit("measure-complete", result);
    this.notifyComplete(result);
    this.map.tools.stop();
  }

  private replaceLineWithPrimitive(
    renderMode: ResultRenderMode,
    positions: Cartesian3[]
  ): ResultPrimitiveRuntime[] | undefined {
    if (renderMode !== "primitive" || !this.line) {
      return undefined;
    }

    this.viewer.entities.remove(this.line);
    this.entities = this.entities.filter((entity) => entity !== this.line);
    return renderMeasurePrimitives(
      this.map,
      "distance",
      this.line.id,
      positions,
      this.resolveStyle("distance")
    );
  }
}

export class AreaMeasureTool extends BaseMeasureTool {
  private polygon?: Entity;

  constructor(map: KairosMap) {
    super(map, "measure.area");
  }

  override start(options: MeasureToolOptions = {}): void {
    super.start(options);

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensurePolygon();
      this.notifyMeasurePointAdd();
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (this.positions.length === 0) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.previewPosition = Cartesian3.clone(position);
      this.ensurePolygon();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => this.finish(), ScreenSpaceEventType.RIGHT_CLICK);
    this.handler?.setInputAction(() => this.finish(), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  private ensurePolygon(): void {
    if (this.polygon) {
      return;
    }

    this.polygon = this.viewer.entities.add({
      polygon: createPolygonGraphics(
        new CallbackProperty(() => this.renderPositions(), false),
        this.resolveStyle("area").polygon
      )
    });
    this.entities.push(this.polygon);
  }

  private finish(): void {
    if (!this.polygon || this.positions.length < 3 || this.completed) {
      return;
    }

    if (resolveAreaMeasureMode(this.options) === "surface") {
      throw new Error("Surface area measurement is not implemented yet.");
    }

    const positions = clonePositions(this.positions);
    const area = measureArea(positions);
    const display = areaDisplay(area);
    this.completed = true;
    this.freezePolygon(this.polygon, positions);
    const renderMode = resolveMeasureRenderMode("area", this.options.renderMode);
    const primitives = this.replacePolygonWithPrimitive(renderMode, positions);
    this.addLabel(positions[positions.length - 1], display.label, this.resolveStyle("area").label);
    const result = this.createResult(
      "area",
      positions,
      display.value,
      display.unit,
      display.label,
      renderMode,
      primitives
    );
    this.emit("measure-complete", result);
    this.notifyComplete(result);
    this.map.tools.stop();
  }

  private replacePolygonWithPrimitive(
    renderMode: ResultRenderMode,
    positions: Cartesian3[]
  ): ResultPrimitiveRuntime[] | undefined {
    if (renderMode !== "primitive" || !this.polygon) {
      return undefined;
    }

    this.viewer.entities.remove(this.polygon);
    this.entities = this.entities.filter((entity) => entity !== this.polygon);
    return renderMeasurePrimitives(
      this.map,
      "area",
      this.polygon.id,
      positions,
      this.resolveStyle("area")
    );
  }
}

export class HeightMeasureTool extends BaseMeasureTool {
  private line?: Entity;

  constructor(map: KairosMap) {
    super(map, "measure.height");
  }

  override start(options: MeasureToolOptions = {}): void {
    super.start(options);

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      if (this.positions.length >= 2) {
        return;
      }

      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensureLine();
      this.notifyMeasurePointAdd();

      if (this.positions.length === 2) {
        this.finish();
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (this.positions.length !== 1) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.previewPosition = Cartesian3.clone(position);
      this.ensureLine();
    }, ScreenSpaceEventType.MOUSE_MOVE);
  }

  private ensureLine(): void {
    if (this.line) {
      return;
    }

    this.line = this.viewer.entities.add({
      polyline: createLineGraphics(
        new CallbackProperty(() => this.renderPositions(), false),
        lineStyleWithHeight(
          this.resolveStyle("height").line,
          resolveMeasureHeightOptions("height", this.options)
        )
      )
    });
    this.entities.push(this.line);
  }

  private finish(): void {
    if (!this.line || this.positions.length < 2 || this.completed) {
      return;
    }

    const positions = clonePositions(this.positions);
    const height = measureHeight(positions[0], positions[1]);
    const display = distanceDisplay(height);
    this.completed = true;
    this.freezePolyline(this.line, positions);
    this.addLabel(positions[1], display.label, this.resolveStyle("height").label);
    const result = this.createResult("height", positions, display.value, display.unit, display.label);
    this.emit("measure-complete", result);
    this.notifyComplete(result);
    this.map.tools.stop();
  }
}

export function registerDefaultMeasureTools(): void {
  registerTool("measure.distance", (map) => new DistanceMeasureTool(map));
  registerTool("measure.area", (map) => new AreaMeasureTool(map));
  registerTool("measure.height", (map) => new HeightMeasureTool(map));
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function createMeasureId(type: MeasureType): string {
  return `measure-${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function distanceDisplay(meters: number): { value: number; unit: "m" | "km"; label: string } {
  if (Math.abs(meters) >= 1000) {
    const value = meters / 1000;
    return { value, unit: "km", label: `${value.toFixed(2)} km` };
  }

  return { value: meters, unit: "m", label: `${meters.toFixed(2)} m` };
}

function areaDisplay(squareMeters: number): { value: number; unit: "m2" | "km2"; label: string } {
  if (squareMeters >= 1_000_000) {
    const value = squareMeters / 1_000_000;
    return { value, unit: "km2", label: `${value.toFixed(2)} km2` };
  }

  return { value: squareMeters, unit: "m2", label: formatArea(squareMeters) };
}

function measureOptionsToStyle(options: MeasureToolOptions): ResultSymbolStyle {
  return mergeSymbolStyles(
    {
      line: { color: options.lineColor },
      polygon: {
        fillColor: options.fillColor,
        outlineColor: options.lineColor
      },
      label: { color: options.labelColor }
    },
    options.style
  );
}

function resolveDistanceMeasureMode(options: MeasureToolOptions): DistanceMeasureMode {
  return options.mode === "surface" ? "surface" : "space";
}

function resolveAreaMeasureMode(options: MeasureToolOptions): AreaMeasureMode {
  return options.mode === "surface" ? "surface" : "projected";
}

function resolveMeasureMode(
  type: MeasureType,
  options: MeasureToolOptions
): DistanceMeasureMode | AreaMeasureMode | undefined {
  if (type === "distance") {
    return resolveDistanceMeasureMode(options);
  }

  if (type === "area") {
    return resolveAreaMeasureMode(options);
  }

  return undefined;
}

function resolveMeasureHeightOptions(
  type: MeasureType,
  options: MeasureToolOptions
): HeightOptions | undefined {
  if (type === "distance" && resolveDistanceMeasureMode(options) === "surface") {
    return options.height ?? { mode: "clampToGround", sampleTerrain: true };
  }

  return options.height;
}

async function resolveDistancePositions(
  map: KairosMap,
  positions: Cartesian3[],
  options: MeasureToolOptions
): Promise<Cartesian3[]> {
  const height = resolveMeasureHeightOptions("distance", options);
  return height ? map.height.resolvePositions(positions, height) : clonePositions(positions);
}
