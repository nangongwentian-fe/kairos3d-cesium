import type { KairosMap } from "../core";
import { Evented } from "../core/events";
import {
  isOperationCanceledError,
  OperationCanceledError,
  type OperationErrorInfo
} from "../operations";
import {
  createOperationScope,
  runOrReuseOperation,
  withOperationContext,
  type OperationContext
} from "../operations/manager";
import { cameraViewFromCartographic, cameraViewToCartesian, cloneCameraView } from "./camera";
import { SceneTransactionError } from "./errors";
import { parseSceneSnapshot } from "./parser";
import type { PreparedSceneStage } from "./transaction";
import type {
  CameraBookmark,
  CameraBookmarkInput,
  CameraFlightOptions,
  CameraView,
  RuntimeResultsSnapshot,
  SceneLoadMode,
  SceneRollbackStatus,
  SceneSnapshot,
  SceneStateLoadOptions,
  SceneStateManagerEvents,
  SceneStateSnapshotOptions,
  SceneTransactionState,
  SceneTransactionStatus
} from "./types";

const emptyResultsSnapshot = (): RuntimeResultsSnapshot => ({
  draw: [],
  measure: [],
  visibility: [],
  profile: [],
  clipping: [],
  terrain: []
});

export class SceneStateManager extends Evented<SceneStateManagerEvents> {
  readonly bookmarks = new CameraBookmarkManager();

  private transactionState?: SceneTransactionState;
  private transactionReserved = false;
  private transactionTaskStarted = false;
  private idlePromise: Promise<void> = Promise.resolve();
  private resolveIdle?: () => void;
  private activeStages: PreparedSceneStage[] = [];
  private destroyed = false;
  private destroyPromise?: Promise<void>;

  constructor(private readonly map: KairosMap) {
    super();
  }

  captureCamera(): CameraView {
    const camera = this.map.viewer.camera;
    return cameraViewFromCartographic(
      camera.positionCartographic,
      camera.heading,
      camera.pitch,
      camera.roll
    );
  }

