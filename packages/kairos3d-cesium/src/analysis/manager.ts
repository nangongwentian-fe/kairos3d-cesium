import {
  Cartesian3,
  ConstantProperty,
  Entity
} from "cesium";
import type { KairosMap } from "../core";
import {
  assertRuntimeMutationAllowed,
  getRuntimeLeaseOwner,
  runWithRuntimeLease,
  runWithRuntimeWriteLease,
  withRuntimeLeaseOwner,
  type RuntimeLeaseOwnerToken
} from "../concurrency/lease";
import {
  removeEntityIfOwned,
  removeEntityIfOwnedTracked
} from "../core/entity-collection";
import { Evented } from "../core/events";
import {
  deserializePosition,
  deserializePositions,
  parseSnapshotDate,
  serializePosition,
  serializePositions
} from "../core/serialization";
import type { Tool } from "../tools";
import type { ResultSymbolStyle } from "../style";
import {
  runOrReuseOperation,
  type OperationContext
} from "../operations/manager";
import type { AsyncOperationOptions } from "../operations/types";
import {
  applyHeightOptionsToEntity,
  lineStyleWithHeight,
  serializeHeightOptions
} from "../height";
import {
  createLabelGraphics,
  createLineGraphics,
  createPointGraphics,
  createPolygonGraphics,
  mergeSymbolStyles,
  serializeSymbolStyle
} from "../style";
import {
  attachResultPrimitiveRuntimes,
  createDetachedResultPolygonPrimitives,
  createDetachedResultPolylinePrimitive,
  createResultPolygonPrimitives,
  createResultPolylinePrimitive,
  destroyResultPrimitiveRuntimes,
  detachResultPrimitiveRuntimes,
  removeResultPrimitiveRuntimes,
  resolveResultRenderMode,
  type ResultPrimitiveRuntime,
  type ResultRenderMode
} from "../primitives";
import type {
  PreparedSceneStage,
  ScenePreflightResult
} from "../scene/transaction";
import {
  ClippingManager,
  type ClippingScenePreflightContext,
  type ClippingScenePreflightToken
} from "./clipping";
import {
  TerrainAnalysisManager,
  type TerrainScenePreflightToken
} from "./terrain";
import {
  chooseNearestVisibilityBlock,
  classifySceneVisibility,
  classifyVisibility,
  interpolateVisibilitySamples,
  type VisibilityClassification
} from "./visibility-utils";
import {
  createProfileSamples,
  getProfileHeightRange,
  interpolateProfilePoints,
  sampleGroundCartographics
} from "./profile-utils";
import {
  assertFiniteSnapshotNumber,
  assertNonEmptySnapshotId,
  assertNonNegativeSnapshotNumber,
  assertOptionalSnapshotEnum,
  assertOptionalSnapshotString,
  assertSerializablePosition,
  assertSerializablePositions,
  assertSnapshotArray,
  assertSnapshotBoolean,
  assertSnapshotDate,
  assertSnapshotEnum,
  assertSnapshotRecord,
  cloneAndFreezeSnapshot,
  freezePreparedArray
} from "./snapshot-validation";
import type {
  AnalysisResultLoadOptions,
  AnalysisResultsSnapshot,
  MeasureResult,
  MeasureResultSnapshot,
  MeasureToolOptions,
  ProfileComputeOptions,
  ProfileDrawOptions,
  ProfileResult,
  ProfileResultSnapshot,
  ProfileSampleSnapshot,
  VisibilityComputeOptions,
  VisibilityPickOptions,
  VisibilityResult,
  VisibilityResultSnapshot
} from "./types";

export interface AnalysisScenePreflightContext {
  readonly availableLayerIds?: ReadonlySet<string>;
}

/** @internal Parsed, validation-only state for one Scene analysis prepare. */
export interface AnalysisScenePreflightToken {
  readonly owner: AnalysisManager;
  readonly measure: readonly PreparedMeasureSnapshot[];
  readonly visibility: readonly PreparedVisibilitySnapshot[];
  readonly profile: readonly PreparedProfileSnapshot[];
  readonly terrain: TerrainScenePreflightToken;
  readonly clipping: ClippingScenePreflightToken;
}

const consumedAnalysisPreflightTokens = new WeakSet<AnalysisScenePreflightToken>();

export class AnalysisManager {
  readonly measure: MeasureManager;
  readonly visibility: VisibilityManager;
  readonly profile: ProfileManager;
  readonly clipping: ClippingManager;
  readonly terrain: TerrainAnalysisManager;

  constructor(private readonly map: KairosMap) {
    this.measure = new MeasureManager(map);
    this.visibility = new VisibilityManager(map);
    this.profile = new ProfileManager(map);
    this.clipping = new ClippingManager(map);
    this.terrain = new TerrainAnalysisManager(map);
  }

  destroy(): void {
    this.measure.destroy();
    this.visibility.destroy();
    this.profile.destroy();
    this.clipping.destroy();
    this.terrain.destroy();
  }

  toJSON(): AnalysisResultsSnapshot {
    return {
      measure: this.measure.toJSON(),
      visibility: this.visibility.toJSON(),
      profile: this.profile.toJSON(),
      clipping: this.clipping.toJSON(),
      terrain: this.terrain.toJSON()
    };
  }

  async load(
    snapshot: AnalysisResultsSnapshot,
    options: AnalysisResultLoadOptions = {}
  ): Promise<void> {
    await runWithRuntimeLease(
      this.map.concurrency,
      analysisLeaseRequest("analysis.load", options),
      async (lease) => {
        const childOptions = withRuntimeLeaseOwner(
          { clear: options.clear ?? false },
          lease.ownerToken
        );
        await this.measure.load(snapshot.measure, childOptions);
        await this.visibility.load(snapshot.visibility, childOptions);
        await this.profile.load(snapshot.profile, childOptions);
        await this.clipping.load(snapshot.clipping, childOptions);
        await this.terrain.load(snapshot.terrain ?? [], childOptions);
      }
    );
  }

  /** @internal */
  preflightSceneLoad(
    snapshot: AnalysisResultsSnapshot,
    options: AnalysisResultLoadOptions = {},
    context: AnalysisScenePreflightContext = {}
  ): ScenePreflightResult {
    assertAnalysisMutation(
      this.map,
      "scene.analysis.preflight",
      getRuntimeLeaseOwner(options)
    );
    assertAnalysisSnapshotStructure(snapshot);
    const clippingContext: ClippingScenePreflightContext = {
      availableLayerIds: context.availableLayerIds
    };
    const token: AnalysisScenePreflightToken = Object.freeze({
      owner: this,
      measure: this.measure.preflightSceneLoad(snapshot.measure, options),
      visibility: this.visibility.preflightSceneLoad(snapshot.visibility, options),
      profile: this.profile.preflightSceneLoad(snapshot.profile, options),
      terrain: this.terrain.preflightSceneLoad(snapshot.terrain ?? [], options),
      clipping: this.clipping.preflightSceneLoad(
        snapshot.clipping,
        options,
        clippingContext
      )
    });
    return { phase: "analysis", value: token };
  }

