import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  ConstantProperty,
  Entity,
  ScreenSpaceEventType
} from "cesium";
import type { KairosMap } from "../core";
import {
  applyHeightOptionsToEntity,
  lineStyleWithHeight,
  serializeHeightOptions
} from "../height";
import type { ResultSymbolStyle } from "../style";
import {
  createLineGraphics,
  createPointGraphics,
  createPolygonGraphics
} from "../style";
import {
  resolveResultRenderMode,
  type ResultPrimitiveRuntime,
  type ResultRenderMode
} from "../primitives";
import { InteractiveTool } from "../tools/interactive-tool";
import { registerTool } from "../tools/registry";
import { renderDrawPrimitives } from "./manager";
import type { DrawResult, DrawStyle, DrawToolOptions, DrawType } from "./types";

export class DrawPointTool extends InteractiveTool<DrawToolOptions> {
  private options: DrawToolOptions = {};

  constructor(map: KairosMap) {
    super(map, "draw.point");
  }

  override start(options: DrawToolOptions = {}): void {
    super.start(options);
    this.options = options;
    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      void this.createPoint(position);
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  private async createPoint(position: Cartesian3): Promise<void> {
    const style = resolveDrawToolStyle(this.map, "point", this.options.style);
    const height = serializeHeightOptions(this.options.height);
    const positions = await resolveDrawPositions(this.map, [position], height);
    const id = createDrawId("point");
    const entity = this.viewer.entities.add({
      id,
      position: positions[0],
      point: createPointGraphics(style.point)
    });
    applyHeightOptionsToEntity(entity, height);

    const result = this.map.draw.addResult({
      id,
      type: "point",
      entity,
      positions,
      createdAt: new Date(),
      style,
      height
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);
    if (this.options.once ?? true) {
      this.map.tools.stop();
    }
  }
}

export class DrawPolylineTool extends InteractiveTool<DrawToolOptions> {
  private positions: Cartesian3[] = [];
  private previewPosition?: Cartesian3;
  private entity?: Entity;
  private options: DrawToolOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "draw.polyline");
  }