  flyToCamera(view: CameraView, options: CameraFlightOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.map.viewer.camera.flyTo({
        ...options,
        destination: cameraViewToCartesian(view),
        orientation: {
          heading: view.heading,
          pitch: view.pitch,
          roll: view.roll
        },
        complete: () => resolve(true),
        cancel: () => resolve(false)
      });
    });
  }

  getTransactionState(): SceneTransactionState | undefined {
    return this.transactionState ? cloneTransactionState(this.transactionState) : undefined;
  }

  whenIdle(): Promise<void> {
    return this.transactionReserved ? this.idlePromise : Promise.resolve();
  }

  toJSON(options: SceneStateSnapshotOptions = {}): SceneSnapshot {
    if (this.transactionReserved) {
      throw new Error("Cannot create a scene snapshot while a scene transaction is running.");
    }

    const snapshot: SceneSnapshot = {
      version: 1,
      camera: this.captureCamera(),
      layers: this.map.layers.toJSON(),
      bookmarks: this.bookmarks.list(),
      createdAt: new Date().toISOString()
    };

    if (options.includeResults) {
      snapshot.results = {
        draw: this.map.draw.toJSON(),
        ...this.map.analysis.toJSON()
      };
    }
    if (options.includePrimitives) {
      snapshot.primitives = this.map.primitives.toJSON();
    }
    if (options.includeOverlays) {
      snapshot.overlays = this.map.overlays.toJSON();
    }
    if (options.includeEffects) {
      snapshot.effects = this.map.effects.toJSON();
    }

    return snapshot;
  }

  load(snapshot: SceneSnapshot, options: SceneStateLoadOptions = {}): Promise<void> {
    if (this.destroyed) {
      return Promise.reject(new Error("Scene state manager is destroyed."));
    }
    if (this.transactionReserved) {
      return Promise.reject(new Error("A scene transaction is already running."));
    }

    this.reserveTransaction();
    let loading: Promise<void>;
    try {
      loading = runOrReuseOperation(
        this.map.operations,
        { kind: "scene.load", label: "Load scene" },
        options,
        async (context) => {
          this.transactionTaskStarted = true;
          const mode = options.mode ?? "transactional";
          if (mode === "progressive") {
            await this.loadProgressive(snapshot, options, context);
          } else {
            await this.loadTransactional(snapshot, options, context);
          }
        }
      );
    } catch (error) {
      this.releaseTransaction();
      return Promise.reject(error);
    }

    void loading.finally(() => {
      if (!this.transactionTaskStarted && this.transactionReserved) {
        this.releaseTransaction();
      }
    }).catch(() => undefined);
    return loading;
  }

  private async loadTransactional(
    input: SceneSnapshot,
    options: SceneStateLoadOptions,
    context: OperationContext
  ): Promise<void> {
    this.beginTransaction(context.id, "transactional", "preparing", "validate");
    const cameraBaseline = this.captureCamera();
    const prepared: PreparedSceneStage[] = [];
    const attempted: PreparedSceneStage[] = [];
    let commitStarted = false;
    let currentStage = "validate";

    try {
      const snapshot = parseSceneSnapshot(input);
      context.reportProgress(0.02, "validate");
      context.throwIfAborted();

      const factories = this.createStageFactories(
        snapshot,
        options,
        context,
        cameraBaseline
      );
      for (let index = 0; index < factories.length; index += 1) {
        const factory = factories[index];
        currentStage = factory.phase;
        this.updateTransaction({ status: "preparing", stage: currentStage });
        const stage = await factory.prepare();
        prepared.push(stage);
        this.activeStages = [...prepared];
        context.reportProgress(
          0.05 + ((index + 1) / Math.max(factories.length, 1)) * 0.4,
          `prepare.${currentStage}`
        );
        context.throwIfAborted();
        this.assertActive();
      }

      commitStarted = true;
      this.map.tools.stop();
      this.map.selection.clear();
      this.updateTransaction({ status: "committing", stage: prepared[0]?.phase });

      for (let index = 0; index < prepared.length; index += 1) {
        const stage = prepared[index];
        currentStage = stage.phase;
        this.updateTransaction({ status: "committing", stage: currentStage });
        attempted.push(stage);
        await stage.commit();
        context.reportProgress(
          0.45 + ((index + 1) / Math.max(prepared.length, 1)) * 0.45,
          `commit.${currentStage}`
        );
        context.throwIfAborted();
        this.assertActive();
      }

      await this.finalizeStagesBestEffort(prepared);
      for (const stage of prepared) {
        try {
          stage.publish();
        } catch {
          // Published listeners are outside the runtime transaction boundary.
        }
      }
      this.requestRender();
      context.reportProgress(1, "finalize");
      this.completeTransaction("succeeded", "not-needed");
    } catch (error) {
      const canceled = context.signal.aborted || isOperationCanceledError(error) || this.destroyed;
      const rollbackErrors: OperationErrorInfo[] = [];
      let rollbackStatus: SceneRollbackStatus = "not-needed";

      if (commitStarted && attempted.length > 0) {
        rollbackStatus = "running";
        this.updateTransaction({
          status: "rolling-back",
          stage: currentStage,
          rollbackStatus
        });
        rollbackErrors.push(...await this.rollbackStages(attempted));
      }

      rollbackErrors.push(...await this.disposeStages(prepared));
      if (commitStarted && attempted.length > 0) {
        rollbackStatus = rollbackErrors.length === 0 ? "succeeded" : "failed";
      }
      this.requestRender();
      const errorInfo = toErrorInfo(error);
      this.completeTransaction(canceled ? "canceled" : "failed", rollbackStatus, {
        error: errorInfo,
        rollbackErrors
      });

      if (canceled) {
        throw new OperationCanceledError(context.id);
      }
      throw new SceneTransactionError(
        `Scene transaction failed during ${commitStarted ? "commit" : "prepare"} stage "${currentStage}".`,
        commitStarted ? "commit" : "prepare",
        currentStage,
        rollbackStatus,
        rollbackErrors,
        error
      );
    } finally {
      this.activeStages = [];
      this.releaseTransaction();
    }
  }

  private createStageFactories(
    snapshot: SceneSnapshot,
    options: SceneStateLoadOptions,
    context: OperationContext,
    cameraBaseline: CameraView
  ): SceneStageFactory[] {
    const factories: SceneStageFactory[] = [
      {
        phase: "layers",
        prepare: () => this.map.layers.prepareTransaction(snapshot.layers, {
          clear: options.clearLayers ?? true,
          flyTo: false
        })
      },
      {
        phase: "bookmarks",
        prepare: () => Promise.resolve(this.createBookmarkStage(snapshot.bookmarks))
      }
    ];

    const restoreResults = options.restoreResults ?? false;
    const clearResults = options.clearResults ?? restoreResults;
    if (clearResults || restoreResults) {
      const results = restoreResults && snapshot.results
        ? snapshot.results
        : emptyResultsSnapshot();
      factories.push(
        {
          phase: "draw",
          prepare: () => this.map.draw.prepareSceneLoad(results.draw, { clear: clearResults })
        },
        {
          phase: "analysis",
          prepare: () => this.map.analysis.prepareSceneLoad(
            {
              measure: results.measure,
              visibility: results.visibility,
              profile: results.profile,
              clipping: results.clipping,
              terrain: results.terrain ?? []
            },
            { clear: clearResults }
          )
        }
      );
    }

    const restorePrimitives = options.restorePrimitives ?? false;
    const clearPrimitives = options.clearPrimitives ?? restorePrimitives;
    if (clearPrimitives || restorePrimitives) {
      factories.push({
        phase: "primitives",
        prepare: () => this.map.primitives.prepareSceneLoad(
          restorePrimitives ? snapshot.primitives ?? [] : [],
          { clear: clearPrimitives }
        )
      });
    }

    const restoreOverlays = options.restoreOverlays ?? false;
    const clearOverlays = options.clearOverlays ?? restoreOverlays;
    if (clearOverlays || restoreOverlays) {
      factories.push({
        phase: "overlays",
        prepare: () => this.map.overlays.prepareSceneLoad(
          restoreOverlays ? snapshot.overlays ?? [] : [],
          { clear: clearOverlays }
        )
      });
    }

    const restoreEffects = options.restoreEffects ?? false;
    const clearEffects = options.clearEffects ?? restoreEffects;
    if (clearEffects || restoreEffects) {
      factories.push({
        phase: "effects",
        prepare: () => this.map.effects.prepareSceneLoad(
          restoreEffects ? snapshot.effects ?? [] : [],
          { clear: clearEffects }
        )
      });
    }

    if ((options.flyToCamera ?? true) && snapshot.camera) {
      factories.push({
        phase: "camera",
        prepare: () => Promise.resolve(
          this.createCameraStage(snapshot.camera!, cameraBaseline, context)
        )
      });
    }
    return factories;
  }

  private createBookmarkStage(bookmarks: CameraBookmark[]): PreparedSceneStage {
    const previous = this.bookmarks.list();
    const next = bookmarks.map(cloneBookmark);
    let committed = false;
    return {
      phase: "bookmarks",
      commit: () => {
        this.bookmarks.replace(next);
        committed = true;
      },
      rollback: () => {
        if (committed) {
          this.bookmarks.replace(previous);
          committed = false;
        }
      },
      finalize: () => undefined,
      dispose: () => undefined,
      publish: () => undefined
    };
  }

  private createCameraStage(
    view: CameraView,
    baseline: CameraView,
    context: OperationContext
  ): PreparedSceneStage {
    const previous = cloneCameraView(baseline);
    let commitStarted = false;
    return {
      phase: "camera",
      commit: async () => {
        commitStarted = true;
        this.map.viewer.camera.cancelFlight();
        const completed = await this.flyToCameraWithOperation(view, context);
        if (!completed) {
          throw new Error("Camera flight was canceled before completion.");
        }
      },
      rollback: () => {
        if (!commitStarted) {
          return;
        }
        const camera = this.map.viewer.camera;
        camera.cancelFlight();
        camera.setView({
          destination: cameraViewToCartesian(previous),
          orientation: {
            heading: previous.heading,
            pitch: previous.pitch,
            roll: previous.roll
          }
        });
        commitStarted = false;
      },
      finalize: () => undefined,
      dispose: () => undefined,
      publish: () => undefined
    };
  }

  private async rollbackStages(stages: PreparedSceneStage[]): Promise<OperationErrorInfo[]> {
    const priorities: Record<string, number> = {
      camera: 0,
      layers: 1,
      bookmarks: 2,
      draw: 3,
      analysis: 4,
      primitives: 5,
      overlays: 6,
      effects: 7
    };
    const ordered = [...new Set(stages)].sort(
      (left, right) => (priorities[left.phase] ?? 99) - (priorities[right.phase] ?? 99)
    );
    const errors: OperationErrorInfo[] = [];
    for (const stage of ordered) {
      this.updateTransaction({ status: "rolling-back", stage: stage.phase });
      try {
        await stage.rollback();
      } catch (error) {
        errors.push(toErrorInfo(error));
      }
    }
    return errors;
  }

  private async disposeStages(stages: PreparedSceneStage[]): Promise<OperationErrorInfo[]> {
    const errors: OperationErrorInfo[] = [];
    for (const stage of [...stages].reverse()) {
      try {
        await stage.dispose();
      } catch (error) {
        errors.push(toErrorInfo(error));
      }
    }
    return errors;
  }

  private async finalizeStagesBestEffort(stages: PreparedSceneStage[]): Promise<void> {
    for (const stage of stages) {
      try {
        await stage.finalize();
      } catch {
        // Commit is already complete. Finalization only retires old runtime and
        // must not turn an applied scene into a transaction rollback.
      }
    }
  }

  private async loadProgressive(
    input: SceneSnapshot,
    options: SceneStateLoadOptions,
    context: OperationContext
  ): Promise<void> {
    this.beginTransaction(context.id, "progressive", "preparing", "validate");
    try {
      const snapshot = parseSceneSnapshot(input);
      context.throwIfAborted();
      context.reportProgress(0, "validate");
      if ((options.restoreOverlays ?? false) && snapshot.overlays) {
        this.map.overlays.validateSnapshots(snapshot.overlays);
      }
      if (options.restoreEffects ?? false) {
        this.map.effects.validateSnapshots(snapshot.effects ?? []);
      }
      context.throwIfAborted();
      this.updateTransaction({ status: "committing", stage: "layers" });
      await this.loadProgressiveSnapshot(snapshot, options, context);
      this.completeTransaction("succeeded", "not-needed");
    } catch (error) {
      const canceled = context.signal.aborted || isOperationCanceledError(error) || this.destroyed;
      this.completeTransaction(canceled ? "canceled" : "failed", "not-needed", {
        error: toErrorInfo(error)
      });
      if (canceled) {
        throw new OperationCanceledError(context.id);
      }
      throw error;
    } finally {
      this.releaseTransaction();
    }
  }

  private async loadProgressiveSnapshot(
    snapshot: SceneSnapshot,
    options: SceneStateLoadOptions,
    context: OperationContext
  ): Promise<void> {
    const restoreResults = options.restoreResults ?? false;
    const clearResults = options.clearResults ?? restoreResults;
    const restorePrimitives = options.restorePrimitives ?? false;
    const clearPrimitives = options.clearPrimitives ?? restorePrimitives;
    const restoreOverlays = options.restoreOverlays ?? false;
    const clearOverlays = options.clearOverlays ?? restoreOverlays;
    const restoreEffects = options.restoreEffects ?? false;
    const clearEffects = options.clearEffects ?? restoreEffects;
    const stages: SceneLoadStage[] = [
      {
        phase: "layers",
        run: (scope) => this.map.layers.load(
          snapshot.layers,
          withOperationContext(
            { clear: options.clearLayers ?? true, flyTo: false },
            scope
          )
        )
      },
      { phase: "bookmarks", run: () => this.bookmarks.replace(snapshot.bookmarks) }
    ];

    if (clearResults || restoreResults) {
      stages.push({
        phase: "results",
        run: async (scope) => {
          if (clearResults) {
            this.map.draw.clear();
            this.map.analysis.measure.clear();
            this.map.analysis.visibility.clear();
            this.map.analysis.profile.clear();
            this.map.analysis.clipping.clear();
            this.map.analysis.terrain.clear();
          }
          if (restoreResults && snapshot.results) {
            await this.map.draw.load(snapshot.results.draw, { clear: false });
            scope.throwIfAborted();
            await this.map.analysis.load(
              {
                measure: snapshot.results.measure,
                visibility: snapshot.results.visibility,
                profile: snapshot.results.profile,
                clipping: snapshot.results.clipping,
                terrain: snapshot.results.terrain ?? []
              },
              { clear: false }
            );
          }
        }
      });
    }

    if (clearPrimitives || restorePrimitives) {
      stages.push({
        phase: "primitives",
        run: () => {
          if (clearPrimitives) this.map.primitives.clear();
          if (restorePrimitives && snapshot.primitives) {
            this.map.primitives.load(snapshot.primitives, { clear: false });
          }
        }
      });
    }
    if (clearOverlays || restoreOverlays) {
      stages.push({
        phase: "overlays",
        run: async (scope) => {
          if (clearOverlays) this.map.overlays.clear();
          if (restoreOverlays && snapshot.overlays) {
            await this.map.overlays.load(snapshot.overlays, { clear: false });
            scope.throwIfAborted();
          }
        }
      });
    }
    if (clearEffects || restoreEffects) {
      stages.push({
        phase: "effects",
        run: (scope) => {
          if (restoreEffects) {
            return this.map.effects.load(
              snapshot.effects ?? [],
              withOperationContext({ clear: clearEffects }, scope)
            );
          }
          this.map.effects.clear();
        }
      });
    }
    if ((options.flyToCamera ?? true) && snapshot.camera) {
      stages.push({
        phase: "camera",
        run: (scope) => this.flyToCameraWithOperation(snapshot.camera!, scope)
      });
    }

    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      this.updateTransaction({ status: "committing", stage: stage.phase });
      const scope = createOperationScope(
        context,
        index / stages.length,
        (index + 1) / stages.length,
        stage.phase
      );
      scope.throwIfAborted();
      await stage.run(scope);
      scope.throwIfAborted();
      scope.reportProgress(1);
    }
  }

  private async flyToCameraWithOperation(
    view: CameraView,
    context: OperationContext
  ): Promise<boolean> {
    const camera = this.map.viewer.camera;
    const cancelFlight = () => camera.cancelFlight();
    context.signal.addEventListener("abort", cancelFlight, { once: true });
    try {
      context.throwIfAborted();
      const completed = await this.flyToCamera(view);
      context.throwIfAborted();
      return completed;
    } finally {
      context.signal.removeEventListener("abort", cancelFlight);
    }
  }

  private reserveTransaction(): void {
    this.transactionReserved = true;
    this.transactionTaskStarted = false;
    this.idlePromise = new Promise<void>((resolve) => {
      this.resolveIdle = resolve;
    });
  }

  private beginTransaction(
    operationId: string,
    mode: SceneLoadMode,
    status: SceneTransactionStatus,
    stage?: string
  ): void {
    this.transactionState = {
      operationId,
      mode,
      status,
      stage,
      rollbackStatus: "not-needed",
      startedAt: new Date()
    };
    this.emitTransaction();
  }

  private updateTransaction(
    patch: Partial<Omit<SceneTransactionState, "operationId" | "mode" | "startedAt">>
  ): void {
    if (!this.transactionState) {
      return;
    }
    this.transactionState = { ...this.transactionState, ...patch };
    this.emitTransaction();
  }

  private completeTransaction(
    status: Extract<SceneTransactionStatus, "succeeded" | "failed" | "canceled">,
    rollbackStatus: SceneRollbackStatus,
    details: {
      error?: OperationErrorInfo;
      rollbackErrors?: OperationErrorInfo[];
    } = {}
  ): void {
    this.updateTransaction({
      status,
      rollbackStatus,
      error: details.error,
      rollbackErrors: details.rollbackErrors?.length ? details.rollbackErrors : undefined,
      finishedAt: new Date()
    });
  }

  private emitTransaction(): void {
    if (!this.destroyed && this.transactionState) {
      try {
        this.emit("transaction-change", cloneTransactionState(this.transactionState));
      } catch {
        // Listener failures must not interrupt commit or rollback.
      }
    }
  }

  private requestRender(): void {
    if (this.destroyed) {
      return;
    }
    try {
      this.map.viewer.scene.requestRender();
    } catch {
      // The viewer may have been destroyed externally while cleanup was running.
    }
  }

  private releaseTransaction(): void {
    if (!this.transactionReserved) {
      return;
    }
    this.transactionReserved = false;
    this.transactionTaskStarted = false;
    const resolve = this.resolveIdle;
    this.resolveIdle = undefined;
    resolve?.();
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("Scene state manager is destroyed.");
    }
  }

  destroy(): void {
    void this.destroyAndWait();
  }

  /** @internal */
  destroyAndWait(): void | Promise<void> {
    if (this.destroyed) {
      return this.destroyPromise;
    }

    this.destroyed = true;
    this.map.viewer.camera.cancelFlight();
    if (this.transactionReserved) {
      if (this.transactionState) {
        this.map.operations.cancel(this.transactionState.operationId);
      } else {
        this.map.operations.cancelAll({ kind: "scene.load", status: "running" });
      }
    }

    const finish = () => {
      this.activeStages = [];
      this.bookmarks.clear();
      this.off();
    };
    if (!this.transactionReserved) {
      finish();
      return;
    }

    this.destroyPromise = this.idlePromise.then(finish);
    return this.destroyPromise;
  }
}