  /** @internal */
  async prepareSceneLoad(
    snapshot: AnalysisResultsSnapshot,
    options: AnalysisResultLoadOptions = {},
    preflight?: AnalysisScenePreflightToken
  ): Promise<PreparedSceneStage> {
    assertAnalysisMutation(
      this.map,
      "scene.analysis.prepare",
      getRuntimeLeaseOwner(options)
    );
    const token = preflight ?? this.preflightSceneLoad(snapshot, options).value as
      | AnalysisScenePreflightToken
      | undefined;
    if (!token || token.owner !== this) {
      throw new Error("Analysis Scene preflight token belongs to another manager.");
    }
    if (consumedAnalysisPreflightTokens.has(token)) {
      throw new Error("Analysis Scene preflight token has already been consumed.");
    }
    consumedAnalysisPreflightTokens.add(token);
    const stages: PreparedSceneStage[] = [];
    try {
      stages.push(await this.measure.prepareSceneLoad(snapshot.measure, options, token.measure));
      stages.push(await this.visibility.prepareSceneLoad(
        snapshot.visibility,
        options,
        token.visibility
      ));
      stages.push(await this.profile.prepareSceneLoad(snapshot.profile, options, token.profile));
      stages.push(await this.terrain.prepareSceneLoad(
        snapshot.terrain ?? [],
        options,
        token.terrain
      ));
      stages.push(await this.clipping.prepareSceneLoad(
        snapshot.clipping,
        options,
        token.clipping
      ));
    } catch (error) {
      await runStagesBestEffort([...stages].reverse(), "dispose");
      throw error;
    }

    const attempted: PreparedSceneStage[] = [];
    return {
      phase: "analysis",
      commit: async () => {
        for (const stage of stages) {
          attempted.push(stage);
          await stage.commit();
        }
      },
      rollback: async () => {
        await runStagesBestEffort([...attempted].reverse(), "rollback");
      },
      finalize: async () => {
        await runStagesBestEffort(stages, "finalize");
      },
      dispose: async () => {
        await runStagesBestEffort([...stages].reverse(), "dispose");
      },
      publish: () => {
        for (const stage of stages) {
          stage.publish();
        }
      }
    };
  }
}

export interface MeasureManagerEvents {
  add: MeasureResult;
  remove: MeasureResult;
  clear: MeasureResult[];
}

interface PreparedMeasureSnapshot {
  readonly snapshot: MeasureResultSnapshot;
  readonly positions: Cartesian3[];
  readonly createdAt: Date;
  readonly style: ResultSymbolStyle;
  readonly height?: MeasureResult["height"];
  readonly renderMode: NonNullable<MeasureResult["renderMode"]>;
}

export class MeasureManager extends Evented<MeasureManagerEvents> {
  private readonly results = new Map<string, MeasureResult>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  distance(options?: MeasureToolOptions): Promise<Tool<MeasureToolOptions>> {
    return this.map.tools.start("measure.distance", options);
  }

  area(options?: MeasureToolOptions): Promise<Tool<MeasureToolOptions>> {
    return this.map.tools.start("measure.area", options);
  }

  height(options?: MeasureToolOptions): Promise<Tool<MeasureToolOptions>> {
    return this.map.tools.start("measure.height", options);
  }

  addResult(result: MeasureResult): MeasureResult {
    return runAnalysisMutation(this.map, "analysis.measure.addResult", () =>
      this.addResultInternal(result)
    );
  }

  private addResultInternal(result: MeasureResult): MeasureResult {
    const existing = this.results.get(result.id);
    if (existing === result) {
      return result;
    }
    if (existing) {
      this.removeInternal(result.id);
    }
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): MeasureResult | undefined {
    return this.results.get(id);
  }

  list(): MeasureResult[] {
    return [...this.results.values()];
  }