  override start(options: DrawToolOptions = {}): void {
    super.start(options);
    this.options = options;
    this.resetDraft();

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensureEntity();
      this.emit("draw-add-point", { positions: clonePositions(this.positions) });
      this.notifyPointAdd(clonePositions(this.positions));
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
      this.ensureEntity();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => void this.finish(), ScreenSpaceEventType.RIGHT_CLICK);
    this.handler?.setInputAction(() => void this.finish(), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  override stop(): void {
    this.discardDraft();
    super.stop();
  }

  private ensureEntity(): void {
    if (this.entity) {
      return;
    }

    const style = resolveDrawToolStyle(this.map, "polyline", this.options.style);
    this.resolvedStyle = style;
    const id = createDrawId("polyline");
    this.entity = this.viewer.entities.add({
      id,
      polyline: createLineGraphics(
        new CallbackProperty(() => this.renderPositions(), false),
        lineStyleWithHeight(style.line, this.options.height)
      )
    });
    applyHeightOptionsToEntity(this.entity, this.options.height);
  }

  private async finish(): Promise<void> {
    if (!this.entity || this.positions.length < 2 || this.completed) {
      return;
    }

    this.completed = true;
    const height = serializeHeightOptions(this.options.height);
    const positions = await resolveDrawPositions(this.map, this.positions, height);
    const style = this.resolvedStyle ?? resolveDrawToolStyle(this.map, "polyline", this.options.style);
    const renderMode = resolveResultRenderMode(this.options.renderMode);
    this.freezePolyline(this.entity, positions);
    const entity = this.resolveResultEntity(renderMode);
    const result = this.map.draw.addResult(
      createDrawResult(
        "polyline",
        entity,
        positions,
        style,
        height,
        renderMode,
        renderMode === "primitive"
          ? renderDrawPrimitives(this.map, "polyline", entity.id, positions, style)
          : undefined
      )
    );
    this.emit("draw-created", result);
    this.notifyComplete(result);

    if (this.options.once ?? true) {
      this.map.tools.stop();
      return;
    }

    this.resetDraft();
  }

  private renderPositions(): Cartesian3[] {
    return this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;
  }

  private freezePolyline(entity: Entity, positions: Cartesian3[]): void {
    if (entity.polyline) {
      entity.polyline.positions = new ConstantProperty(positions);
    }
  }

  private resolveResultEntity(renderMode: ResultRenderMode): Entity {
    if (!this.entity) {
      throw new Error("Draw polyline result entity is not available.");
    }

    if (renderMode === "entity") {
      return this.entity;
    }

    const id = this.entity.id;
    this.viewer.entities.remove(this.entity);
    return new Entity({ id });
  }

  private discardDraft(): void {
    if (this.entity && !this.completed) {
      this.viewer.entities.remove(this.entity);
    }
    this.resetDraft();
  }

  private resetDraft(): void {
    this.positions = [];
    this.previewPosition = undefined;
    this.entity = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export class DrawPolygonTool extends InteractiveTool<DrawToolOptions> {
  private positions: Cartesian3[] = [];
  private previewPosition?: Cartesian3;
  private entity?: Entity;
  private options: DrawToolOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "draw.polygon");
  }

  override start(options: DrawToolOptions = {}): void {
    super.start(options);
    this.options = options;
    this.resetDraft();

    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      const position = this.pickPosition(movement.position);
      if (!position) {
        return;
      }

      this.positions.push(Cartesian3.clone(position));
      this.previewPosition = undefined;
      this.ensureEntity();
      this.emit("draw-add-point", { positions: clonePositions(this.positions) });
      this.notifyPointAdd(clonePositions(this.positions));
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
      this.ensureEntity();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.handler?.setInputAction(() => void this.finish(), ScreenSpaceEventType.RIGHT_CLICK);
    this.handler?.setInputAction(() => void this.finish(), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  override stop(): void {
    this.discardDraft();
    super.stop();
  }

  private ensureEntity(): void {
    if (this.entity) {
      return;
    }

    const style = resolveDrawToolStyle(this.map, "polygon", this.options.style);
    this.resolvedStyle = style;
    const id = createDrawId("polygon");
    this.entity = this.viewer.entities.add({
      id,
      polygon: createPolygonGraphics(
        new CallbackProperty(() => this.renderPositions(), false),
        style.polygon
      )
    });
    applyHeightOptionsToEntity(this.entity, this.options.height);
  }

  private async finish(): Promise<void> {
    if (!this.entity || this.positions.length < 3 || this.completed) {
      return;
    }

    this.completed = true;
    const height = serializeHeightOptions(this.options.height);
    const positions = await resolveDrawPositions(this.map, this.positions, height);
    const style = this.resolvedStyle ?? resolveDrawToolStyle(this.map, "polygon", this.options.style);
    const renderMode = resolveResultRenderMode(this.options.renderMode);
    this.freezePolygon(this.entity, positions);
    const entity = this.resolveResultEntity(renderMode);
    const result = this.map.draw.addResult(
      createDrawResult(
        "polygon",
        entity,
        positions,
        style,
        height,
        renderMode,
        renderMode === "primitive"
          ? renderDrawPrimitives(this.map, "polygon", entity.id, positions, style)
          : undefined
      )
    );
    this.emit("draw-created", result);
    this.notifyComplete(result);

    if (this.options.once ?? true) {
      this.map.tools.stop();
      return;
    }

    this.resetDraft();
  }

  private renderPositions(): Cartesian3[] {
    return this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;
  }

  private freezePolygon(entity: Entity, positions: Cartesian3[]): void {
    if (entity.polygon) {
      entity.polygon.hierarchy = new ConstantProperty(positions);
    }
  }

  private resolveResultEntity(renderMode: ResultRenderMode): Entity {
    if (!this.entity) {
      throw new Error("Draw polygon result entity is not available.");
    }

    if (renderMode === "entity") {
      return this.entity;
    }

    const id = this.entity.id;
    this.viewer.entities.remove(this.entity);
    return new Entity({ id });
  }

  private discardDraft(): void {
    if (this.entity && !this.completed) {
      this.viewer.entities.remove(this.entity);
    }
    this.resetDraft();
  }

  private resetDraft(): void {
    this.positions = [];
    this.previewPosition = undefined;
    this.entity = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export function registerDefaultDrawTools(): void {
  registerTool("draw.point", (map) => new DrawPointTool(map));
  registerTool("draw.polyline", (map) => new DrawPolylineTool(map));
  registerTool("draw.polygon", (map) => new DrawPolygonTool(map));
}

function createDrawResult(
  type: DrawType,
  entity: Entity,
  positions: Cartesian3[],
  style?: ResultSymbolStyle,
  height?: DrawResult["height"],
  renderMode?: ResultRenderMode,
  primitives?: ResultPrimitiveRuntime[]
): DrawResult {
  return {
    id: entity.id,
    type,
    entity,
    positions,
    createdAt: new Date(),
    style,
    height,
    renderMode,
    primitives
  };
}

function createDrawId(type: DrawType): string {
  return `draw-${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function resolveDrawToolStyle(
  map: KairosMap,
  type: DrawType,
  style?: ResultSymbolStyle | DrawStyle
): ResultSymbolStyle {
  return map.styles.resolveDrawStyle(type, normalizeDrawStyle(style));
}

function normalizeDrawStyle(style?: ResultSymbolStyle | DrawStyle): ResultSymbolStyle | undefined {
  if (!style) {
    return undefined;
  }

  if (
    "pointColor" in style ||
    "lineColor" in style ||
    "fillColor" in style ||
    "pointSize" in style ||
    "lineWidth" in style
  ) {
    const legacy = style as DrawStyle;
    return {
      point: {
        color: legacy.pointColor,
        pixelSize: legacy.pointSize
      },
      line: {
        color: legacy.lineColor,
        width: legacy.lineWidth
      },
      polygon: {
        fillColor: legacy.fillColor,
        outlineColor: legacy.lineColor
      }
    };
  }

  return style as ResultSymbolStyle;
}

async function resolveDrawPositions(
  map: KairosMap,
  positions: Cartesian3[],
  height?: DrawResult["height"]
): Promise<Cartesian3[]> {
  return height ? map.height.resolvePositions(positions, height) : clonePositions(positions);
}
