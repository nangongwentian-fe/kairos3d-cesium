import {
  Cartesian3,
  ClippingPlane,
  ClippingPlaneCollection,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  Entity
} from "cesium";
import type { KairosMap } from "../core";
import { Evented } from "../core/events";
import {
  deserializePositions,
  deserializeVector3,
  parseSnapshotDate,
  type RuntimeResultLoadOptions,
  serializePositions,
  serializeVector3
} from "../core/serialization";
import { isRecord } from "../picking/properties";
import type { ResultSymbolStyle } from "../style";
import {
  applySymbolStyleToEntities,
  createLineGraphics,
  mergeSymbolStyles,
  parseColorLike,
  serializeSymbolStyle
} from "../style";
import type { Tool } from "../tools";
import type {
  ClippingResultSnapshot,
  ClippingPlaneOptions,
  ClippingPolygonDrawOptions,
  ClippingPolygonOptions,
  ClippingResult,
  ClippingSnapshotTarget,
  ClippingTarget,
  ClippingType
} from "./types";

type ClippingProperty = "clippingPlanes" | "clippingPolygons";

interface ResolvedClippingTarget {
  key: string;
  object: Record<string, unknown>;
  property: ClippingProperty;
}

interface ClippingRuntime {
  result: ClippingResult;
  target: ResolvedClippingTarget;
  previousCollection: unknown;
}

interface ClippingResultMeta {
  id?: string;
  createdAt?: Date;
  enabled?: boolean;
  style?: ResultSymbolStyle;
}

export interface ClippingManagerEvents {
  add: ClippingResult;
  update: ClippingResult;
  remove: ClippingResult;
  clear: ClippingResult[];
}

export class ClippingManager extends Evented<ClippingManagerEvents> {
  private readonly results = new Map<string, ClippingRuntime>();
  private readonly targetResultIds = new Map<string, string>();
  private readonly objectKeys = new WeakMap<object, string>();
  private objectKeyCounter = 0;

  constructor(private readonly map: KairosMap) {
    super();
  }

  addPlane(options: ClippingPlaneOptions): ClippingResult {
    return this.createPlaneResult(options);
  }

  addPolygon(options: ClippingPolygonOptions): ClippingResult {
    return this.createPolygonResult(options);
  }

  private createPlaneResult(
    options: ClippingPlaneOptions,
    meta: ClippingResultMeta = {}
  ): ClippingResult {
    const normal = normalizeNormal(options.normal);
    if (!Number.isFinite(options.distance)) {
      throw new Error("Plane clipping distance must be a finite number.");
    }

    const style = meta.style ?? this.map.styles.resolveClippingStyle(clippingOptionsToStyle(options));
    const collection = new ClippingPlaneCollection({
      planes: [new ClippingPlane(normal, options.distance)],
      enabled: meta.enabled ?? true,
      unionClippingRegions: options.unionClippingRegions,
      edgeColor: style.line?.color
        ? parseColorLike(style.line.color, "clipping.line.color")
        : Color.WHITE,
      edgeWidth: style.line?.width ?? 1
    });

    return this.addResult("plane", options.target, collection, [], undefined, {
      ...meta,
      style
    });
  }

  private createPolygonResult(
    options: ClippingPolygonOptions,
    meta: ClippingResultMeta = {}
  ): ClippingResult {
    const positions = clonePositions(options.positions);
    if (positions.length < 3) {
      throw new Error("Polygon clipping requires at least three positions.");
    }
    if (typeof options.quality === "number" && options.quality <= 0) {
      throw new Error("Polygon clipping quality must be greater than 0.");
    }
    if (!ClippingPolygonCollection.isSupported(this.map.viewer.scene)) {
      throw new Error("Polygon clipping is not supported by the current Cesium scene.");
    }

    const style = meta.style ?? this.map.styles.resolveClippingStyle(options.style);
    const collection = new ClippingPolygonCollection({
      polygons: [new ClippingPolygon({ positions })],
      enabled: meta.enabled ?? true,
      inverse: options.inverse,
      quality: options.quality
    });
    const entities = [renderPolygonBoundary(this.map, positions, style)];

    return this.addResult("polygon", options.target, collection, entities, positions, {
      ...meta,
      style
    });
  }

  drawPolygon(options: ClippingPolygonDrawOptions): Promise<Tool<ClippingPolygonDrawOptions>> {
    return this.map.tools.start("analysis.clipping.drawPolygon", options);
  }

  setEnabled(id: string, enabled: boolean): ClippingResult {
    const runtime = this.requireRuntime(id);
    runtime.result.collection.enabled = enabled;
    runtime.result.enabled = enabled;
    this.emit("update", runtime.result);
    return runtime.result;
  }

  setStyle(id: string, style: ResultSymbolStyle): ClippingResult {
    const runtime = this.requireRuntime(id);
    const resolved = this.map.styles.resolveClippingStyle(style);
    runtime.result.style = resolved;
    applyClippingCollectionStyle(runtime.result.collection, resolved);
    applySymbolStyleToEntities(runtime.result.entities, resolved);
    this.emit("update", runtime.result);
    return runtime.result;
  }