  toJSON(): MeasureResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: result.type,
      positions: serializePositions(result.positions),
      value: result.value,
      unit: result.unit,
      label: result.label,
      createdAt: result.createdAt.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height),
      mode: result.mode,
      renderMode: result.renderMode === "primitive" ? "primitive" : undefined
    }));
  }

  async load(
    snapshots: MeasureResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): Promise<MeasureResult[]> {
    return runWithRuntimeLease(
      this.map.concurrency,
      analysisLeaseRequest("analysis.measure.load", options),
      () => {
        const prepared = this.prepareSnapshots(snapshots);
        if (options.clear) this.clearInternal();
        return prepared.map((snapshot) => this.restoreSnapshot(snapshot));
      }
    );
  }

  /** @internal */
  preflightSceneLoad(
    snapshots: MeasureResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): readonly PreparedMeasureSnapshot[] {
    const prepared = this.prepareSnapshots(snapshots);
    if (!options.clear) {
      assertNoResultConflicts(this.results, prepared.map((item) => item.snapshot.id), "Measure");
    }
    return freezePreparedArray(prepared);
  }

  /** @internal */
  async prepareSceneLoad(
    snapshots: MeasureResultSnapshot[],
    options: AnalysisResultLoadOptions = {},
    preflight?: readonly PreparedMeasureSnapshot[]
  ): Promise<PreparedSceneStage> {
    const prepared = preflight ?? this.preflightSceneLoad(snapshots, options);
    const staged: MeasureResult[] = [];
    try {
      for (const item of prepared) {
        staged.push(this.createPreparedResult(item));
      }
    } catch (error) {
      for (const result of staged) {
        destroyResultPrimitiveRuntimes(result.primitives);
      }
      throw error;
    }
    return createEntityResultStage({
      phase: "measure",
      label: "Measure",
      source: "measure",
      map: this.map,
      results: this.results,
      staged,
      clear: options.clear ?? false,
      getEntities: (result) => result.entities,
      getPrimitives: (result) => result.primitives,
      emitRemove: (result) => this.emit("remove", result),
      emitClear: (results) => this.emit("clear", results),
      emitAdd: (result) => this.emit("add", result)
    });
  }

  setStyle(id: string, style: ResultSymbolStyle): MeasureResult {
    return runAnalysisMutation(this.map, "analysis.measure.setStyle", () => {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Measure result "${id}" does not exist.`);
    }

    removeMeasureRuntime(this.map, result);
    result.style = this.map.styles.resolveMeasureStyle(result.type, style);
    const rendered = renderMeasureResult(
      this.map,
      result,
      result.positions,
      result.style,
      result.height,
      result.renderMode
    );
    result.entities = rendered.entities;
    result.primitives = rendered.primitives;
    result.entityIds = result.entities.map((entity) => entity.id);
    return result;
    });
  }

  remove(id: string): boolean {
    return runAnalysisMutation(this.map, "analysis.measure.remove", () =>
      this.removeInternal(id)
    );
  }

  private removeInternal(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    removeMeasureRuntime(this.map, result);
    this.results.delete(id);
    this.emit("remove", result);
    this.map.tools.emitClear({ source: "measure", ids: [id] });
    return true;
  }

  clear(): void {
    runAnalysisMutation(this.map, "analysis.measure.clear", () => this.clearInternal());
  }

  private clearInternal(): void {
    const removed = [...this.results.values()];
    for (const result of removed) {
      removeMeasureRuntime(this.map, result);
      this.emit("remove", result);
    }

    this.results.clear();
    this.emit("clear", removed);
    this.map.tools.emitClear({ source: "measure", ids: removed.map((result) => result.id) });
  }

  stop(): void {
    this.map.tools.stop();
  }

  destroy(): void {
    this.clearInternal();
    this.off();
  }

  private prepareSnapshots(snapshots: MeasureResultSnapshot[]): PreparedMeasureSnapshot[] {
    assertSnapshotArray(snapshots, "Measure result snapshots");
    const ids = new Set<string>();
    return snapshots.map((snapshot) => {
      assertSnapshotRecord(snapshot, "Measure result snapshot");
      assertNonEmptySnapshotId(snapshot.id, "Measure result snapshot id");
      if (ids.has(snapshot.id)) {
        throw new Error(`Measure result snapshot id "${snapshot.id}" is duplicated.`);
      }
      ids.add(snapshot.id);
      assertSnapshotEnum(snapshot.type, ["distance", "area", "height"], "Measure result type");
      assertSerializablePositions(
        snapshot.positions,
        "Measure result positions",
        0
      );
      assertFiniteSnapshotNumber(snapshot.value, "Measure result value");
      assertOptionalSnapshotString(snapshot.label, "Measure result label");
      assertSnapshotDate(snapshot.createdAt, "Measure result createdAt");
      assertOptionalSnapshotEnum(snapshot.renderMode, ["entity", "primitive"], "Measure renderMode");
      validateMeasureUnitAndMode(snapshot);
      const positions = deserializePositions(snapshot.positions);
      validateMeasurePositions(snapshot.type, positions);

      return {
        snapshot: cloneAndFreezeSnapshot(snapshot),
        positions,
        createdAt: parseSnapshotDate(snapshot.createdAt, "Measure result createdAt"),
        style: this.map.styles.resolveMeasureStyle(snapshot.type, snapshot.style),
        height: serializeHeightOptions(snapshot.height),
        renderMode: resolveMeasureRenderMode(snapshot.type, snapshot.renderMode)
      };
    });
  }

  private restoreSnapshot(prepared: PreparedMeasureSnapshot): MeasureResult {
    const result = this.createPreparedResult(prepared);
    if (this.results.has(result.id)) {
      this.removeInternal(result.id);
    }
    attachEntityResultRuntime(this.map, result.entities, result.primitives);
    return this.addResultInternal(result);
  }

  private createPreparedResult(prepared: PreparedMeasureSnapshot): MeasureResult {
    const { snapshot, positions, style, height, renderMode } = prepared;
    const rendered = createMeasureResultRuntime(
      snapshot,
      positions,
      style,
      height,
      renderMode
    );
    return {
      id: snapshot.id,
      type: snapshot.type,
      positions,
      value: snapshot.value,
      unit: snapshot.unit,
      label: snapshot.label,
      entities: rendered.entities,
      entityIds: rendered.entities.map((entity) => entity.id),
      createdAt: prepared.createdAt,
      style,
      height,
      mode: snapshot.mode,
      renderMode,
      primitives: rendered.primitives
    };
  }
}

export interface VisibilityManagerEvents {
  add: VisibilityResult;
  remove: VisibilityResult;
  clear: VisibilityResult[];
}

interface PreparedVisibilitySnapshot {
  readonly snapshot: VisibilityResultSnapshot;
  readonly start: Cartesian3;
  readonly end: Cartesian3;
  readonly blockedPosition?: Cartesian3;
  readonly createdAt: Date;
  readonly style: ResultSymbolStyle;
  readonly height?: VisibilityResult["height"];
}

export class VisibilityManager extends Evented<VisibilityManagerEvents> {
  private readonly results = new Map<string, VisibilityResult>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  pick(options?: VisibilityPickOptions): Promise<Tool<VisibilityPickOptions>> {
    return this.map.tools.start("analysis.visibility.pick", options);
  }

  compute(
    options: VisibilityComputeOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<VisibilityResult> {
    let renderedResult: VisibilityResult | undefined;
    return runOrReuseOperation(
      this.map.operations,
      { kind: "analysis.visibility" },
      operationOptions,
      async (operation) => {
        return runWithRuntimeLease(
          this.map.concurrency,
          analysisLeaseRequest("analysis.visibility", operationOptions, operation),
          async () => {
            try {
        reportOperationProgress(operation, 0.05, "height");
        const [start, end] = options.height
          ? await this.map.height.resolvePositions([options.start, options.end], options.height)
          : [Cartesian3.clone(options.start), Cartesian3.clone(options.end)];
        operation.throwIfAborted();
        const mode = options.occlusionMode ?? "terrain";
        let classification: VisibilityClassification = { visible: true };

        if (mode === "terrain" || mode === "terrain-and-scene") {
          reportOperationProgress(operation, 0.25, "terrain-sampling");
          const samples = interpolateVisibilitySamples(start, end, options.sampleCount);
          const ground = await sampleGroundCartographics(
            this.map.viewer.terrainProvider,
            samples.map((sample) => sample.cartographic)
          );
          operation.throwIfAborted();
          reportOperationProgress(operation, 0.6, "classify-terrain");
          classification = classifyVisibility(samples, ground, options.heightTolerance);
        }

        if (mode === "scene" || mode === "terrain-and-scene") {
          reportOperationProgress(operation, 0.75, "classify-scene");
          const sceneClassification = classifySceneVisibility(
            this.map.viewer.scene,
            start,
            end,
            options.exclude
          );
          classification =
            mode === "terrain-and-scene"
              ? chooseNearestVisibilityBlock(start, classification, sceneClassification)
              : sceneClassification;
        }

        reportOperationProgress(operation, 0.9, "render");
        const result = this.createResult(options, classification, [start, end]);
        renderedResult = result;
        operation.throwIfAborted();
        const added = this.addResultInternal(result);
        await Promise.resolve();
        operation.throwIfAborted();
        return added;
            } catch (error) {
              if (renderedResult) {
                if (this.results.get(renderedResult.id) === renderedResult) {
                  this.removeInternal(renderedResult.id);
                } else {
                  removeEntities(this.map, renderedResult.entities);
                }
                renderedResult = undefined;
              }
              throw error;
            }
          }
        );
      }
    ).catch((error) => {
      if (renderedResult) {
        if (this.results.get(renderedResult.id) === renderedResult) {
          this.remove(renderedResult.id);
        } else {
          removeEntities(this.map, renderedResult.entities);
        }
      }
      throw error;
    });
  }

  addResult(result: VisibilityResult): VisibilityResult {
    return runAnalysisMutation(this.map, "analysis.visibility.addResult", () =>
      this.addResultInternal(result)
    );
  }

  private addResultInternal(result: VisibilityResult): VisibilityResult {
    const existing = this.results.get(result.id);
    if (existing === result) {
      return result;
    }
    if (existing) {
      this.removeInternal(result.id);
    }
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): VisibilityResult | undefined {
    return this.results.get(id);
  }

  list(): VisibilityResult[] {
    return [...this.results.values()];
  }

  toJSON(): VisibilityResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: "visibility",
      positions: [
        serializePosition(result.positions[0]),
        serializePosition(result.positions[1])
      ],
      visible: result.visible,
      distance: result.distance,
      blockedPosition: result.blockedPosition
        ? serializePosition(result.blockedPosition)
        : undefined,
      blockedBy: result.blockedBy,
      createdAt: result.createdAt.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height)
    }));
  }

  async load(
    snapshots: VisibilityResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): Promise<VisibilityResult[]> {
    return runWithRuntimeLease(
      this.map.concurrency,
      analysisLeaseRequest("analysis.visibility.load", options),
      () => {
        const prepared = this.prepareSnapshots(snapshots);
        if (options.clear) this.clearInternal();
        return prepared.map((snapshot) => this.restoreSnapshot(snapshot));
      }
    );
  }

  /** @internal */
  preflightSceneLoad(
    snapshots: VisibilityResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): readonly PreparedVisibilitySnapshot[] {
    const prepared = this.prepareSnapshots(snapshots);
    if (!options.clear) {
      assertNoResultConflicts(this.results, prepared.map((item) => item.snapshot.id), "Visibility");
    }
    return freezePreparedArray(prepared);
  }

  /** @internal */
  async prepareSceneLoad(
    snapshots: VisibilityResultSnapshot[],
    options: AnalysisResultLoadOptions = {},
    preflight?: readonly PreparedVisibilitySnapshot[]
  ): Promise<PreparedSceneStage> {
    const prepared = preflight ?? this.preflightSceneLoad(snapshots, options);
    const staged = prepared.map((item) =>
      this.createPreparedResult(item)
    );
    return createEntityResultStage({
      phase: "visibility",
      label: "Visibility",
      source: "visibility",
      map: this.map,
      results: this.results,
      staged,
      clear: options.clear ?? false,
      getEntities: (result) => result.entities,
      emitRemove: (result) => this.emit("remove", result),
      emitClear: (results) => this.emit("clear", results),
      emitAdd: (result) => this.emit("add", result)
    });
  }

  setStyle(id: string, style: ResultSymbolStyle): VisibilityResult {
    return runAnalysisMutation(this.map, "analysis.visibility.setStyle", () => {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Visibility result "${id}" does not exist.`);
    }

    removeEntities(this.map, result.entities);
    result.style = this.map.styles.resolveVisibilityStyle(style);
    result.entities = renderVisibilityEntities(
      this.map,
      result.positions[0],
      result.positions[1],
      result.blockedPosition,
      result.style,
      result.height
    );
    return result;
    });
  }

  remove(id: string): boolean {
    return runAnalysisMutation(this.map, "analysis.visibility.remove", () =>
      this.removeInternal(id)
    );
  }

  private removeInternal(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    removeEntities(this.map, result.entities);
    this.results.delete(id);
    this.emit("remove", result);
    this.map.tools.emitClear({ source: "visibility", ids: [id] });
    return true;
  }

  clear(): void {
    runAnalysisMutation(this.map, "analysis.visibility.clear", () => this.clearInternal());
  }

  private clearInternal(): void {
    const removed = [...this.results.values()];
    for (const result of removed) {
      removeEntities(this.map, result.entities);
      this.emit("remove", result);
    }

    this.results.clear();
    this.emit("clear", removed);
    this.map.tools.emitClear({
      source: "visibility",
      ids: removed.map((result) => result.id)
    });
  }

  destroy(): void {
    this.clearInternal();
    this.off();
  }

  private prepareSnapshots(snapshots: VisibilityResultSnapshot[]): PreparedVisibilitySnapshot[] {
    assertSnapshotArray(snapshots, "Visibility result snapshots");
    const ids = new Set<string>();
    return snapshots.map((snapshot) => {
      assertSnapshotRecord(snapshot, "Visibility result snapshot");
      assertNonEmptySnapshotId(snapshot.id, "Visibility result snapshot id");
      if (ids.has(snapshot.id)) {
        throw new Error(`Visibility result snapshot id "${snapshot.id}" is duplicated.`);
      }
      ids.add(snapshot.id);
      assertSnapshotEnum(snapshot.type, ["visibility"], "Visibility result type");
      assertSerializablePositions(snapshot.positions, "Visibility result positions", 2, 2);
      assertSnapshotBoolean(snapshot.visible, "Visibility result visible");
      assertNonNegativeSnapshotNumber(snapshot.distance, "Visibility result distance");
      if (snapshot.blockedPosition !== undefined) {
        assertSerializablePosition(snapshot.blockedPosition, "Visibility blockedPosition");
      }
      assertOptionalSnapshotEnum(
        snapshot.blockedBy,
        ["terrain", "scene"],
        "Visibility blockedBy"
      );
      if (snapshot.visible && (snapshot.blockedPosition || snapshot.blockedBy)) {
        throw new Error("Visible visibility snapshots cannot contain blockedPosition or blockedBy.");
      }
      assertSnapshotDate(snapshot.createdAt, "Visibility result createdAt");

      return {
        snapshot: cloneAndFreezeSnapshot(snapshot),
        start: deserializePosition(snapshot.positions[0]),
        end: deserializePosition(snapshot.positions[1]),
        blockedPosition: snapshot.blockedPosition
          ? deserializePosition(snapshot.blockedPosition)
          : undefined,
        createdAt: parseSnapshotDate(snapshot.createdAt, "Visibility result createdAt"),
        style: this.map.styles.resolveVisibilityStyle(snapshot.style),
        height: serializeHeightOptions(snapshot.height)
      };
    });
  }

  private restoreSnapshot(prepared: PreparedVisibilitySnapshot): VisibilityResult {
    const result = this.createPreparedResult(prepared);
    if (this.results.has(result.id)) {
      this.removeInternal(result.id);
    }
    attachEntities(this.map, result.entities);
    return this.addResultInternal(result);
  }

  private createPreparedResult(prepared: PreparedVisibilitySnapshot): VisibilityResult {
    const { snapshot, start, end, blockedPosition, style, height } = prepared;
    const entities = createVisibilityEntities(start, end, blockedPosition, style, height);
    return {
      id: snapshot.id,
      type: "visibility",
      positions: [start, end],
      visible: snapshot.visible,
      distance: snapshot.distance,
      blockedPosition,
      blockedBy: snapshot.blockedBy,
      entities,
      createdAt: prepared.createdAt,
      style,
      height
    };
  }

  private createResult(
    options: VisibilityComputeOptions,
    classification: VisibilityClassification,
    positions: [Cartesian3, Cartesian3]
  ): VisibilityResult {
    const id = createAnalysisId("visibility");
    const start = Cartesian3.clone(positions[0]);
    const end = Cartesian3.clone(positions[1]);
    const blockedPosition = classification.blockedPosition
      ? Cartesian3.clone(classification.blockedPosition)
      : undefined;
    const style = this.map.styles.resolveVisibilityStyle(visibilityOptionsToStyle(options));
    const entities = renderVisibilityEntities(
      this.map,
      start,
      end,
      blockedPosition,
      style,
      options.height
    );

    return {
      id,
      type: "visibility",
      positions: [start, end],
      visible: classification.visible,
      distance: Cartesian3.distance(start, end),
      blockedPosition,
      blockedBy: classification.blockedBy,
      blockedObject: classification.blockedObject,
      entities,
      createdAt: new Date(),
      style,
      height: serializeHeightOptions(options.height)
    };
  }
}

