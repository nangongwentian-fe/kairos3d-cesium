import {
  Cartesian3,
  Entity
} from "cesium";
import type { KairosMap } from "../core/map";
import { Evented } from "../core/events";
import {
  deserializePositions,
  parseSnapshotDate,
  serializePositions
} from "../core/serialization";
import type { Tool } from "../tools";
import type { ResultSymbolStyle } from "../style";
import { serializeHeightOptions } from "../height";
import {
  applySymbolStyleToEntities,
  serializeSymbolStyle
} from "../style";
import {
  cloneOverlayData,
  normalizeOverlayHeight,
  renderOverlayEntity,
  validateOverlayShape
} from "../overlays/render";
import {
  geoJSONToSnapshots,
  snapshotsToGeoJSON
} from "../overlays/geojson";
import type { OverlayData } from "../overlays/types";
import {
  createResultPolygonPrimitives,
  createResultPolylinePrimitive,
  removeResultPrimitiveRuntimes,
  resolveResultRenderMode
} from "../primitives";
import { clonePositions, minPositionCount } from "./geometry";
import type {
  DrawEditEvent,
  DrawEditOptions,
  DrawEditReason,
  DrawEditStartOptions,
  DrawBillboardOptions,
  DrawBoxOptions,
  DrawCircleOptions,
  DrawCorridorOptions,
  DrawCylinderOptions,
  DrawEllipseOptions,
  DrawGeoJsonFeatureCollection,
  DrawLabelOptions,
  DrawModelOptions,
  DrawQueryOptions,
  DrawRectangleOptions,
  DrawResult,
  DrawResultLoadOptions,
  DrawResultSnapshot,
  DrawResultUpdateOptions,
  DrawToolOptions,
  DrawWallOptions
} from "./types";

export interface DrawManagerEvents {
  add: DrawResult;
  remove: DrawResult;
  clear: DrawResult[];
  "edit-change": DrawEditEvent;
}

interface PreparedDrawSnapshot {
  snapshot: DrawResultSnapshot;
  positions: Cartesian3[];
  data?: OverlayData;
  createdAt: Date;
  updatedAt?: Date;
  style: ResultSymbolStyle;
  height?: DrawResult["height"];
  renderMode: NonNullable<DrawResult["renderMode"]>;
}

interface DrawProgrammaticConfig {
  id?: string;
  type: DrawResult["type"];
  positions: Cartesian3[];
  data?: OverlayData;
  style?: ResultSymbolStyle;
  height?: DrawResult["height"];
  renderMode?: DrawResult["renderMode"];
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show?: boolean;
  locked?: boolean;
  editable?: boolean;
}

let drawResultIdSeed = 0;

export class DrawManager extends Evented<DrawManagerEvents> {
  private readonly results = new Map<string, DrawResult>();
  private activeEditResultId?: string;
  private readonly offToolStop: () => void;

  constructor(private readonly map: KairosMap) {
    super();
    this.offToolStop = this.map.tools.on("stop", (event) => {
      if (event.data.id === "draw.edit") {
        this.activeEditResultId = undefined;
      }
    });
  }

  point(options?: DrawToolOptions): Promise<Tool<DrawToolOptions>> {
    return this.map.tools.start("draw.point", options);
  }

  polyline(options?: DrawToolOptions): Promise<Tool<DrawToolOptions>> {
    return this.map.tools.start("draw.polyline", options);
  }

  polygon(options?: DrawToolOptions): Promise<Tool<DrawToolOptions>> {
    return this.map.tools.start("draw.polygon", options);
  }

