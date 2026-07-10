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
import {
  removeEntityIfOwned,
  removeEntityIfOwnedTracked
} from "../core/entity-collection";
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
  createPointGraphics,
  mergeSymbolStyles,
  parseColorLike,
  serializeSymbolStyle
} from "../style";
import type { Tool } from "../tools";
import type { PreparedSceneStage } from "../scene/transaction";
import type {
  ClippingResultSnapshot,
  ClippingPlaneOptions,
  ClippingPlaneUpdateOptions,
  ClippingPolygonDrawOptions,
  ClippingPolygonOptions,
  ClippingPolygonUpdateOptions,
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

interface PreparedClippingRuntime {
  result: ClippingResult;
}

interface DetachedClippingRuntime {
  runtime: ClippingRuntime;
  collectionDetached: boolean;
  entities: Entity[];
}

interface ClippingResultMeta {
  id?: string;
  createdAt?: Date;
  enabled?: boolean;
  style?: ResultSymbolStyle;
}

type ClippingEditSnapshot =
  | {
      type: "plane";
      normal: Cartesian3;
      distance: number;
      enabled: boolean;
      style?: ResultSymbolStyle;
    }
  | {
      type: "polygon";
      positions: Cartesian3[];
      enabled: boolean;
      inverse?: boolean;
      quality?: number;
      style?: ResultSymbolStyle;
    };

interface ClippingEditState {
  id: string;
  snapshot: ClippingEditSnapshot;
  handles: Entity[];
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
  private editState?: ClippingEditState;

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

  edit(id: string): ClippingResult {
    const runtime = this.requireRuntime(id);
    this.map.tools.stop();
    this.clearEditHandles();
    this.editState = {
      id,
      snapshot: captureEditSnapshot(runtime.result),
      handles: renderEditHandles(this.map, runtime.result)
    };
    return runtime.result;
  }

  stopEdit(): ClippingResult | undefined {
    const state = this.editState;
    this.clearEditHandles();
    return state ? this.get(state.id) : undefined;
  }

  cancelEdit(): ClippingResult | undefined {
    const state = this.editState;
    if (!state) {
      return undefined;
    }

    const result =
      state.snapshot.type === "plane"
        ? this.updatePlane(state.id, state.snapshot)
        : this.updatePolygon(state.id, state.snapshot.positions, state.snapshot);
    this.clearEditHandles();
    return result;
  }

  updatePlane(id: string, options: ClippingPlaneUpdateOptions): ClippingResult {
    const runtime = this.requireRuntime(id);
    if (runtime.result.type !== "plane") {
      throw new Error(`Clipping result "${id}" is not a plane clipping result.`);
    }

    const current = runtime.result.collection as ClippingPlaneCollection;
    const currentPlane = current.get(0);
    const normal = options.normal ? normalizeNormal(options.normal) : currentPlane.normal;
    const distance = options.distance ?? currentPlane.distance;
    if (!Number.isFinite(distance)) {
      throw new Error("Plane clipping distance must be a finite number.");
    }

    const style = this.map.styles.resolveClippingStyle(
      mergeSymbolStyles(runtime.result.style, clippingUpdateOptionsToStyle(options))
    );
    const collection = new ClippingPlaneCollection({
      planes: [new ClippingPlane(normal, distance)],
      enabled: options.enabled ?? runtime.result.enabled,
      unionClippingRegions: options.unionClippingRegions ?? current.unionClippingRegions,
      edgeColor: style.line?.color
        ? parseColorLike(style.line.color, "clipping.line.color")
        : current.edgeColor,
      edgeWidth: style.line?.width ?? current.edgeWidth
    });

    return this.replaceRuntime(runtime, collection, [], undefined, style);
  }

  updatePolygon(
    id: string,
    positions: Cartesian3[],
    options: ClippingPolygonUpdateOptions = {}
  ): ClippingResult {
    const runtime = this.requireRuntime(id);
    if (runtime.result.type !== "polygon") {
      throw new Error(`Clipping result "${id}" is not a polygon clipping result.`);
    }
    if (positions.length < 3) {
      throw new Error("Polygon clipping requires at least three positions.");
    }
    if (typeof options.quality === "number" && options.quality <= 0) {
      throw new Error("Polygon clipping quality must be greater than 0.");
    }

    const current = runtime.result.collection as ClippingPolygonCollection;
    const style = this.map.styles.resolveClippingStyle(
      mergeSymbolStyles(runtime.result.style, options.style)
    );
    const nextPositions = clonePositions(positions);
    const collection = new ClippingPolygonCollection({
      polygons: [new ClippingPolygon({ positions: nextPositions })],
      enabled: options.enabled ?? runtime.result.enabled,
      inverse: options.inverse ?? current.inverse,
      quality: options.quality ?? current.quality
    });
    return this.replaceRuntime(
      runtime,
      collection,
      [renderPolygonBoundary(this.map, nextPositions, style)],
      nextPositions,
      style
    );
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
    this.prepareSnapshots(snapshots);
    if (options.clear) {
      this.clear();
    }

    return snapshots.map((snapshot) => this.restoreSnapshot(snapshot));
  }

  /** @internal */
  async prepareSceneLoad(
    snapshots: ClippingResultSnapshot[],
    options: RuntimeResultLoadOptions = {}
  ): Promise<PreparedSceneStage> {
    this.prepareSnapshots(snapshots, false);
    const clear = options.clear ?? false;
    if (!clear) {
      for (const snapshot of snapshots) {
        if (this.results.has(snapshot.id)) {
          throw new Error(
            `Clipping result "${snapshot.id}" already exists during transactional merge.`
          );
        }
      }
    }
    const staged: PreparedClippingRuntime[] = [];
    try {
      for (const snapshot of snapshots) {
        staged.push(this.createPreparedRuntime(snapshot));
      }
    } catch (error) {
      for (const item of staged) {
        destroyCollection(item.result.collection);
      }
      throw error;
    }
    const previous = clear ? [...this.results.values()] : [];
    const attachedStaged: ClippingRuntime[] = [];
    const detachedPrevious: DetachedClippingRuntime[] = [];
    let commitStarted = false;
    let mapsSwapped = false;
    let rolledBack = false;
    let finalized = false;
    let disposed = false;
    let published = false;

    return {
      phase: "clipping",
      commit: () => {
        this.assertTransactionBase(previous, staged, clear);
        const resolved = staged.map(({ result }) => ({
          result,
          target: this.resolveTarget(result.target, result.type)
        }));
        const keys = new Set<string>();
        for (const item of resolved) {
          if (keys.has(item.target.key)) {
            throw new Error(`Clipping target "${item.target.key}" is duplicated.`);
          }
          keys.add(item.target.key);
          if (!clear && this.targetResultIds.has(item.target.key)) {
            throw new Error(
              `Clipping target "${item.target.key}" already has a transactional result.`
            );
          }
        }

        commitStarted = true;
        this.clearEditHandles();
        for (const runtime of previous) {
          const detached: DetachedClippingRuntime = {
            runtime,
            collectionDetached: false,
            entities: []
          };
          detachedPrevious.push(detached);
          try {
            runtime.target.object[runtime.target.property] = runtime.previousCollection;
            detached.collectionDetached = true;
          } catch (error) {
            try {
              detached.collectionDetached =
                runtime.target.object[runtime.target.property] !== runtime.result.collection;
            } catch {
              // Keep the original assignment error.
            }
            throw error;
          }
          for (const entity of runtime.result.entities) {
            removeEntityIfOwnedTracked(
              this.map.viewer.entities,
              entity,
              detached.entities
            );
          }
        }
        for (const item of resolved) {
          const runtime: ClippingRuntime = {
            result: item.result,
            target: item.target,
            previousCollection: item.target.object[item.target.property]
          };
          attachedStaged.push(runtime);
          item.target.object[item.target.property] = item.result.collection;
          attachEntities(this.map, item.result.entities);
        }
        if (clear) {
          this.results.clear();
          this.targetResultIds.clear();
        }
        for (const runtime of attachedStaged) {
          this.results.set(runtime.result.id, runtime);
          this.targetResultIds.set(runtime.target.key, runtime.result.id);
        }
        mapsSwapped = true;
      },
      rollback: () => {
        if (!commitStarted || rolledBack || finalized || disposed) return;
        const errors: unknown[] = [];
        for (const runtime of [...attachedStaged].reverse()) {
          try { detachClippingRuntime(this.map, runtime); } catch (error) { errors.push(error); }
        }
        if (mapsSwapped) {
          for (const runtime of attachedStaged) {
            this.results.delete(runtime.result.id);
            this.targetResultIds.delete(runtime.target.key);
          }
        }
        for (const detached of detachedPrevious) {
          const runtime = detached.runtime;
          try {
            if (detached.collectionDetached) {
              runtime.target.object[runtime.target.property] = runtime.result.collection;
            }
          } catch (error) {
            errors.push(error);
          }
          for (const entity of detached.entities) {
            try {
              this.map.viewer.entities.add(entity);
            } catch (error) {
              errors.push(error);
            }
          }
        }
        for (const runtime of previous) {
          this.results.set(runtime.result.id, runtime);
          this.targetResultIds.set(runtime.target.key, runtime.result.id);
        }
        attachedStaged.length = 0;
        detachedPrevious.length = 0;
        mapsSwapped = false;
        rolledBack = true;
        if (errors.length) throw new AggregateError(errors, "Failed to roll back clipping results.");
      },
      finalize: () => {
        if (finalized) return;
        for (const runtime of previous) destroyCollection(runtime.result.collection);
        finalized = true;
      },
      dispose: () => {
        if (disposed || finalized) return;
        for (const runtime of [...attachedStaged].reverse()) {
          detachClippingRuntime(this.map, runtime);
        }
        for (const item of staged) destroyCollection(item.result.collection);
        disposed = true;
      },
      publish: () => {
        if (published) return;
        if (clear) {
          const removed = previous.map((runtime) => runtime.result);
          for (const result of removed) this.emit("remove", result);
          this.emit("clear", removed);
          this.map.tools.emitClear({ source: "clipping", ids: removed.map((item) => item.id) });
        }
        for (const item of staged) this.emit("add", item.result);
        published = true;
      }
    };
  }

  remove(id: string): boolean {
    const runtime = this.results.get(id);
    if (!runtime) {
      return false;
    }

    if (this.editState?.id === id) {
      this.clearEditHandles();
    }
    this.restoreRuntime(runtime);
    this.results.delete(id);
    this.targetResultIds.delete(runtime.target.key);
    this.emit("remove", runtime.result);
    this.map.tools.emitClear({ source: "clipping", ids: [id] });
    return true;
  }

  clear(): void {
    this.clearEditHandles();
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

  private createPreparedRuntime(snapshot: ClippingResultSnapshot): PreparedClippingRuntime {
    const target = snapshotTargetToTarget(snapshot.target);
    const createdAt = parseSnapshotDate(snapshot.createdAt, "Clipping result createdAt");
    const style = this.map.styles.resolveClippingStyle(snapshot.style);
    if (snapshot.type === "plane") {
      const collection = new ClippingPlaneCollection({
        planes: [new ClippingPlane(normalizeNormal(deserializeVector3(snapshot.normal)), snapshot.distance)],
        enabled: snapshot.enabled,
        edgeColor: style.line?.color
          ? parseColorLike(style.line.color, "clipping.line.color")
          : Color.WHITE,
        edgeWidth: style.line?.width ?? 1
      });
      return {
        result: {
          id: snapshot.id,
          type: "plane",
          target,
          enabled: snapshot.enabled,
          collection,
          entities: [],
          createdAt,
          style
        }
      };
    }

    const positions = deserializePositions(snapshot.positions);
    const collection = new ClippingPolygonCollection({
      polygons: [new ClippingPolygon({ positions })],
      enabled: snapshot.enabled,
      inverse: snapshot.inverse,
      quality: snapshot.quality
    });
    return {
      result: {
        id: snapshot.id,
        type: "polygon",
        target,
        enabled: snapshot.enabled,
        collection,
        positions,
        entities: [createPolygonBoundary(positions, style)],
        createdAt,
        style
      }
    };
  }

  private assertTransactionBase(
    previous: ClippingRuntime[],
    staged: PreparedClippingRuntime[],
    clear: boolean
  ): void {
    if (clear && this.results.size !== previous.length) {
      throw new Error("Clipping results changed after transactional preparation.");
    }
    for (const runtime of previous) {
      if (this.results.get(runtime.result.id) !== runtime) {
        throw new Error(
          `Clipping result "${runtime.result.id}" changed after transactional preparation.`
        );
      }
    }
    if (!clear) {
      for (const item of staged) {
        if (this.results.has(item.result.id)) {
          throw new Error(
            `Clipping result "${item.result.id}" changed after transactional preparation.`
          );
        }
      }
    }
  }

  private prepareSnapshots(
    snapshots: ClippingResultSnapshot[],
    resolveTargets = true
  ): void {
    const ids = new Set<string>();
    for (const snapshot of snapshots) {
      if (ids.has(snapshot.id)) {
        throw new Error(`Clipping result snapshot id "${snapshot.id}" is duplicated.`);
      }
      ids.add(snapshot.id);
      parseSnapshotDate(snapshot.createdAt, "Clipping result createdAt");
      const target = snapshotTargetToTarget(snapshot.target);
      if (resolveTargets) {
        this.resolveTarget(target, snapshot.type);
      }

      if (snapshot.type === "plane") {
        normalizeNormal(deserializeVector3(snapshot.normal));
        if (!Number.isFinite(snapshot.distance)) {
          throw new Error("Plane clipping distance must be a finite number.");
        }
        this.map.styles.resolveClippingStyle(snapshot.style);
      } else {
        const positions = deserializePositions(snapshot.positions);
        if (positions.length < 3) {
          throw new Error("Polygon clipping requires at least three positions.");
        }
        if (typeof snapshot.quality === "number" && snapshot.quality <= 0) {
          throw new Error("Polygon clipping quality must be greater than 0.");
        }
        if (!ClippingPolygonCollection.isSupported(this.map.viewer.scene)) {
          throw new Error("Polygon clipping is not supported by the current Cesium scene.");
        }
        this.map.styles.resolveClippingStyle(snapshot.style);
      }
    }
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

  private replaceRuntime(
    runtime: ClippingRuntime,
    collection: ClippingResult["collection"],
    entities: Entity[],
    positions: Cartesian3[] | undefined,
    style: ResultSymbolStyle
  ): ClippingResult {
    removeEntities(this.map, runtime.result.entities);
    destroyCollection(runtime.result.collection);
    runtime.target.object[runtime.target.property] = collection;
    runtime.result.collection = collection;
    runtime.result.enabled = collection.enabled;
    runtime.result.entities = entities;
    runtime.result.positions = positions;
    runtime.result.style = style;
    this.refreshEditHandles(runtime.result);
    this.emit("update", runtime.result);
    return runtime.result;
  }

  private refreshEditHandles(result: ClippingResult): void {
    if (!this.editState || this.editState.id !== result.id) {
      return;
    }

    removeEntities(this.map, this.editState.handles);
    this.editState = {
      ...this.editState,
      handles: renderEditHandles(this.map, result)
    };
  }

  private clearEditHandles(): void {
    if (!this.editState) {
      return;
    }
    removeEntities(this.map, this.editState.handles);
    this.editState = undefined;
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
  const entity = createPolygonBoundary(positions, style);
  map.viewer.entities.add(entity);
  return entity;
}

function createPolygonBoundary(
  positions: Cartesian3[],
  style: ResultSymbolStyle
): Entity {
  const closed = [...positions, positions[0]];
  return new Entity({
    polyline: createLineGraphics(closed, style.line)
  });
}

function removeEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    removeEntityIfOwned(map.viewer.entities, entity);
  }
}

function attachEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    map.viewer.entities.add(entity);
  }
}