export interface ProfileManagerEvents {
  add: ProfileResult;
  remove: ProfileResult;
  clear: ProfileResult[];
}

interface PreparedProfileSnapshot {
  readonly snapshot: ProfileResultSnapshot;
  readonly positions: Cartesian3[];
  readonly samples: ReturnType<typeof deserializeProfileSample>[];
  readonly createdAt: Date;
  readonly style: ResultSymbolStyle;
  readonly height?: ProfileResult["height"];
}

export class ProfileManager extends Evented<ProfileManagerEvents> {
  private readonly results = new Map<string, ProfileResult>();

  constructor(private readonly map: KairosMap) {
    super();
  }

  draw(options?: ProfileDrawOptions): Promise<Tool<ProfileDrawOptions>> {
    return this.map.tools.start("analysis.profile.draw", options);
  }

  compute(
    options: ProfileComputeOptions,
    operationOptions?: AsyncOperationOptions
  ): Promise<ProfileResult> {
    let renderedResult: ProfileResult | undefined;
    return runOrReuseOperation(
      this.map.operations,
      { kind: "analysis.profile" },
      operationOptions,
      async (operation) => {
        return runWithRuntimeLease(
          this.map.concurrency,
          analysisLeaseRequest("analysis.profile", operationOptions, operation),
          async () => {
            try {
        reportOperationProgress(operation, 0.05, "height");
        const positions = options.height
          ? await this.map.height.resolvePositions(options.positions, options.height)
          : clonePositions(options.positions);
        operation.throwIfAborted();
        reportOperationProgress(operation, 0.25, "interpolate");
        const interpolated = interpolateProfilePoints(positions, options.sampleCount);
        operation.throwIfAborted();
        reportOperationProgress(operation, 0.4, "terrain-sampling");
        const sampledCartographics = await sampleGroundCartographics(
          this.map.viewer.terrainProvider,
          interpolated.map((sample) => sample.cartographic)
        );
        operation.throwIfAborted();
        reportOperationProgress(operation, 0.7, "calculate");
        const samples = createProfileSamples(interpolated, sampledCartographics);
        const range = getProfileHeightRange(samples);
        const style = this.map.styles.resolveProfileStyle(profileOptionsToStyle(options));
        reportOperationProgress(operation, 0.9, "render");
        const entities = renderProfileEntities(this.map, samples, style, options.height);
        const result: ProfileResult = {
          id: createAnalysisId("profile"),
          type: "profile",
          positions,
          samples,
          totalDistance: samples[samples.length - 1]?.distance ?? 0,
          minHeight: range.minHeight,
          maxHeight: range.maxHeight,
          entities,
          createdAt: new Date(),
          style,
          height: serializeHeightOptions(options.height)
        };
        renderedResult = result;

        operation.throwIfAborted();
        const added = this.addResultInternal(result);
        await Promise.resolve();
        operation.throwIfAborted();
        return added;
            } catch (error) {
              if (renderedResult) {
                if (this.results.get(renderedResult.id) === renderedResult) {
                  this.removeInternal(renderedResult.id);
                } else {
                  removeEntities(this.map, renderedResult.entities);
                }
                renderedResult = undefined;
              }
              throw error;
            }
          }
        );
      }
    ).catch((error) => {
      if (renderedResult) {
        if (this.results.get(renderedResult.id) === renderedResult) {
          this.remove(renderedResult.id);
        } else {
          removeEntities(this.map, renderedResult.entities);
        }
      }
      throw error;
    });
  }