interface SceneLoadStage {
  phase: string;
  run(context: OperationContext): void | Promise<unknown>;
}

interface SceneStageFactory {
  phase: string;
  prepare(): Promise<PreparedSceneStage>;
}

export class CameraBookmarkManager {
  private readonly items = new Map<string, CameraBookmark>();

  add(bookmark: CameraBookmarkInput): CameraBookmark {
    const next: CameraBookmark = {
      ...bookmark,
      view: cloneCameraView(bookmark.view),
      createdAt: bookmark.createdAt ?? new Date().toISOString()
    };

    this.items.set(next.id, next);
    return cloneBookmark(next);
  }

  get(id: string): CameraBookmark | undefined {
    const bookmark = this.items.get(id);
    return bookmark ? cloneBookmark(bookmark) : undefined;
  }

  list(): CameraBookmark[] {
    return [...this.items.values()].map(cloneBookmark);
  }

  remove(id: string): boolean {
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  replace(bookmarks: CameraBookmark[]): void {
    this.clear();
    for (const bookmark of bookmarks) {
      this.add(bookmark);
    }
  }
}

function cloneBookmark(bookmark: CameraBookmark): CameraBookmark {
  return {
    ...bookmark,
    view: cloneCameraView(bookmark.view)
  };
}

function cloneTransactionState(state: SceneTransactionState): SceneTransactionState {
  return Object.freeze({
    ...state,
    error: state.error ? Object.freeze({ ...state.error }) : undefined,
    rollbackErrors: state.rollbackErrors?.map((error) => Object.freeze({ ...error })),
    startedAt: new Date(state.startedAt),
    finishedAt: state.finishedAt ? new Date(state.finishedAt) : undefined
  });
}

function toErrorInfo(error: unknown): OperationErrorInfo {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return { name: error.name, message: error.message, code };
  }
  return { name: "Error", message: String(error) };
}
