import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  Entity,
  Rectangle,
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
  createPolygonGraphics,
  parseColorLike
} from "../style";
import {
  resolveResultRenderMode,
  type ResultPrimitiveRuntime,
  type ResultRenderMode
} from "../primitives";
import { InteractiveTool } from "../tools/interactive-tool";
import { registerTool } from "../tools/registry";
import { renderDrawPrimitives } from "./manager";
import type {
  DrawBoxToolOptions,
  DrawCorridorToolOptions,
  DrawCylinderToolOptions,
  DrawResult,
  DrawStyle,
  DrawToolOptions,
  DrawType,
  DrawWallToolOptions
} from "./types";

const defaultCorridorWidth = 20;
const defaultBoxDimensions: [number, number, number] = [50, 50, 50];
const defaultCylinderLength = 50;
const defaultCylinderRadius = 15;

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
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show ?? true,
      locked: this.options.locked ?? false,
      editable: this.options.editable ?? true
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
          : undefined,
        this.options
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
          : undefined,
        this.options
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

export class DrawCircleTool extends InteractiveTool<DrawToolOptions> {
  private center?: Cartesian3;
  private edgePosition?: Cartesian3;
  private entity?: Entity;
  private options: DrawToolOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "draw.circle");
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

      if (!this.center) {
        this.center = Cartesian3.clone(position);
        this.edgePosition = undefined;
        this.ensureEntity();
        this.notifyPointAdd([Cartesian3.clone(this.center)]);
        return;
      }

      this.edgePosition = Cartesian3.clone(position);
      void this.finish();
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!this.center) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.edgePosition = Cartesian3.clone(position);
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
    if (this.entity || !this.center) {
      return;
    }

    const style = resolveDrawToolStyle(this.map, "circle", this.options.style);
    this.resolvedStyle = style;
    this.entity = this.viewer.entities.add({
      id: createDrawId("circle-preview"),
      position: this.center,
      ellipse: {
        semiMajorAxis: new CallbackProperty(() => Math.max(this.radius(), 0.01), false),
        semiMinorAxis: new CallbackProperty(() => Math.max(this.radius(), 0.01), false),
        material: parseColorLike(
          style.polygon?.fillColor ?? Color.CYAN.withAlpha(0.22),
          "polygon.fillColor"
        ),
        outline: true,
        outlineColor: parseColorLike(
          style.polygon?.outlineColor ?? style.line?.color ?? Color.CYAN,
          "polygon.outlineColor"
        ),
        outlineWidth: style.polygon?.outlineWidth ?? style.line?.width
      }
    });
    applyHeightOptionsToEntity(this.entity, this.options.height);
  }

  private async finish(): Promise<void> {
    if (!this.center || !this.edgePosition || this.completed || this.radius() <= 0) {
      return;
    }

    this.completed = true;
    const height = serializeHeightOptions(this.options.height);
    const [center] = await resolveDrawPositions(this.map, [this.center], height);
    const radius = this.radius();
    const style = this.resolvedStyle ?? resolveDrawToolStyle(this.map, "circle", this.options.style);
    const result = this.map.draw.circle({
      id: createDrawId("circle"),
      center,
      radius,
      style,
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show,
      locked: this.options.locked,
      editable: this.options.editable
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);

    if (this.options.once ?? true) {
      this.map.tools.stop();
      return;
    }

    this.discardDraft();
  }

  private radius(): number {
    return this.center && this.edgePosition
      ? Cartesian3.distance(this.center, this.edgePosition)
      : 0;
  }

  private discardDraft(): void {
    if (this.entity) {
      this.viewer.entities.remove(this.entity);
    }
    this.resetDraft();
  }

  private resetDraft(): void {
    this.center = undefined;
    this.edgePosition = undefined;
    this.entity = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export class DrawRectangleTool extends InteractiveTool<DrawToolOptions> {
  private firstCorner?: Cartesian3;
  private oppositeCorner?: Cartesian3;
  private entity?: Entity;
  private options: DrawToolOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "draw.rectangle");
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

      if (!this.firstCorner) {
        this.firstCorner = Cartesian3.clone(position);
        this.oppositeCorner = undefined;
        this.ensureEntity();
        this.notifyPointAdd([Cartesian3.clone(this.firstCorner)]);
        return;
      }

      this.oppositeCorner = Cartesian3.clone(position);
      void this.finish();
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!this.firstCorner) {
        return;
      }

      const position = this.pickPosition(movement.endPosition);
      if (!position) {
        return;
      }

      this.oppositeCorner = Cartesian3.clone(position);
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
    if (this.entity || !this.firstCorner) {
      return;
    }

    const style = resolveDrawToolStyle(this.map, "rectangle", this.options.style);
    this.resolvedStyle = style;
    this.entity = this.viewer.entities.add({
      id: createDrawId("rectangle-preview"),
      rectangle: {
        coordinates: new CallbackProperty(() => this.rectangleCoordinates(), false),
        material: parseColorLike(
          style.polygon?.fillColor ?? Color.CYAN.withAlpha(0.22),
          "polygon.fillColor"
        ),
        outline: true,
        outlineColor: parseColorLike(
          style.polygon?.outlineColor ?? style.line?.color ?? Color.CYAN,
          "polygon.outlineColor"
        ),
        outlineWidth: style.polygon?.outlineWidth ?? style.line?.width
      }
    });
    applyHeightOptionsToEntity(this.entity, this.options.height);
  }

  private async finish(): Promise<void> {
    if (
      !this.firstCorner ||
      !this.oppositeCorner ||
      this.completed ||
      Cartesian3.equals(this.firstCorner, this.oppositeCorner)
    ) {
      return;
    }

    this.completed = true;
    const height = serializeHeightOptions(this.options.height);
    const positions = await resolveDrawPositions(
      this.map,
      [this.firstCorner, this.oppositeCorner],
      height
    );
    const style = this.resolvedStyle ?? resolveDrawToolStyle(this.map, "rectangle", this.options.style);
    const result = this.map.draw.rectangle({
      id: createDrawId("rectangle"),
      positions,
      style,
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show,
      locked: this.options.locked,
      editable: this.options.editable
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);

    if (this.options.once ?? true) {
      this.map.tools.stop();
      return;
    }

    this.discardDraft();
  }

  private rectangleCoordinates(): Rectangle {
    const positions = this.oppositeCorner && this.firstCorner
      ? [this.firstCorner, this.oppositeCorner]
      : this.firstCorner
        ? [this.firstCorner, this.firstCorner]
        : [new Cartesian3(), new Cartesian3()];
    return Rectangle.fromCartesianArray(positions);
  }

  private discardDraft(): void {
    if (this.entity) {
      this.viewer.entities.remove(this.entity);
    }
    this.resetDraft();
  }

  private resetDraft(): void {
    this.firstCorner = undefined;
    this.oppositeCorner = undefined;
    this.entity = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export class DrawEllipseTool extends InteractiveTool<DrawToolOptions> {
  private center?: Cartesian3;
  private majorPosition?: Cartesian3;
  private minorPosition?: Cartesian3;
  private previewPosition?: Cartesian3;
  private entity?: Entity;
  private options: DrawToolOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "draw.ellipse");
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

      if (!this.center) {
        this.center = Cartesian3.clone(position);
        this.previewPosition = undefined;
        this.ensureEntity();
        this.notifyPointAdd([Cartesian3.clone(this.center)]);
        return;
      }

      if (!this.majorPosition) {
        this.majorPosition = Cartesian3.clone(position);
        this.previewPosition = undefined;
        this.notifyPointAdd([Cartesian3.clone(this.center), Cartesian3.clone(this.majorPosition)]);
        return;
      }

      this.minorPosition = Cartesian3.clone(position);
      void this.finish();
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler?.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!this.center) {
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
    if (this.entity || !this.center) {
      return;
    }

    const style = resolveDrawToolStyle(this.map, "ellipse", this.options.style);
    this.resolvedStyle = style;
    this.entity = this.viewer.entities.add({
      id: createDrawId("ellipse-preview"),
      position: this.center,
      ellipse: {
        semiMajorAxis: new CallbackProperty(() => Math.max(this.semiMajorAxis(), 0.01), false),
        semiMinorAxis: new CallbackProperty(() => Math.max(this.semiMinorAxis(), 0.01), false),
        material: parseColorLike(
          style.polygon?.fillColor ?? Color.CYAN.withAlpha(0.22),
          "polygon.fillColor"
        ),
        outline: true,
        outlineColor: parseColorLike(
          style.polygon?.outlineColor ?? style.line?.color ?? Color.CYAN,
          "polygon.outlineColor"
        ),
        outlineWidth: style.polygon?.outlineWidth ?? style.line?.width
      }
    });
    applyHeightOptionsToEntity(this.entity, this.options.height);
  }

  private async finish(): Promise<void> {
    if (!this.center || !this.majorPosition || this.completed || this.semiMajorAxis() <= 0) {
      return;
    }

    this.completed = true;
    const height = serializeHeightOptions(this.options.height);
    const [center] = await resolveDrawPositions(this.map, [this.center], height);
    const style = this.resolvedStyle ?? resolveDrawToolStyle(this.map, "ellipse", this.options.style);
    const result = this.map.draw.ellipse({
      id: createDrawId("ellipse"),
      center,
      semiMajorAxis: this.semiMajorAxis(),
      semiMinorAxis: this.semiMinorAxis(),
      style,
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show,
      locked: this.options.locked,
      editable: this.options.editable
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);

    if (this.options.once ?? true) {
      this.map.tools.stop();
      return;
    }

    this.discardDraft();
  }

  private semiMajorAxis(): number {
    const edge = this.majorPosition ?? this.previewPosition;
    return this.center && edge ? Cartesian3.distance(this.center, edge) : 0;
  }

  private semiMinorAxis(): number {
    const edge = this.minorPosition ?? (this.majorPosition ? this.previewPosition : undefined);
    if (this.center && edge) {
      return Cartesian3.distance(this.center, edge);
    }
    return this.semiMajorAxis();
  }

  private discardDraft(): void {
    if (this.entity) {
      this.viewer.entities.remove(this.entity);
    }
    this.resetDraft();
  }

  private resetDraft(): void {
    this.center = undefined;
    this.majorPosition = undefined;
    this.minorPosition = undefined;
    this.previewPosition = undefined;
    this.entity = undefined;
    this.resolvedStyle = undefined;
    this.completed = false;
  }
}

export class DrawWallTool extends InteractiveTool<DrawWallToolOptions> {
  private positions: Cartesian3[] = [];
  private previewPosition?: Cartesian3;
  private entity?: Entity;
  private options: DrawWallToolOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "draw.wall");
  }

  override start(options: DrawWallToolOptions = {}): void {
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

    const style = resolveDrawToolStyle(this.map, "wall", this.options.style);
    this.resolvedStyle = style;
    this.entity = this.viewer.entities.add({
      id: createDrawId("wall-preview"),
      wall: {
        positions: new CallbackProperty(() => this.renderPositions(), false),
        material: parseColorLike(
          style.polygon?.fillColor ?? Color.CYAN.withAlpha(0.2),
          "polygon.fillColor"
        ),
        outline: true,
        outlineColor: parseColorLike(
          style.polygon?.outlineColor ?? style.line?.color ?? Color.CYAN,
          "polygon.outlineColor"
        )
      }
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
    const style = this.resolvedStyle ?? resolveDrawToolStyle(this.map, "wall", this.options.style);
    const result = this.map.draw.wall({
      id: createDrawId("wall"),
      positions,
      minimumHeights: this.options.minimumHeights,
      maximumHeights: this.options.maximumHeights,
      style,
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show,
      locked: this.options.locked,
      editable: this.options.editable
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);

    if (this.options.once ?? true) {
      this.map.tools.stop();
      return;
    }

    this.discardDraft();
  }

  private renderPositions(): Cartesian3[] {
    return this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;
  }

  private discardDraft(): void {
    if (this.entity) {
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

export class DrawCorridorTool extends InteractiveTool<DrawCorridorToolOptions> {
  private positions: Cartesian3[] = [];
  private previewPosition?: Cartesian3;
  private entity?: Entity;
  private options: DrawCorridorToolOptions = {};
  private resolvedStyle?: ResultSymbolStyle;
  private completed = false;

  constructor(map: KairosMap) {
    super(map, "draw.corridor");
  }

  override start(options: DrawCorridorToolOptions = {}): void {
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

    const style = resolveDrawToolStyle(this.map, "corridor", this.options.style);
    this.resolvedStyle = style;
    this.entity = this.viewer.entities.add({
      id: createDrawId("corridor-preview"),
      corridor: {
        positions: new CallbackProperty(() => this.renderPositions(), false),
        width: this.options.width ?? defaultCorridorWidth,
        material: parseColorLike(
          style.polygon?.fillColor ?? Color.CYAN.withAlpha(0.2),
          "polygon.fillColor"
        ),
        outline: true,
        outlineColor: parseColorLike(
          style.polygon?.outlineColor ?? style.line?.color ?? Color.CYAN,
          "polygon.outlineColor"
        ),
        outlineWidth: style.polygon?.outlineWidth ?? style.line?.width
      }
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
    const style = this.resolvedStyle ?? resolveDrawToolStyle(this.map, "corridor", this.options.style);
    const result = this.map.draw.corridor({
      id: createDrawId("corridor"),
      positions,
      width: this.options.width ?? defaultCorridorWidth,
      style,
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show,
      locked: this.options.locked,
      editable: this.options.editable
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);

    if (this.options.once ?? true) {
      this.map.tools.stop();
      return;
    }

    this.discardDraft();
  }

  private renderPositions(): Cartesian3[] {
    return this.previewPosition
      ? [...this.positions, this.previewPosition]
      : this.positions;
  }

  private discardDraft(): void {
    if (this.entity) {
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

export class DrawBoxTool extends InteractiveTool<DrawBoxToolOptions> {
  private options: DrawBoxToolOptions = {};

  constructor(map: KairosMap) {
    super(map, "draw.box");
  }

  override start(options: DrawBoxToolOptions = {}): void {
    super.start(options);
    this.options = options;
    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      const position = this.pickPosition(movement.position);
      if (position) {
        void this.createBox(position);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  private async createBox(position: Cartesian3): Promise<void> {
    const height = serializeHeightOptions(this.options.height);
    const [resolvedPosition] = await resolveDrawPositions(this.map, [position], height);
    const result = this.map.draw.box({
      id: createDrawId("box"),
      position: resolvedPosition,
      dimensions: this.options.dimensions ?? defaultBoxDimensions,
      style: resolveDrawToolStyle(this.map, "box", this.options.style),
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show,
      locked: this.options.locked,
      editable: this.options.editable
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);
    if (this.options.once ?? true) {
      this.map.tools.stop();
    }
  }
}

export class DrawCylinderTool extends InteractiveTool<DrawCylinderToolOptions> {
  private options: DrawCylinderToolOptions = {};

  constructor(map: KairosMap) {
    super(map, "draw.cylinder");
  }

  override start(options: DrawCylinderToolOptions = {}): void {
    super.start(options);
    this.options = options;
    this.handler?.setInputAction((movement: { position: Cartesian2 }) => {
      const position = this.pickPosition(movement.position);
      if (position) {
        void this.createCylinder(position);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  private async createCylinder(position: Cartesian3): Promise<void> {
    const height = serializeHeightOptions(this.options.height);
    const [resolvedPosition] = await resolveDrawPositions(this.map, [position], height);
    const result = this.map.draw.cylinder({
      id: createDrawId("cylinder"),
      position: resolvedPosition,
      length: this.options.length ?? defaultCylinderLength,
      topRadius: this.options.topRadius ?? defaultCylinderRadius,
      bottomRadius: this.options.bottomRadius ?? defaultCylinderRadius,
      style: resolveDrawToolStyle(this.map, "cylinder", this.options.style),
      height,
      properties: this.options.properties,
      metadata: this.options.metadata,
      group: this.options.group,
      show: this.options.show,
      locked: this.options.locked,
      editable: this.options.editable
    });
    this.emit("draw-created", result);
    this.notifyComplete(result);
    if (this.options.once ?? true) {
      this.map.tools.stop();
    }
  }
}

export function registerDefaultDrawTools(): void {
  registerTool("draw.point", (map) => new DrawPointTool(map));
  registerTool("draw.polyline", (map) => new DrawPolylineTool(map));
  registerTool("draw.polygon", (map) => new DrawPolygonTool(map));
  registerTool("draw.circle", (map) => new DrawCircleTool(map));
  registerTool("draw.rectangle", (map) => new DrawRectangleTool(map));
  registerTool("draw.ellipse", (map) => new DrawEllipseTool(map));
  registerTool("draw.wall", (map) => new DrawWallTool(map));
  registerTool("draw.corridor", (map) => new DrawCorridorTool(map));
  registerTool("draw.box", (map) => new DrawBoxTool(map));
  registerTool("draw.cylinder", (map) => new DrawCylinderTool(map));
}

function createDrawResult(
  type: DrawType,
  entity: Entity,
  positions: Cartesian3[],
  style?: ResultSymbolStyle,
  height?: DrawResult["height"],
  renderMode?: ResultRenderMode,
  primitives?: ResultPrimitiveRuntime[],
  options: DrawToolOptions = {}
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
    properties: options.properties,
    metadata: options.metadata,
    group: options.group,
    show: options.show ?? true,
    locked: options.locked ?? false,
    editable: options.editable ?? true,
    primitives
  };
}

function createDrawId(type: string): string {
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