  addResult(result: ProfileResult): ProfileResult {
    return runAnalysisMutation(this.map, "analysis.profile.addResult", () =>
      this.addResultInternal(result)
    );
  }

  private addResultInternal(result: ProfileResult): ProfileResult {
    const existing = this.results.get(result.id);
    if (existing === result) {
      return result;
    }
    if (existing) {
      this.removeInternal(result.id);
    }
    this.results.set(result.id, result);
    this.emit("add", result);
    return result;
  }

  get(id: string): ProfileResult | undefined {
    return this.results.get(id);
  }

  list(): ProfileResult[] {
    return [...this.results.values()];
  }

  toJSON(): ProfileResultSnapshot[] {
    return this.list().map((result) => ({
      id: result.id,
      type: "profile",
      positions: serializePositions(result.positions),
      samples: result.samples.map((sample) => ({
        position: serializePosition(sample.position),
        distance: sample.distance,
        height: sample.height
      })),
      totalDistance: result.totalDistance,
      minHeight: result.minHeight,
      maxHeight: result.maxHeight,
      createdAt: result.createdAt.toISOString(),
      style: serializeSymbolStyle(result.style),
      height: serializeHeightOptions(result.height)
    }));
  }

  async load(
    snapshots: ProfileResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): Promise<ProfileResult[]> {
    return runWithRuntimeLease(
      this.map.concurrency,
      analysisLeaseRequest("analysis.profile.load", options),
      () => {
        const prepared = this.prepareSnapshots(snapshots);
        if (options.clear) this.clearInternal();
        return prepared.map((snapshot) => this.restoreSnapshot(snapshot));
      }
    );
  }

  /** @internal */
  preflightSceneLoad(
    snapshots: ProfileResultSnapshot[],
    options: AnalysisResultLoadOptions = {}
  ): readonly PreparedProfileSnapshot[] {
    const prepared = this.prepareSnapshots(snapshots);
    if (!options.clear) {
      assertNoResultConflicts(this.results, prepared.map((item) => item.snapshot.id), "Profile");
    }
    return freezePreparedArray(prepared);
  }

  /** @internal */
  async prepareSceneLoad(
    snapshots: ProfileResultSnapshot[],
    options: AnalysisResultLoadOptions = {},
    preflight?: readonly PreparedProfileSnapshot[]
  ): Promise<PreparedSceneStage> {
    const prepared = preflight ?? this.preflightSceneLoad(snapshots, options);
    const staged = prepared.map((item) =>
      this.createPreparedResult(item)
    );
    return createEntityResultStage({
      phase: "profile",
      label: "Profile",
      source: "profile",
      map: this.map,
      results: this.results,
      staged,
      clear: options.clear ?? false,
      getEntities: (result) => result.entities,
      emitRemove: (result) => this.emit("remove", result),
      emitClear: (results) => this.emit("clear", results),
      emitAdd: (result) => this.emit("add", result)
    });
  }

  setStyle(id: string, style: ResultSymbolStyle): ProfileResult {
    return runAnalysisMutation(this.map, "analysis.profile.setStyle", () => {
    const result = this.results.get(id);
    if (!result) {
      throw new Error(`Profile result "${id}" does not exist.`);
    }

    removeEntities(this.map, result.entities);
    result.style = this.map.styles.resolveProfileStyle(style);
    result.entities = renderProfileEntities(this.map, result.samples, result.style, result.height);
    return result;
    });
  }

  remove(id: string): boolean {
    return runAnalysisMutation(this.map, "analysis.profile.remove", () =>
      this.removeInternal(id)
    );
  }

  private removeInternal(id: string): boolean {
    const result = this.results.get(id);
    if (!result) {
      return false;
    }

    removeEntities(this.map, result.entities);
    this.results.delete(id);
    this.emit("remove", result);
    this.map.tools.emitClear({ source: "profile", ids: [id] });
    return true;
  }

  clear(): void {
    runAnalysisMutation(this.map, "analysis.profile.clear", () => this.clearInternal());
  }

  private clearInternal(): void {
    const removed = [...this.results.values()];
    for (const result of removed) {
      removeEntities(this.map, result.entities);
      this.emit("remove", result);
    }

    this.results.clear();
    this.emit("clear", removed);
    this.map.tools.emitClear({
      source: "profile",
      ids: removed.map((result) => result.id)
    });
  }

  destroy(): void {
    this.clearInternal();
    this.off();
  }