function detachClippingRuntime(map: KairosMap, runtime: ClippingRuntime): void {
  runtime.target.object[runtime.target.property] = runtime.previousCollection;
  removeEntities(map, runtime.result.entities);
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

function captureEditSnapshot(result: ClippingResult): ClippingEditSnapshot {
  if (result.type === "plane") {
    const collection = result.collection as ClippingPlaneCollection;
    const plane = collection.get(0);
    return {
      type: "plane",
      normal: Cartesian3.clone(plane.normal),
      distance: plane.distance,
      enabled: result.enabled,
      style: result.style
    };
  }

  const collection = result.collection as ClippingPolygonCollection;
  return {
    type: "polygon",
    positions: clonePositions(result.positions ?? collection.get(0).positions),
    enabled: result.enabled,
    inverse: collection.inverse,
    quality: collection.quality,
    style: result.style
  };
}

function renderEditHandles(map: KairosMap, result: ClippingResult): Entity[] {
  const style = mergeSymbolStyles(
    {
      point: { color: "#ffd400", pixelSize: 10, outlineColor: "#000000", outlineWidth: 1 }
    },
    result.style
  );

  if (result.type === "plane") {
    const collection = result.collection as ClippingPlaneCollection;
    const plane = collection.get(0);
    const distance = Math.abs(plane.distance) > 0 ? plane.distance : 1;
    return [
      map.viewer.entities.add({
        position: Cartesian3.multiplyByScalar(plane.normal, distance, new Cartesian3()),
        point: createPointGraphics(style.point)
      })
    ];
  }

  const collection = result.collection as ClippingPolygonCollection;
  const positions = result.positions ?? collection.get(0).positions;
  return positions.map((position) =>
    map.viewer.entities.add({
      position,
      point: createPointGraphics(style.point)
    })
  );
}

function clippingUpdateOptionsToStyle(options: ClippingPlaneUpdateOptions): ResultSymbolStyle {
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