  circle(options: DrawCircleOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "circle",
      positions: [options.center],
      data: { ...options.data, radius: options.radius },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  rectangle(options: DrawRectangleOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "rectangle",
      positions: options.positions,
      data: options.data,
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  billboard(options: DrawBillboardOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "billboard",
      positions: [options.position],
      data: { ...options.data, image: options.image, scale: options.scale },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  label(options: DrawLabelOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "label",
      positions: [options.position],
      data: { ...options.data, text: options.text },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  model(options: DrawModelOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "model",
      positions: [options.position],
      data: {
        ...options.data,
        uri: options.uri,
        scale: options.scale,
        minimumPixelSize: options.minimumPixelSize,
        maximumScale: options.maximumScale,
        heading: options.heading,
        pitch: options.pitch,
        roll: options.roll
      },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  ellipse(options: DrawEllipseOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "ellipse",
      positions: [options.center],
      data: {
        ...options.data,
        semiMajorAxis: options.semiMajorAxis,
        semiMinorAxis: options.semiMinorAxis
      },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  wall(options: DrawWallOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "wall",
      positions: options.positions,
      data: {
        ...options.data,
        minimumHeights: options.minimumHeights,
        maximumHeights: options.maximumHeights
      },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  corridor(options: DrawCorridorOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "corridor",
      positions: options.positions,
      data: { ...options.data, width: options.width },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  box(options: DrawBoxOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "box",
      positions: [options.position],
      data: { ...options.data, dimensions: options.dimensions },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  cylinder(options: DrawCylinderOptions): DrawResult {
    return this.addProgrammaticResult({
      id: options.id,
      type: "cylinder",
      positions: [options.position],
      data: {
        ...options.data,
        length: options.length,
        topRadius: options.topRadius,
        bottomRadius: options.bottomRadius
      },
      style: options.style,
      height: options.height,
      renderMode: options.renderMode,
      properties: options.properties,
      metadata: options.metadata,
      group: options.group,
      show: options.show,
      locked: options.locked,
      editable: options.editable
    });
  }

  async edit(id: string, options: DrawEditOptions = {}): Promise<Tool<DrawEditStartOptions>> {
    if (!this.results.has(id)) {
      throw new Error(`Draw result "${id}" does not exist.`);
    }

    const tool = await this.map.tools.start("draw.edit", { ...options, resultId: id });
    this.activeEditResultId = id;
    return tool;
  }

  stopEdit(): void {
    if (this.map.tools.active?.id === "draw.edit") {
      this.map.tools.stop();
    }
  }

  cancelEdit(): void {
    if (this.map.tools.active?.id === "draw.edit") {
      this.map.tools.cancel();
    }
  }

  addResult(result: DrawResult): DrawResult {
    const existing = this.results.get(result.id);
    if (existing === result) {
      return result;
    }
    if (existing) {
      this.remove(result.id);
    }
    ensureDrawResultState(result);
    applyDrawResultShow(result, result.show);
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): DrawResult | undefined {
    return this.results.get(id);
  }

  list(options: DrawQueryOptions = {}): DrawResult[] {
    return [...this.results.values()].filter((result) => matchesDrawQuery(result, options));
  }

  toJSON(): DrawResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: result.type,
      positions: serializePositions(result.positions),
      data: cloneOverlayData(result.data),
      properties: cloneRecord(result.properties),
      metadata: cloneRecord(result.metadata),
      group: result.group,
      show: result.show,
      locked: result.locked || undefined,
      editable: result.editable === false ? false : undefined,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt?.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height),
      renderMode: result.renderMode === "primitive" ? "primitive" : undefined
    }));
  }

  async load(
    snapshots: DrawResultSnapshot[],
    options: DrawResultLoadOptions = {}
  ): Promise<DrawResult[]> {
    const prepared = this.prepareSnapshots(snapshots);
    if (options.clear) {
      this.clear();
    }

    return prepared.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  toKairosJSON(): DrawResultSnapshot[] {
    return this.toJSON();
  }

  async loadKairosJSON(
    snapshots: DrawResultSnapshot[],
    options: DrawResultLoadOptions = {}
  ): Promise<DrawResult[]> {
    return this.load(snapshots, options);
  }

  toGeoJSON(): DrawGeoJsonFeatureCollection {
    return snapshotsToGeoJSON(this.toJSON());
  }

  async loadGeoJSON(
    geojson: DrawGeoJsonFeatureCollection,
    options: DrawResultLoadOptions = {}
  ): Promise<DrawResult[]> {
    return this.load(geoJSONToSnapshots<DrawResultSnapshot>(geojson), options);
  }

  setStyle(id: string, style: ResultSymbolStyle): DrawResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Draw result "${id}" does not exist.`);
    }

    result.style = this.map.styles.resolveDrawStyle(result.type, style);
    result.updatedAt = new Date();
    if (result.renderMode === "primitive") {
      removeResultPrimitiveRuntimes(this.map, result.primitives);
      result.primitives = renderDrawPrimitives(
        this.map,
        result.type,
        result.id,
        result.positions,
        result.style
      );
    } else {
      if (result.type === "circle" || result.type === "rectangle") {
        rerenderDrawEntity(this.map, result);
      } else {
        applySymbolStyleToEntities([result.entity], result.style);
      }
    }
    applyDrawResultShow(result, result.show);
    return result;
  }

  update(
    id: string,
    positionsOrOptions: Cartesian3[] | DrawResultUpdateOptions,
    reason: DrawEditReason = "programmatic"
  ): DrawResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Draw result "${id}" does not exist.`);
    }

    const previousPositions = clonePositions(result.positions);
    const update = this.resolveDrawUpdate(result, positionsOrOptions);
    result.positions = update.positions;
    result.data = update.data;
    result.height = update.height;
    result.style = update.style;
    result.renderMode = update.renderMode;
    result.properties = update.properties;
    result.metadata = update.metadata;
    result.group = update.group;
    result.show = update.show;
    result.locked = update.locked;
    result.editable = update.editable;
    result.updatedAt = new Date();

    if (result.renderMode === "primitive") {
      removeResultPrimitiveRuntimes(this.map, result.primitives);
      result.primitives = renderDrawPrimitives(
        this.map,
        result.type,
        result.id,
        result.positions,
        result.style ?? this.map.styles.resolveDrawStyle(result.type)
      );
    } else {
      rerenderDrawEntity(this.map, result);
    }
    applyDrawResultShow(result, result.show);
    const event = {
      result,
      previousPositions,
      positions: clonePositions(result.positions),
      reason
    };
    this.emit("edit-change", event);
    return result;
  }

  setShow(id: string, show: boolean): DrawResult {
    const result = this.getRequired(id);
    result.show = show;
    applyDrawResultShow(result, show);
    result.updatedAt = new Date();
    this.emit("edit-change", {
      result,
      previousPositions: clonePositions(result.positions),
      positions: clonePositions(result.positions),
      reason: "programmatic"
    });
    return result;
  }

  setLocked(id: string, locked: boolean): DrawResult {
    const result = this.getRequired(id);
    result.locked = locked;
    result.updatedAt = new Date();
    return result;
  }

  setEditable(id: string, editable: boolean): DrawResult {
    const result = this.getRequired(id);
    result.editable = editable;
    result.updatedAt = new Date();
    return result;
  }

  setGroup(id: string, group: string | undefined): DrawResult {
    const result = this.getRequired(id);
    result.group = group;
    result.updatedAt = new Date();
    return result;
  }

  removeGroup(group: string): number {
    const results = this.list({ group });
    for (const result of results) {
      this.remove(result.id);
    }
    return results.length;
  }

  clearGroup(group: string): number {
    return this.removeGroup(group);
  }

  remove(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    if (this.activeEditResultId === id) {
      this.cancelEdit();
    }

    this.map.viewer.entities.remove(result.entity);
    removeResultPrimitiveRuntimes(this.map, result.primitives);
    this.results.delete(id);
    this.emit("remove", result);
    this.map.tools.emitClear({ source: "draw", ids: [id] });
    return true;
  }

  clear(): void {
    if (this.activeEditResultId) {
      this.cancelEdit();
    }

    const removed = [...this.results.values()];
    for (const result of removed) {
      this.map.viewer.entities.remove(result.entity);
      removeResultPrimitiveRuntimes(this.map, result.primitives);
      this.emit("remove", result);
    }

    this.results.clear();
    this.emit("clear", removed);
    this.map.tools.emitClear({ source: "draw", ids: removed.map((result) => result.id) });
  }

  destroy(): void {
    this.clear();
    this.offToolStop();
    this.off();
  }

  private addProgrammaticResult(config: DrawProgrammaticConfig): DrawResult {
    const id = config.id ?? createDrawResultId(config.type);
    const positions = clonePositions(config.positions);
    const data = cloneOverlayData(config.data);
    const style = this.map.styles.resolveDrawStyle(config.type, config.style);
    const height = normalizeOverlayHeight(config.height);
    const renderMode = resolveDrawRenderMode(config.type, config.renderMode);
    validateOverlayShape(id, config.type, positions, data);

    const entity =
      renderMode === "primitive"
        ? new Entity({ id })
        : renderDrawEntity(this.map, config.type, id, positions, style, height, data);
    const primitives =
      renderMode === "primitive"
        ? renderDrawPrimitives(this.map, config.type, id, positions, style)
        : undefined;

    return this.addResult({
      id,
      type: config.type,
      entity,
      positions,
      data,
      createdAt: new Date(),
      style,
      height,
      renderMode,
      properties: cloneRecord(config.properties),
      metadata: cloneRecord(config.metadata),
      group: config.group,
      show: config.show ?? true,
      locked: config.locked ?? false,
      editable: config.editable ?? true,
      primitives
    });
  }

  private resolveDrawUpdate(
    result: DrawResult,
    positionsOrOptions: Cartesian3[] | DrawResultUpdateOptions
  ): Required<
    Pick<
      DrawResult,
      "positions" | "renderMode" | "show" | "locked" | "editable"
    >
  > &
    Pick<DrawResult, "data" | "height" | "style" | "properties" | "metadata" | "group"> {
    const options = Array.isArray(positionsOrOptions)
      ? { positions: positionsOrOptions }
      : positionsOrOptions;
    const positions = resolveUpdatedPositions(result.type, result.positions, options);
    const data = mergeDrawData(result.data, options);
    const height = options.height
      ? normalizeOverlayHeight(options.height)
      : result.height;
    const style = options.style
      ? this.map.styles.resolveDrawStyle(result.type, options.style)
      : result.style ?? this.map.styles.resolveDrawStyle(result.type);
    const renderMode = resolveDrawRenderMode(
      result.type,
      options.renderMode ?? result.renderMode
    );
    const show = options.show ?? result.show;
    const locked = options.locked ?? result.locked;
    const editable = options.editable ?? result.editable;

    validateOverlayShape(result.id, result.type, positions, data);
    return {
      positions,
      data,
      height,
      style,
      renderMode,
      properties: options.properties ? cloneRecord(options.properties) : result.properties,
      metadata: options.metadata ? cloneRecord(options.metadata) : result.metadata,
      group: options.group ?? result.group,
      show,
      locked,
      editable
    };
  }

  private prepareSnapshots(snapshots: DrawResultSnapshot[]): PreparedDrawSnapshot[] {
    const ids = new Set<string>();
    return snapshots.map((snapshot) => {
      if (ids.has(snapshot.id)) {
        throw new Error(`Draw result snapshot id "${snapshot.id}" is duplicated.`);
      }
      ids.add(snapshot.id);

      const positions = deserializePositions(snapshot.positions);
      const data = cloneOverlayData(snapshot.data);
      if (positions.length < minPositionCount(snapshot.type)) {
        throw new Error(
          `Draw result "${snapshot.id}" requires at least ${minPositionCount(snapshot.type)} positions.`
        );
      }
      validateOverlayShape(snapshot.id, snapshot.type, positions, data);

      return {
        snapshot,
        positions,
        data,
        createdAt: parseSnapshotDate(snapshot.createdAt, "Draw result createdAt"),
        updatedAt: snapshot.updatedAt
          ? parseSnapshotDate(snapshot.updatedAt, "Draw result updatedAt")
          : undefined,
        style: this.map.styles.resolveDrawStyle(snapshot.type, snapshot.style),
        height: serializeHeightOptions(snapshot.height),
        renderMode: resolveDrawRenderMode(snapshot.type, snapshot.renderMode)
      };
    });
  }

  private restoreSnapshot(prepared: PreparedDrawSnapshot): DrawResult {
    const { snapshot, positions, data, style, height, renderMode } = prepared;
    if (positions.length < minPositionCount(snapshot.type)) {
      throw new Error(
        `Draw result "${snapshot.id}" requires at least ${minPositionCount(snapshot.type)} positions.`
      );
    }
    if (this.results.has(snapshot.id)) {
      this.remove(snapshot.id);
    }

    const entity =
      renderMode === "primitive"
        ? new Entity({ id: snapshot.id })
        : renderDrawEntity(this.map, snapshot.type, snapshot.id, positions, style, height, data);
    const primitives =
      renderMode === "primitive"
        ? renderDrawPrimitives(this.map, snapshot.type, snapshot.id, positions, style)
        : undefined;
    const result: DrawResult = {
      id: snapshot.id,
      type: snapshot.type,
      entity,
      positions,
      data,
      properties: cloneRecord(snapshot.properties),
      metadata: cloneRecord(snapshot.metadata),
      group: snapshot.group,
      show: snapshot.show ?? true,
      locked: snapshot.locked ?? false,
      editable: snapshot.editable ?? true,
      createdAt: prepared.createdAt,
      updatedAt: prepared.updatedAt,
      style,
      height,
      renderMode,
      primitives
    };

    return this.addResult(result);
  }

  private getRequired(id: string): DrawResult {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Draw result "${id}" does not exist.`);
    }
    return result;
  }
}

function renderDrawEntity(
  map: KairosMap,
  type: DrawResult["type"],
  id: string,
  positions: Cartesian3[],
  style: ResultSymbolStyle,
  height?: DrawResult["height"],
  data?: OverlayData
): Entity {
  return renderOverlayEntity(map, {
    id,
    type,
    positions,
    data,
    style,
    height
  });
}

export function renderDrawPrimitives(
  map: KairosMap,
  type: DrawResult["type"],
  id: string,
  positions: Cartesian3[],
  style: ResultSymbolStyle
) {
  if (type === "polyline") {
    return [
      createResultPolylinePrimitive(map, {
        id,
        positions,
        style: style.line
      })
    ];
  }

  if (type === "polygon") {
    return createResultPolygonPrimitives(map, {
      id,
      positions,
      style: style.polygon
    });
  }

  return undefined;
}

function resolveDrawRenderMode(
  type: DrawResult["type"],
  renderMode: DrawResultSnapshot["renderMode"]
) {
  if (type !== "polyline" && type !== "polygon") {
    return "entity";
  }
  return resolveResultRenderMode(renderMode);
}

function rerenderDrawEntity(map: KairosMap, result: DrawResult): void {
  map.viewer.entities.remove(result.entity);
  result.entity = renderDrawEntity(
    map,
    result.type,
    result.id,
    result.positions,
    result.style ?? map.styles.resolveDrawStyle(result.type),
    result.height,
    result.data
  );
}

function resolveUpdatedPositions(
  type: DrawResult["type"],
  current: Cartesian3[],
  options: DrawResultUpdateOptions
): Cartesian3[] {
  if (options.positions) {
    return clonePositions(options.positions);
  }

  const singlePosition = options.position ?? options.center;
  if (
    singlePosition &&
    (type === "point" ||
      type === "circle" ||
      type === "billboard" ||
      type === "label" ||
      type === "model" ||
      type === "ellipse" ||
      type === "box" ||
      type === "cylinder")
  ) {
    return [Cartesian3.clone(singlePosition)];
  }

  return clonePositions(current);
}

function mergeDrawData(
  current: DrawResult["data"],
  options: DrawResultUpdateOptions
): DrawResult["data"] {
  const data = {
    ...current,
    ...options.data
  };

  if (options.radius !== undefined) {
    data.radius = options.radius;
  }
  if (options.semiMajorAxis !== undefined) {
    data.semiMajorAxis = options.semiMajorAxis;
  }
  if (options.semiMinorAxis !== undefined) {
    data.semiMinorAxis = options.semiMinorAxis;
  }
  if (options.width !== undefined) {
    data.width = options.width;
  }
  if (options.minimumHeights !== undefined) {
    data.minimumHeights = [...options.minimumHeights];
  }
  if (options.maximumHeights !== undefined) {
    data.maximumHeights = [...options.maximumHeights];
  }
  if (options.dimensions !== undefined) {
    data.dimensions = cloneDimensions(options.dimensions);
  }
  if (options.length !== undefined) {
    data.length = options.length;
  }
  if (options.topRadius !== undefined) {
    data.topRadius = options.topRadius;
  }
  if (options.bottomRadius !== undefined) {
    data.bottomRadius = options.bottomRadius;
  }
  if (options.text !== undefined) {
    data.text = options.text;
  }
  if (options.image !== undefined) {
    data.image = options.image;
  }
  if (options.uri !== undefined) {
    data.uri = options.uri;
  }
  if (options.scale !== undefined) {
    data.scale = options.scale;
  }
  if (options.minimumPixelSize !== undefined) {
    data.minimumPixelSize = options.minimumPixelSize;
  }
  if (options.maximumScale !== undefined) {
    data.maximumScale = options.maximumScale;
  }
  if (options.heading !== undefined) {
    data.heading = options.heading;
  }
  if (options.pitch !== undefined) {
    data.pitch = options.pitch;
  }
  if (options.roll !== undefined) {
    data.roll = options.roll;
  }

  return Object.keys(data).length ? data : undefined;
}

function createDrawResultId(type: DrawResult["type"]): string {
  drawResultIdSeed += 1;
  return `draw-${type}-${drawResultIdSeed}`;
}

function ensureDrawResultState(result: DrawResult): void {
  result.show = result.show ?? true;
  result.locked = result.locked ?? false;
  result.editable = result.editable ?? true;
}

function applyDrawResultShow(result: DrawResult, show: boolean): void {
  result.entity.show = show;
  for (const runtime of result.primitives ?? []) {
    if (runtime.type === "polyline") {
      runtime.polyline.show = show;
    } else {
      runtime.primitive.show = show;
    }
  }
}

function cloneRecord(
  record?: Record<string, unknown>
): Record<string, unknown> | undefined {
  return record ? { ...record } : undefined;
}

function cloneDimensions(
  dimensions: [number, number, number]
): [number, number, number] {
  return [dimensions[0], dimensions[1], dimensions[2]];
}

function matchesDrawQuery(result: DrawResult, options: DrawQueryOptions): boolean {
  if (options.type !== undefined) {
    const types = Array.isArray(options.type) ? options.type : [options.type];
    if (!types.includes(result.type)) {
      return false;
    }
  }
  if (options.group !== undefined && result.group !== options.group) {
    return false;
  }
  if (options.visible !== undefined && result.show !== options.visible) {
    return false;
  }
  if (options.locked !== undefined && result.locked !== options.locked) {
    return false;
  }
  if (options.editable !== undefined && result.editable !== options.editable) {
    return false;
  }
  return true;
}