  private prepareSnapshots(snapshots: ProfileResultSnapshot[]): PreparedProfileSnapshot[] {
    assertSnapshotArray(snapshots, "Profile result snapshots");
    const ids = new Set<string>();
    return snapshots.map((snapshot) => {
      assertSnapshotRecord(snapshot, "Profile result snapshot");
      assertNonEmptySnapshotId(snapshot.id, "Profile result snapshot id");
      if (ids.has(snapshot.id)) {
        throw new Error(`Profile result snapshot id "${snapshot.id}" is duplicated.`);
      }
      ids.add(snapshot.id);
      assertSnapshotEnum(snapshot.type, ["profile"], "Profile result type");
      assertSerializablePositions(snapshot.positions, "Profile result positions", 2);
      assertSnapshotArray(snapshot.samples, "Profile result samples");
      assertNonNegativeSnapshotNumber(snapshot.totalDistance, "Profile result totalDistance");
      assertFiniteSnapshotNumber(snapshot.minHeight, "Profile result minHeight");
      assertFiniteSnapshotNumber(snapshot.maxHeight, "Profile result maxHeight");
      if (snapshot.minHeight > snapshot.maxHeight) {
        throw new Error("Profile result minHeight cannot exceed maxHeight.");
      }
      assertSnapshotDate(snapshot.createdAt, "Profile result createdAt");
      validateProfileSampleRange(snapshot);
      if (snapshot.samples.length < 2) {
        throw new Error("Profile result samples must contain at least 2 samples.");
      }

      return {
        snapshot: cloneAndFreezeSnapshot(snapshot),
        positions: deserializePositions(snapshot.positions),
        samples: snapshot.samples.map(deserializeProfileSample),
        createdAt: parseSnapshotDate(snapshot.createdAt, "Profile result createdAt"),
        style: this.map.styles.resolveProfileStyle(snapshot.style),
        height: serializeHeightOptions(snapshot.height)
      };
    });
  }

  private restoreSnapshot(prepared: PreparedProfileSnapshot): ProfileResult {
    const result = this.createPreparedResult(prepared);
    if (this.results.has(result.id)) {
      this.removeInternal(result.id);
    }
    attachEntities(this.map, result.entities);
    return this.addResultInternal(result);
  }

  private createPreparedResult(prepared: PreparedProfileSnapshot): ProfileResult {
    const { snapshot, positions, samples, style, height } = prepared;
    const entities = createProfileEntities(samples, style, height);
    return {
      id: snapshot.id,
      type: "profile",
      positions,
      samples,
      totalDistance: snapshot.totalDistance,
      minHeight: snapshot.minHeight,
      maxHeight: snapshot.maxHeight,
      entities,
      createdAt: prepared.createdAt,
      style,
      height
    };
  }
}

function renderVisibilityEntities(
  map: KairosMap,
  start: Cartesian3,
  end: Cartesian3,
  blockedPosition: Cartesian3 | undefined,
  style: ResultSymbolStyle,
  height?: VisibilityResult["height"]
): Entity[] {
  const entities = createVisibilityEntities(start, end, blockedPosition, style, height);
  attachEntities(map, entities);
  return entities;
}

function createVisibilityEntities(
  start: Cartesian3,
  end: Cartesian3,
  blockedPosition: Cartesian3 | undefined,
  style: ResultSymbolStyle,
  height?: VisibilityResult["height"]
): Entity[] {
  const visibleLineStyle = style.visibleLine ?? style.line;
  const blockedLineStyle = style.blockedLine ?? style.line;
  const pointStyle = style.point;
  const blockedPointStyle = style.blockedPoint ?? style.point;
  const entities: Entity[] = [];

  if (blockedPosition) {
    entities.push(createPolylineEntity([start, blockedPosition], visibleLineStyle, height));
    entities.push(createPolylineEntity([blockedPosition, end], blockedLineStyle, height));
    entities.push(createPointEntity(blockedPosition, blockedPointStyle, height));
  } else {
    entities.push(createPolylineEntity([start, end], visibleLineStyle, height));
  }

  entities.push(createPointEntity(start, pointStyle, height));
  entities.push(createPointEntity(end, pointStyle, height));
  return entities;
}

type MeasureSnapshotLike = Pick<MeasureResultSnapshot, "id" | "type" | "value" | "unit" | "label">;

function createMeasureEntities(
  snapshot: MeasureSnapshotLike,
  positions: Cartesian3[],
  style: ResultSymbolStyle,
  height?: MeasureResult["height"]
): Entity[] {
  const entities: Entity[] = [];

  if (snapshot.type === "area") {
    entities.push(createPolygonEntity(positions, style.polygon, height));
  } else {
    entities.push(createPolylineEntity(positions, style.line, height));
  }

  const label = snapshot.label ?? `${snapshot.value} ${snapshot.unit}`;
  const labelPosition = positions[positions.length - 1];
  if (labelPosition) {
    entities.push(createLabelEntity(labelPosition, label, style.label));
  }

  return entities;
}

function renderMeasureResult(
  map: KairosMap,
  snapshot: MeasureSnapshotLike,
  positions: Cartesian3[],
  style: ResultSymbolStyle,
  height: MeasureResult["height"] | undefined,
  renderMode: ResultRenderMode | undefined
): { entities: Entity[]; primitives?: ResultPrimitiveRuntime[] } {
  const rendered = createMeasureResultRuntime(snapshot, positions, style, height, renderMode);
  attachEntityResultRuntime(map, rendered.entities, rendered.primitives);
  return rendered;
}

function createMeasureResultRuntime(
  snapshot: MeasureSnapshotLike,
  positions: Cartesian3[],
  style: ResultSymbolStyle,
  height: MeasureResult["height"] | undefined,
  renderMode: ResultRenderMode | undefined
): { entities: Entity[]; primitives?: ResultPrimitiveRuntime[] } {
  const resolvedRenderMode = resolveMeasureRenderMode(snapshot.type, renderMode);
  if (resolvedRenderMode !== "primitive") {
    return {
      entities: createMeasureEntities(snapshot, positions, style, height)
    };
  }

  const primitives = createMeasurePrimitives(snapshot.type, snapshot.id, positions, style);
  const entities: Entity[] = [];
  const label = snapshot.label ?? `${snapshot.value} ${snapshot.unit}`;
  const labelPosition = positions[positions.length - 1];
  if (labelPosition) {
    entities.push(createLabelEntity(labelPosition, label, style.label));
  }
  return { entities, primitives };
}

export function renderMeasurePrimitives(
  map: KairosMap,
  type: MeasureResult["type"],
  id: string,
  positions: Cartesian3[],
  style: ResultSymbolStyle
): ResultPrimitiveRuntime[] | undefined {
  if (type === "distance") {
    return [
      createResultPolylinePrimitive(map, {
        id,
        positions,
        style: style.line
      })
    ];
  }

  if (type === "area") {
    return createResultPolygonPrimitives(map, {
      id,
      positions,
      style: style.polygon
    });
  }

  return undefined;
}

function createMeasurePrimitives(
  type: MeasureResult["type"],
  id: string,
  positions: Cartesian3[],
  style: ResultSymbolStyle
): ResultPrimitiveRuntime[] | undefined {
  if (type === "distance") {
    return [
      createDetachedResultPolylinePrimitive({
        id,
        positions,
        style: style.line
      })
    ];
  }
  if (type === "area") {
    return createDetachedResultPolygonPrimitives({
      id,
      positions,
      style: style.polygon
    });
  }
  return undefined;
}

export function resolveMeasureRenderMode(
  type: MeasureResult["type"],
  renderMode?: ResultRenderMode
): ResultRenderMode {
  if (type === "height") {
    return "entity";
  }
  return resolveResultRenderMode(renderMode);
}

function validateMeasurePositions(type: MeasureResult["type"], positions: Cartesian3[]): void {
  const minCount = type === "area" ? 3 : 2;
  if (positions.length < minCount) {
    throw new Error(`Measure result "${type}" requires at least ${minCount} positions.`);
  }
}