  get(id: string): ClippingResult | undefined {
    return this.results.get(id)?.result;
  }

  list(): ClippingResult[] {
    return [...this.results.values()].map((runtime) => runtime.result);
  }

  toJSON(): ClippingResultSnapshot[] {
    return this.list()
      .map((result) => toClippingSnapshot(result))
      .filter((snapshot): snapshot is ClippingResultSnapshot => Boolean(snapshot));
  }

  async load(
    snapshots: ClippingResultSnapshot[],
    options: RuntimeResultLoadOptions = {}
  ): Promise<ClippingResult[]> {
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  remove(id: string): boolean {
    const runtime = this.results.get(id);
    if (!runtime) {
      return false;
    }

    this.restoreRuntime(runtime);
    this.results.delete(id);
    this.targetResultIds.delete(runtime.target.key);
    this.emit("remove", runtime.result);
    this.map.tools.emitClear({ source: "clipping", ids: [id] });
    return true;
  }

  clear(): void {
    const removed = [...this.results.values()];
    for (const runtime of removed) {
      this.restoreRuntime(runtime);
      this.emit("remove", runtime.result);
    }

    this.results.clear();
    this.targetResultIds.clear();
    this.emit("clear", removed.map((runtime) => runtime.result));
    this.map.tools.emitClear({
      source: "clipping",
      ids: removed.map((runtime) => runtime.result.id)
    });
  }

  destroy(): void {
    this.clear();
    this.off();
  }

  private addResult(
    type: ClippingType,
    target: ClippingTarget,
    collection: ClippingResult["collection"],
    entities: Entity[],
    positions: Cartesian3[] | undefined,
    meta: ClippingResultMeta = {}
  ): ClippingResult {
    const resolved = this.resolveTarget(target, type);
    const existingId = this.targetResultIds.get(resolved.key);
    if (existingId) {
      this.remove(existingId);
    }

    const result: ClippingResult = {
      id: meta.id ?? createClippingId(type),
      type,
      target,
      enabled: collection.enabled,
      collection,
      positions,
      entities,
      createdAt: meta.createdAt ?? new Date(),
      style: meta.style
    };
    const runtime: ClippingRuntime = {
      result,
      target: resolved,
      previousCollection: resolved.object[resolved.property]
    };

    resolved.object[resolved.property] = collection;
    this.results.set(result.id, runtime);
    this.targetResultIds.set(resolved.key, result.id);
    this.emit("add", result);
    return result;
  }

  private restoreSnapshot(snapshot: ClippingResultSnapshot): ClippingResult {
    const meta = {
      id: snapshot.id,
      createdAt: parseSnapshotDate(snapshot.createdAt, "Clipping result createdAt"),
      enabled: snapshot.enabled,
      style: snapshot.style
    };
    const target = snapshotTargetToTarget(snapshot.target);

    if (snapshot.type === "plane") {
      return this.createPlaneResult(
        {
          target,
          normal: deserializeVector3(snapshot.normal),
          distance: snapshot.distance,
          style: snapshot.style
        },
        meta
      );
    }

    return this.createPolygonResult(
      {
        target,
        positions: deserializePositions(snapshot.positions),
        inverse: snapshot.inverse,
        quality: snapshot.quality,
        style: snapshot.style
      },
      meta
    );
  }

  private requireRuntime(id: string): ClippingRuntime {
    const runtime = this.results.get(id);
    if (!runtime) {
      throw new Error(`Clipping result "${id}" does not exist.`);
    }

    return runtime;
  }

  private restoreRuntime(runtime: ClippingRuntime): void {
    runtime.target.object[runtime.target.property] = runtime.previousCollection;
    removeEntities(this.map, runtime.result.entities);
    destroyCollection(runtime.result.collection);
  }

  private resolveTarget(target: ClippingTarget, type: ClippingType): ResolvedClippingTarget {
    const property = type === "plane" ? "clippingPlanes" : "clippingPolygons";
    const candidates = this.getTargetCandidates(target);

    for (const candidate of expandCandidates(candidates)) {
      const resolved = this.resolveCandidate(candidate, target, property);
      if (resolved) {
        return resolved;
      }
    }

    throw new Error(`Clipping target "${target.type}" does not support ${type} clipping.`);
  }

  private getTargetCandidates(target: ClippingTarget): unknown[] {
    if (target.type === "globe") {
      const globe = this.map.viewer.scene.globe;
      return globe ? [globe] : [];
    }

    if (target.type === "layer") {
      if (!target.layerId) {
        throw new Error("Layer clipping target requires layerId.");
      }

      return this.map.layers.getRuntimeObjects(target.layerId);
    }

    if (!target.result) {
      throw new Error("Picked clipping target requires result.");
    }

    return [
      target.result.primitive,
      target.result.feature,
      target.result.entity,
      target.result.object
    ].filter(Boolean);
  }

  private resolveCandidate(
    candidate: unknown,
    target: ClippingTarget,
    property: ClippingProperty
  ): ResolvedClippingTarget | undefined {
    if (!isRecord(candidate) || !(property in candidate)) {
      return undefined;
    }

    return {
      key: this.createTargetKey(target, candidate),
      object: candidate,
      property
    };
  }

  private createTargetKey(target: ClippingTarget, object: Record<string, unknown>): string {
    if (target.type === "globe") {
      return "globe";
    }
    if (target.type === "layer") {
      return `layer:${target.layerId}`;
    }

    return `picked:${this.getObjectKey(object)}`;
  }

  private getObjectKey(object: object): string {
    const existing = this.objectKeys.get(object);
    if (existing) {
      return existing;
    }

    this.objectKeyCounter += 1;
    const key = String(this.objectKeyCounter);
    this.objectKeys.set(object, key);
    return key;
  }
}

function expandCandidates(candidates: unknown[]): unknown[] {
  const expanded: unknown[] = [];
  const seen = new Set<unknown>();

  for (const candidate of candidates) {
    for (const item of expandCandidate(candidate)) {
      if (!item || seen.has(item)) {
        continue;
      }
      seen.add(item);
      expanded.push(item);
    }
  }

  return expanded;
}

function toClippingSnapshot(result: ClippingResult): ClippingResultSnapshot | undefined {
  const target = toSnapshotTarget(result.target);
  if (!target) {
    return undefined;
  }

  if (result.type === "plane") {
    const collection = result.collection as ClippingPlaneCollection;
    const plane = collection.get(0);
    return {
      id: result.id,
      type: "plane",
      target,
      enabled: result.enabled,
      normal: serializeVector3(plane.normal),
      distance: plane.distance,
      createdAt: result.createdAt.toISOString(),
      style: serializeSymbolStyle(result.style)
    };
  }

  const collection = result.collection as ClippingPolygonCollection;
  return {
    id: result.id,
    type: "polygon",
    target,
    enabled: result.enabled,
    positions: serializePositions(result.positions ?? collection.get(0).positions),
    inverse: collection.inverse,
    quality: collection.quality,
    createdAt: result.createdAt.toISOString(),
    style: serializeSymbolStyle(result.style)
  };
}

function toSnapshotTarget(target: ClippingTarget): ClippingSnapshotTarget | undefined {
  if (target.type === "globe") {
    return { type: "globe" };
  }
  if (target.type === "layer" && target.layerId) {
    return { type: "layer", layerId: target.layerId };
  }

  return undefined;
}

function snapshotTargetToTarget(target: ClippingSnapshotTarget): ClippingTarget {
  if (target.type === "globe") {
    return { type: "globe" };
  }

  return { type: "layer", layerId: target.layerId };
}

function expandCandidate(candidate: unknown): unknown[] {
  const expanded = [candidate];

  if (candidate instanceof Entity && candidate.model) {
    expanded.push(candidate.model);
  }

  if (isRecord(candidate)) {
    appendRecordValue(expanded, candidate, "tileset");
    appendRecordValue(expanded, candidate, "primitive");

    const content = candidate.content;
    if (isRecord(content)) {
      appendRecordValue(expanded, content, "tileset");
    }
  }

  return expanded;
}

function appendRecordValue(
  expanded: unknown[],
  record: Record<string, unknown>,
  key: string
): void {
  const value = record[key];
  if (value) {
    expanded.push(value);
  }
}

function normalizeNormal(normal: Cartesian3): Cartesian3 {
  const magnitude = Cartesian3.magnitude(normal);
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    throw new Error("Plane clipping normal must be a non-zero Cartesian3.");
  }