function validateMeasureUnitAndMode(snapshot: MeasureResultSnapshot): void {
  if (snapshot.type === "area") {
    assertSnapshotEnum(snapshot.unit, ["m2", "km2"], "Area measure unit");
    assertOptionalSnapshotEnum(
      snapshot.mode,
      ["projected", "surface"],
      "Area measure mode"
    );
    return;
  }

  assertSnapshotEnum(snapshot.unit, ["m", "km"], "Measure unit");
  if (snapshot.type === "distance") {
    assertOptionalSnapshotEnum(snapshot.mode, ["space", "surface"], "Distance measure mode");
  } else if (snapshot.mode !== undefined) {
    throw new Error("Height measure snapshots cannot define mode.");
  }
}

function validateProfileSampleRange(snapshot: ProfileResultSnapshot): void {
  let previousDistance = -Infinity;
  for (let index = 0; index < snapshot.samples.length; index += 1) {
    const sample = snapshot.samples[index];
    assertSnapshotRecord(sample, `Profile sample[${index}]`);
    assertSerializablePosition(sample.position, `Profile sample[${index}] position`);
    assertNonNegativeSnapshotNumber(sample.distance, "Profile sample distance");
    assertFiniteSnapshotNumber(sample.height, "Profile sample height");
    if (sample.distance < previousDistance) {
      throw new Error("Profile sample distances must be monotonically increasing.");
    }
    if (sample.distance > snapshot.totalDistance) {
      throw new Error("Profile sample distance cannot exceed totalDistance.");
    }
    if (sample.height < snapshot.minHeight || sample.height > snapshot.maxHeight) {
      throw new Error("Profile sample height must be within minHeight and maxHeight.");
    }
    previousDistance = sample.distance;
  }

  const finalDistance = snapshot.samples[snapshot.samples.length - 1]?.distance;
  if (finalDistance !== snapshot.totalDistance) {
    throw new Error("Profile final sample distance must equal totalDistance.");
  }
}

function deserializeProfileSample(sample: ProfileSampleSnapshot) {
  assertSnapshotRecord(sample, "Profile sample");
  assertSerializablePosition(sample.position, "Profile sample position");
  assertFiniteSnapshotNumber(sample.distance, "Profile sample distance");
  assertFiniteSnapshotNumber(sample.height, "Profile sample height");

  return {
    position: deserializePosition(sample.position),
    distance: sample.distance,
    height: sample.height
  };
}

function assertAnalysisSnapshotStructure(snapshot: AnalysisResultsSnapshot): void {
  assertSnapshotRecord(snapshot, "Analysis results snapshot");
  assertSnapshotArray(snapshot.measure, "Analysis measure snapshots");
  assertSnapshotArray(snapshot.visibility, "Analysis visibility snapshots");
  assertSnapshotArray(snapshot.profile, "Analysis profile snapshots");
  assertSnapshotArray(snapshot.clipping, "Analysis clipping snapshots");
  if (snapshot.terrain !== undefined) {
    assertSnapshotArray(snapshot.terrain, "Analysis terrain snapshots");
  }
}

function assertNoResultConflicts<T>(
  results: ReadonlyMap<string, T>,
  ids: readonly string[],
  label: string
): void {
  for (const id of ids) {
    if (results.has(id)) {
      throw new Error(`${label} result "${id}" already exists during transactional merge.`);
    }
  }
}

function assertAnalysisMutation(
  map: KairosMap,
  kind: string,
  ownerToken?: RuntimeLeaseOwnerToken
): void {
  assertRuntimeMutationAllowed(map.concurrency, "analysis", kind, ownerToken);
}

function runAnalysisMutation<T>(
  map: KairosMap,
  kind: string,
  task: () => T,
  ownerToken?: RuntimeLeaseOwnerToken
): T {
  return runWithRuntimeWriteLease(
    map.concurrency,
    { kind, resources: ["analysis"], ownerToken },
    () => task()
  );
}

function analysisLeaseRequest(
  kind: string,
  options: unknown,
  operation?: OperationContext
) {
  const asyncOptions = options as AsyncOperationOptions | undefined;
  return {
    kind,
    mode: "write" as const,
    resources: ["analysis"] as const,
    conflictPolicy: "reject" as const,
    operationId: operation?.id ?? asyncOptions?.operationId,
    signal: operation?.signal ?? asyncOptions?.signal,
    ownerToken: getRuntimeLeaseOwner(options)
  };
}

function renderProfileEntities(
  map: KairosMap,
  samples: { position: Cartesian3 }[],
  style: ResultSymbolStyle,
  height?: ProfileResult["height"]
): Entity[] {
  const entities = createProfileEntities(samples, style, height);
  attachEntities(map, entities);
  return entities;
}

function createProfileEntities(
  samples: { position: Cartesian3 }[],
  style: ResultSymbolStyle,
  height?: ProfileResult["height"]
): Entity[] {
  const positions = samples.map((sample) => sample.position);
  const entities = [createPolylineEntity(positions, style.line, height)];

  if (positions.length >= 2) {
    entities.push(createPointEntity(positions[0], style.point, height));
    entities.push(createPointEntity(positions[positions.length - 1], style.point, height));
  }

  return entities;
}

function createPolylineEntity(
  positions: Cartesian3[],
  style?: ResultSymbolStyle["line"],
  height?: MeasureResult["height"] | VisibilityResult["height"] | ProfileResult["height"]
): Entity {
  const entity = new Entity({
    polyline: createLineGraphics(positions, lineStyleWithHeight(style, height))
  });
  applyHeightOptionsToEntity(entity, height);
  return entity;
}

function createPolygonEntity(
  positions: Cartesian3[],
  style?: ResultSymbolStyle["polygon"],
  height?: MeasureResult["height"]
): Entity {
  const entity = new Entity({
    polygon: createPolygonGraphics(new ConstantProperty(positions), style)
  });
  applyHeightOptionsToEntity(entity, height);
  return entity;
}

function createPointEntity(
  position: Cartesian3,
  style?: ResultSymbolStyle["point"],
  height?: VisibilityResult["height"] | ProfileResult["height"]
): Entity {
  const entity = new Entity({
    position,
    point: createPointGraphics(style)
  });
  applyHeightOptionsToEntity(entity, height);
  return entity;
}

function createLabelEntity(
  position: Cartesian3,
  text: string,
  style?: ResultSymbolStyle["label"]
): Entity {
  return new Entity({
    position,
    label: createLabelGraphics(text, style)
  });
}

function removeEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    removeEntityIfOwned(map.viewer.entities, entity);
  }
}

interface EntityResultStageOptions<T extends { id: string }> {
  phase: string;
  label: string;
  source: "measure" | "visibility" | "profile" | "terrain";
  map: KairosMap;
  results: Map<string, T>;
  staged: T[];
  clear: boolean;
  getEntities(result: T): Entity[];
  getPrimitives?(result: T): ResultPrimitiveRuntime[] | undefined;
  emitRemove(result: T): void;
  emitClear(results: T[]): void;
  emitAdd(result: T): void;
}

function createEntityResultStage<T extends { id: string }>(
  options: EntityResultStageOptions<T>
): PreparedSceneStage {
  if (!options.clear) {
    for (const result of options.staged) {
      if (options.results.has(result.id)) {
        for (const staged of options.staged) {
          destroyResultPrimitiveRuntimes(options.getPrimitives?.(staged));
        }
        throw new Error(
          `${options.label} result "${result.id}" already exists during transactional merge.`
        );
      }
    }
  }

  const previous = options.clear ? [...options.results.values()] : [];
  let commitStarted = false;
  let mapsSwapped = false;
  let rolledBack = false;
  let finalized = false;
  let disposed = false;
  let published = false;
  const detachedPreviousEntities: Entity[] = [];
  const detachedPreviousPrimitives: ResultPrimitiveRuntime[] = [];

  return {
    phase: options.phase,
    commit: () => {
      assertEntityStageBaseUnchanged(options, previous);
      commitStarted = true;
      for (const result of previous) {
        detachEntityResultRuntimeTracked(
          options.map,
          options.getEntities(result),
          options.getPrimitives?.(result),
          detachedPreviousEntities,
          detachedPreviousPrimitives
        );
      }
      for (const result of options.staged) {
        attachEntityResultRuntime(
          options.map,
          options.getEntities(result),
          options.getPrimitives?.(result)
        );
      }
      if (options.clear) {
        options.results.clear();
      }
      for (const result of options.staged) {
        options.results.set(result.id, result);
      }
      mapsSwapped = true;
    },
    rollback: () => {
      if (!commitStarted || rolledBack || finalized || disposed) {
        return;
      }
      const errors: unknown[] = [];
      for (const result of [...options.staged].reverse()) {
        try {
          detachEntityResultRuntime(
            options.map,
            options.getEntities(result),
            options.getPrimitives?.(result)
          );
        } catch (error) {
          errors.push(error);
        }
      }
      if (mapsSwapped) {
        for (const result of options.staged) {
          options.results.delete(result.id);
        }
      }
      for (const entity of detachedPreviousEntities) {
        try {
          options.map.viewer.entities.add(entity);
        } catch (error) {
          errors.push(error);
        }
      }
      for (const runtime of detachedPreviousPrimitives) {
        try {
          attachResultPrimitiveRuntimes(options.map, [runtime]);
        } catch (error) {
          errors.push(error);
        }
      }
      for (const result of previous) {
        options.results.set(result.id, result);
      }
      detachedPreviousEntities.length = 0;
      detachedPreviousPrimitives.length = 0;
      mapsSwapped = false;
      rolledBack = true;
      if (errors.length > 0) {
        throw new AggregateError(errors, `Failed to roll back ${options.label} results.`);
      }
    },
    finalize: () => {
      if (finalized) {
        return;
      }
      for (const result of previous) {
        destroyResultPrimitiveRuntimes(options.getPrimitives?.(result));
      }
      finalized = true;
    },
    dispose: () => {
      if (disposed || finalized) {
        return;
      }
      const errors: unknown[] = [];
      for (const result of [...options.staged].reverse()) {
        try {
          detachEntityResultRuntime(
            options.map,
            options.getEntities(result),
            options.getPrimitives?.(result)
          );
        } catch (error) {
          errors.push(error);
        }
        try {
          destroyResultPrimitiveRuntimes(options.getPrimitives?.(result));
        } catch (error) {
          errors.push(error);
        }
      }
      disposed = true;
      if (errors.length > 0) {
        throw new AggregateError(errors, `Failed to dispose prepared ${options.label} results.`);
      }
    },
    publish: () => {
      if (published) {
        return;
      }
      if (options.clear) {
        for (const result of previous) {
          options.emitRemove(result);
        }
        options.emitClear(previous);
        options.map.tools.emitClear({
          source: options.source,
          ids: previous.map((result) => result.id)
        });
      }
      for (const result of options.staged) {
        options.emitAdd(result);
      }
      published = true;
    }
  };
}

function assertEntityStageBaseUnchanged<T extends { id: string }>(
  options: EntityResultStageOptions<T>,
  previous: T[]
): void {
  if (options.clear && options.results.size !== previous.length) {
    throw new Error(`${options.label} results changed after transactional preparation.`);
  }
  for (const result of previous) {
    if (options.results.get(result.id) !== result) {
      throw new Error(
        `${options.label} result "${result.id}" changed after transactional preparation.`
      );
    }
  }
  if (!options.clear) {
    for (const result of options.staged) {
      if (options.results.has(result.id)) {
        throw new Error(
          `${options.label} result "${result.id}" changed after transactional preparation.`
        );
      }
    }
  }
}

function attachEntities(map: KairosMap, entities: Entity[]): void {
  for (const entity of entities) {
    map.viewer.entities.add(entity);
  }
}

function attachEntityResultRuntime(
  map: KairosMap,
  entities: Entity[],
  primitives?: ResultPrimitiveRuntime[]
): void {
  attachEntities(map, entities);
  if (primitives?.length) {
    attachResultPrimitiveRuntimes(map, primitives);
  }
}

function detachEntityResultRuntime(
  map: KairosMap,
  entities: Entity[],
  primitives?: ResultPrimitiveRuntime[]
): void {
  removeEntities(map, entities);
  if (primitives?.length) {
    detachResultPrimitiveRuntimes(map, primitives);
  }
}

function detachEntityResultRuntimeTracked(
  map: KairosMap,
  entities: Entity[],
  primitives: ResultPrimitiveRuntime[] | undefined,
  detachedEntities: Entity[],
  detachedPrimitives: ResultPrimitiveRuntime[]
): void {
  for (const entity of entities) {
    removeEntityIfOwnedTracked(map.viewer.entities, entity, detachedEntities);
  }
  detachResultPrimitivesTracked(map, primitives, detachedPrimitives);
}

function detachResultPrimitivesTracked(
  map: KairosMap,
  runtimes: ResultPrimitiveRuntime[] | undefined,
  detached: ResultPrimitiveRuntime[]
): void {
  const collection = map.viewer.scene.primitives;
  const canInspect = typeof collection.contains === "function";
  const attached = canInspect
    ? (runtimes ?? []).filter((runtime) =>
        collection.contains(getResultPrimitiveObject(runtime))
      )
    : [];
  try {
    detachResultPrimitiveRuntimes(map, runtimes);
  } finally {
    for (const runtime of attached) {
      if (
        !collection.contains(getResultPrimitiveObject(runtime)) &&
        !detached.includes(runtime)
      ) {
        detached.push(runtime);
      }
    }
  }
}

function getResultPrimitiveObject(runtime: ResultPrimitiveRuntime) {
  return runtime.type === "polyline" ? runtime.collection : runtime.primitive;
}

async function runStagesBestEffort(
  stages: PreparedSceneStage[],
  method: "rollback" | "finalize" | "dispose"
): Promise<void> {
  const errors: unknown[] = [];
  for (const stage of stages) {
    try {
      await stage[method]();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `Failed to ${method} analysis stages.`);
  }
}

function reportOperationProgress(
  operation: OperationContext,
  progress: number,
  phase: string
): void {
  operation.reportProgress(progress, phase);
  operation.throwIfAborted();
}

function removeMeasureRuntime(map: KairosMap, result: MeasureResult): void {
  removeEntities(map, result.entities);
  removeResultPrimitiveRuntimes(map, result.primitives);
}

function clonePositions(positions: Cartesian3[]): Cartesian3[] {
  return positions.map((position) => Cartesian3.clone(position));
}

function createAnalysisId(type: "visibility" | "profile"): string {
  return `analysis-${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function visibilityOptionsToStyle(options: VisibilityComputeOptions): ResultSymbolStyle {
  return mergeSymbolStyles(
    {
      visibleLine: { color: options.visibleColor },
      blockedLine: { color: options.blockedColor },
      point: { color: options.pointColor },
      blockedPoint: { color: options.blockedColor }
    },
    options.style
  );
}

function profileOptionsToStyle(options: ProfileComputeOptions): ResultSymbolStyle {
  return mergeSymbolStyles(
    {
      line: { color: options.lineColor },
      point: { color: options.pointColor }
    },
    options.style
  );
}