  return Cartesian3.normalize(Cartesian3.clone(normal), new Cartesian3());
}

function renderPolygonBoundary(
  map: KairosMap,
  positions: Cartesian3[],
  style: ResultSymbolStyle
): Entity {
  const closed = [...positions, positions[0]];
  return map.viewer.entities.add({
    polyline: createLineGraphics(closed, style.line)
  });
}

function removeEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    map.viewer.entities.remove(entity);
  }
}

function destroyCollection(collection: ClippingResult["collection"]): void {
  if (!collection.isDestroyed()) {
    collection.destroy();
  }
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function createClippingId(type: ClippingType): string {
  return `analysis-clipping-${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function clippingOptionsToStyle(options: ClippingPlaneOptions): ResultSymbolStyle {
  return mergeSymbolStyles(
    {
      line: {
        color: options.edgeColor,
        width: options.edgeWidth
      }
    },
    options.style
  );
}

function applyClippingCollectionStyle(
  collection: ClippingResult["collection"],
  style: ResultSymbolStyle
): void {
  if (!(collection instanceof ClippingPlaneCollection) || !style.line) {
    return;
  }

  if (style.line.color) {
    collection.edgeColor = parseColorLike(style.line.color, "clipping.line.color");
  }
  if (style.line.width !== undefined) {
    collection.edgeWidth = style.line.width;
  }
}
