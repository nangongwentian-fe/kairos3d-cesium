import type { KairosMap } from "../core";
import { Evented } from "../core/events";
import {
  acquireRuntimeLease,
  assertRuntimeMutationAllowed,
  getRuntimeLeaseOwner,
  runWithRuntimeLease,
  runWithRuntimeWriteLease,
  withRuntimeLeaseOwner,
  type RuntimeLeaseOwnerToken
} from "../concurrency/lease";
import type { AnalysisScenePreflightToken } from "../analysis/manager";
import type { LayerTransactionPreflight } from "../layers/manager";
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
import {
  prepareSceneStagePlans,
  type PreparedSceneStage,
  type SceneStagePlan
} from "./transaction";
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
  readonly bookmarks: CameraBookmarkManager;

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
    this.bookmarks = new CameraBookmarkManager(map);
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
    return runWithRuntimeLease(
      this.map.concurrency,
      {
        kind: "camera.flyTo",
        mode: "write",
        resources: ["camera"],
        conflictPolicy: "reject"
      },
      () => this.flyToCameraInternal(view, options)
    );
  }

  private flyToCameraInternal(
    view: CameraView,
    options: CameraFlightOptions = {}
  ): Promise<boolean> {
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
    const transactionIdle = this.transactionReserved
      ? this.idlePromise
      : Promise.resolve();
    return Promise.all([
      transactionIdle,
      this.map.concurrency.whenIdle({ kind: "scene.load" })
    ]).then(() => undefined);
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
    const leaseController = new AbortController();
    const leasePromise = acquireRuntimeLease(this.map.concurrency, {
      kind: "scene.load",
      mode: "exclusive",
      resources: ["scene"],
      operationId: options.operationId,
      signal: leaseController.signal,
      conflictPolicy: options.conflictPolicy ?? "wait"
    });
    let loading: Promise<void>;
    try {
      loading = runOrReuseOperation(
        this.map.operations,
        { kind: "scene.load", label: "Load scene" },
        options,
        async (context) => {
          const cancelLeaseWait = () => leaseController.abort(context.signal.reason);
          context.signal.addEventListener("abort", cancelLeaseWait, { once: true });
          let lease: Awaited<typeof leasePromise> | undefined;
          try {
            if (context.signal.aborted) cancelLeaseWait();
            lease = await leasePromise;
            this.transactionTaskStarted = true;
            const leasedOptions = withRuntimeLeaseOwner(options, lease.ownerToken);
            const mode = options.mode ?? "transactional";
            if (mode === "progressive") {
              await this.loadProgressive(snapshot, leasedOptions, context);
            } else {
              await this.loadTransactional(snapshot, leasedOptions, context);
            }
          } finally {
            context.signal.removeEventListener("abort", cancelLeaseWait);
            lease?.release();
          }
        }
      );
    } catch (error) {
      leaseController.abort(error);
      void leasePromise.then((lease) => lease.release(), () => undefined);
      this.releaseTransaction();
      return Promise.reject(error);
    }

    void loading.finally(() => {
      if (!this.transactionTaskStarted && this.transactionReserved) {
        leaseController.abort();
        void leasePromise.then((lease) => lease.release(), () => undefined);
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
    const ownerToken = requireRuntimeLeaseOwner(options);
    const cameraBaseline = this.captureCamera();
    const prepared: PreparedSceneStage[] = [];
    const attempted: PreparedSceneStage[] = [];
    let commitStarted = false;
    let currentStage = "validate";

    try {
      const snapshot = parseSceneSnapshot(input);
      context.reportProgress(0.02, "validate");
      context.throwIfAborted();

      const plans = this.createStagePlans(
        snapshot,
        options,
        context,
        cameraBaseline
      );
      const planCount = Math.max(plans.length, 1);
      const instrumentedPlans = plans.map((plan, index): SceneStagePlan => ({
        phase: plan.phase,
        preflight: plan.preflight
          ? async () => {
              currentStage = plan.phase;
              this.updateTransaction({ status: "preparing", stage: `preflight.${plan.phase}` });
              context.throwIfAborted();
              this.assertActive();
              const result = await plan.preflight!();
              context.reportProgress(
                0.02 + ((index + 1) / planCount) * 0.08,
                `preflight.${plan.phase}`
              );
              context.throwIfAborted();
              this.assertActive();
              return result;
            }
          : undefined,
        prepare: async (preflight) => {
          currentStage = plan.phase;
          this.updateTransaction({ status: "preparing", stage: plan.phase });
          context.throwIfAborted();
          this.assertActive();
          const stage = await plan.prepare(preflight);
          context.reportProgress(
            0.1 + ((index + 1) / planCount) * 0.35,
            `prepare.${plan.phase}`
          );
          return stage;
        }
      }));
      prepared.push(...await prepareSceneStagePlans(instrumentedPlans));
      this.activeStages = [...prepared];
      context.throwIfAborted();
      this.assertActive();

      commitStarted = true;
      this.map.tools.stopWithRuntimeLease(ownerToken);
      this.map.selection.clearWithRuntimeLease(ownerToken);
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

      this.updateTransaction({
        stage: "finalize",
        cleanupStatus: "running",
        cleanupErrors: undefined
      });
      const cleanupErrors = await this.finalizeStagesBestEffort(prepared);
      this.updateTransaction({
        stage: "finalize",
        cleanupStatus: cleanupErrors.length === 0 ? "succeeded" : "failed",
        cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined
      });
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

  private createStagePlans(
    snapshot: SceneSnapshot,
    options: SceneStateLoadOptions,
    context: OperationContext,
    cameraBaseline: CameraView
  ): SceneStagePlan[] {
    const ownerToken = requireRuntimeLeaseOwner(options);
    let layerPreflight: LayerTransactionPreflight | undefined;
    const plans: SceneStagePlan[] = [
      {
        phase: "layers",
        preflight: async () => {
          layerPreflight = await this.map.layers.preflightTransaction(
            snapshot.layers,
            withRuntimeLeaseOwner(
              { clear: options.clearLayers ?? true, flyTo: false },
              ownerToken
            )
          );
          return {
            phase: "layers",
            value: layerPreflight
          };
        },
        prepare: (preflight) => this.map.layers.prepareTransaction(
          snapshot.layers,
          withRuntimeLeaseOwner(
            { clear: options.clearLayers ?? true, flyTo: false },
            ownerToken
          ),
          preflight?.value as LayerTransactionPreflight | undefined
        )
      },
      {
        phase: "bookmarks",
        prepare: () => Promise.resolve(
          this.createBookmarkStage(snapshot.bookmarks, ownerToken)
        )
      }
    ];

    const restoreResults = options.restoreResults ?? false;
    const clearResults = options.clearResults ?? restoreResults;
    if (clearResults || restoreResults) {
      const results = restoreResults && snapshot.results
        ? snapshot.results
        : emptyResultsSnapshot();
      plans.push(
        {
          phase: "draw",
          preflight: () => ({
            phase: "draw",
            value: this.map.draw.preflightSceneLoad(
              results.draw,
              withRuntimeLeaseOwner({ clear: clearResults }, ownerToken)
            )
          }),
          prepare: (preflight) => this.map.draw.prepareSceneLoad(
            results.draw,
            withRuntimeLeaseOwner({ clear: clearResults }, ownerToken),
            preflight?.value as object | undefined
          )
        },
        {
          phase: "analysis",
          preflight: () => {
            if (!layerPreflight) {
              throw new Error("Layer Scene preflight must run before analysis preflight.");
            }
            return this.map.analysis.preflightSceneLoad(
              {
                measure: results.measure,
                visibility: results.visibility,
                profile: results.profile,
                clipping: results.clipping,
                terrain: results.terrain ?? []
              },
              withRuntimeLeaseOwner({ clear: clearResults }, ownerToken),
              { availableLayerIds: collectAvailableLayerIds(layerPreflight) }
            );
          },
          prepare: (preflight) => this.map.analysis.prepareSceneLoad(
            {
              measure: results.measure,
              visibility: results.visibility,
              profile: results.profile,
              clipping: results.clipping,
              terrain: results.terrain ?? []
            },
            withRuntimeLeaseOwner({ clear: clearResults }, ownerToken),
            preflight?.value as AnalysisScenePreflightToken | undefined
          )
        }
      );
    }

    const restorePrimitives = options.restorePrimitives ?? false;
    const clearPrimitives = options.clearPrimitives ?? restorePrimitives;
    if (clearPrimitives || restorePrimitives) {
      plans.push({
        phase: "primitives",
        preflight: () => ({
          phase: "primitives",
          value: this.map.primitives.preflightSceneLoad(
            restorePrimitives ? snapshot.primitives ?? [] : [],
            withRuntimeLeaseOwner({ clear: clearPrimitives }, ownerToken)
          )
        }),
        prepare: (preflight) => this.map.primitives.prepareSceneLoad(
          restorePrimitives ? snapshot.primitives ?? [] : [],
          withRuntimeLeaseOwner({ clear: clearPrimitives }, ownerToken),
          preflight?.value as object | undefined
        )
      });
    }

    const restoreOverlays = options.restoreOverlays ?? false;
    const clearOverlays = options.clearOverlays ?? restoreOverlays;
    if (clearOverlays || restoreOverlays) {
      plans.push({
        phase: "overlays",
        preflight: () => ({
          phase: "overlays",
          value: this.map.overlays.preflightSceneLoad(
            restoreOverlays ? snapshot.overlays ?? [] : [],
            withRuntimeLeaseOwner({ clear: clearOverlays }, ownerToken)
          )
        }),
        prepare: (preflight) => this.map.overlays.prepareSceneLoad(
          restoreOverlays ? snapshot.overlays ?? [] : [],
          withRuntimeLeaseOwner({ clear: clearOverlays }, ownerToken),
          preflight?.value as object | undefined
        )
      });
    }

    const restoreEffects = options.restoreEffects ?? false;
    const clearEffects = options.clearEffects ?? restoreEffects;
    if (clearEffects || restoreEffects) {
      plans.push({
        phase: "effects",
        preflight: () => ({
          phase: "effects",
          value: this.map.effects.preflightSceneLoad(
            restoreEffects ? snapshot.effects ?? [] : [],
            withRuntimeLeaseOwner({ clear: clearEffects }, ownerToken)
          )
        }),
        prepare: (preflight) => this.map.effects.prepareSceneLoad(
          restoreEffects ? snapshot.effects ?? [] : [],
          withRuntimeLeaseOwner({ clear: clearEffects }, ownerToken),
          preflight?.value as object | undefined
        )
      });
    }

    if ((options.flyToCamera ?? true) && snapshot.camera) {
      plans.push({
        phase: "camera",
        prepare: () => Promise.resolve(
          this.createCameraStage(
            snapshot.camera!,
            cameraBaseline,
            context,
            ownerToken
          )
        )
      });
    }
    return plans;
  }

  private createBookmarkStage(
    bookmarks: CameraBookmark[],
    ownerToken?: RuntimeLeaseOwnerToken
  ): PreparedSceneStage {
    const previous = this.bookmarks.list();
    const next = bookmarks.map(cloneBookmark);
    let committed = false;
    return {
      phase: "bookmarks",
      commit: () => {
        this.bookmarks.replaceWithOwner(next, ownerToken);
        committed = true;
      },
      rollback: () => {
        if (committed) {
          this.bookmarks.replaceWithOwner(previous, ownerToken);
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
    context: OperationContext,
    ownerToken: RuntimeLeaseOwnerToken
  ): PreparedSceneStage {
    const previous = cloneCameraView(baseline);
    let commitStarted = false;
    return {
      phase: "camera",
      commit: async () => {
        commitStarted = true;
        this.map.viewer.camera.cancelFlight();
        const completed = await this.flyToCameraWithOperation(view, context, ownerToken);
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

  private async finalizeStagesBestEffort(
    stages: PreparedSceneStage[]
  ): Promise<OperationErrorInfo[]> {
    const errors: OperationErrorInfo[] = [];
    for (const stage of stages) {
      this.updateTransaction({ stage: `finalize.${stage.phase}` });
      try {
        await stage.finalize();
      } catch (error) {
        // Commit is already complete. Finalization only retires old runtime and
        // must not turn an applied scene into a transaction rollback.
        const info = toErrorInfo(error);
        errors.push({ ...info, message: `${stage.phase}: ${info.message}` });
      }
    }
    return errors;
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
      const ownerToken = requireRuntimeLeaseOwner(options);
      this.map.tools.stopWithRuntimeLease(ownerToken);
      this.map.selection.clearWithRuntimeLease(ownerToken);
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
    const ownerToken = requireRuntimeLeaseOwner(options);
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
            withRuntimeLeaseOwner(
              { clear: options.clearLayers ?? true, flyTo: false },
              ownerToken
            ),
            scope
          )
        )
      },
      {
        phase: "bookmarks",
        run: () => this.bookmarks.replaceWithOwner(snapshot.bookmarks, ownerToken)
      }
    ];

    if (clearResults || restoreResults) {
      stages.push({
        phase: "results",
        run: async (scope) => {
          const results = restoreResults && snapshot.results
            ? snapshot.results
            : emptyResultsSnapshot();
          await this.map.draw.load(
            results.draw,
            withRuntimeLeaseOwner({ clear: clearResults }, ownerToken)
          );
          scope.throwIfAborted();
          await this.map.analysis.load(
            {
              measure: results.measure,
              visibility: results.visibility,
              profile: results.profile,
              clipping: results.clipping,
              terrain: results.terrain ?? []
            },
            withRuntimeLeaseOwner({ clear: clearResults }, ownerToken)
          );
        }
      });
    }

    if (clearPrimitives || restorePrimitives) {
      stages.push({
        phase: "primitives",
        run: () => this.map.primitives.load(
          restorePrimitives ? snapshot.primitives ?? [] : [],
          withRuntimeLeaseOwner({ clear: clearPrimitives }, ownerToken)
        )
      });
    }
    if (clearOverlays || restoreOverlays) {
      stages.push({
        phase: "overlays",
        run: async (scope) => {
          await this.map.overlays.load(
            restoreOverlays ? snapshot.overlays ?? [] : [],
            withRuntimeLeaseOwner({ clear: clearOverlays }, ownerToken)
          );
          scope.throwIfAborted();
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
              withOperationContext(
                withRuntimeLeaseOwner({ clear: clearEffects }, ownerToken),
                scope
              )
            );
          }
          return this.map.effects.load(
            [],
            withOperationContext(
              withRuntimeLeaseOwner({ clear: true }, ownerToken),
              scope
            )
          );
        }
      });
    }
    if ((options.flyToCamera ?? true) && snapshot.camera) {
      stages.push({
        phase: "camera",
        run: (scope) => this.flyToCameraWithOperation(
          snapshot.camera!,
          scope,
          ownerToken
        )
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
    context: OperationContext,
    ownerToken: RuntimeLeaseOwnerToken
  ): Promise<boolean> {
    assertRuntimeMutationAllowed(
      this.map.concurrency,
      "camera",
      "scene.camera",
      ownerToken
    );
    const camera = this.map.viewer.camera;
    const cancelFlight = () => camera.cancelFlight();
    context.signal.addEventListener("abort", cancelFlight, { once: true });
    try {
      context.throwIfAborted();
      const completed = await this.flyToCameraInternal(view);
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
      cleanupStatus: "not-needed",
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
      this.bookmarks.destroy();
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
  run(context: OperationContext): unknown | Promise<unknown>;
}

export class CameraBookmarkManager {
  private readonly items = new Map<string, CameraBookmark>();

  constructor(private readonly map?: KairosMap) {}

  add(bookmark: CameraBookmarkInput): CameraBookmark {
    return this.runMutation("bookmarks.add", () => this.addInternal(bookmark));
  }

  private addInternal(bookmark: CameraBookmarkInput): CameraBookmark {
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
    return this.runMutation("bookmarks.remove", () => this.items.delete(id));
  }

  clear(): void {
    this.runMutation("bookmarks.clear", () => this.clearInternal());
  }

  private clearInternal(): void {
    this.items.clear();
  }

  replace(bookmarks: CameraBookmark[]): void {
    this.runMutation("bookmarks.replace", () => this.replaceInternal(bookmarks));
  }

  /** @internal */
  replaceWithOwner(
    bookmarks: CameraBookmark[],
    ownerToken?: RuntimeLeaseOwnerToken
  ): void {
    this.runMutation(
      "scene.bookmarks.replace",
      () => this.replaceInternal(bookmarks),
      ownerToken
    );
  }

  private replaceInternal(bookmarks: CameraBookmark[]): void {
    this.clearInternal();
    for (const bookmark of bookmarks) {
      this.addInternal(bookmark);
    }
  }

  /** @internal */
  destroy(): void {
    this.clearInternal();
  }

  private runMutation<T>(
    kind: string,
    task: () => T,
    ownerToken?: RuntimeLeaseOwnerToken
  ): T {
    if (!this.map) return task();
    return runWithRuntimeWriteLease(
      this.map.concurrency,
      { kind, resources: ["bookmarks"], ownerToken },
      () => task()
    );
  }
}

function collectAvailableLayerIds(
  preflight: LayerTransactionPreflight
): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!preflight.clear) {
    for (const [id] of preflight.oldEntries) {
      ids.add(id);
    }
  }
  for (const layer of preflight.nextLayers) {
    ids.add(layer.id);
  }
  return ids;
}

function cloneBookmark(bookmark: CameraBookmark): CameraBookmark {
  return {
    ...bookmark,
    view: cloneCameraView(bookmark.view)
  };
}

function requireRuntimeLeaseOwner(options: SceneStateLoadOptions): RuntimeLeaseOwnerToken {
  const ownerToken = getRuntimeLeaseOwner(options);
  if (!ownerToken) {
    throw new Error("Scene load requires an active runtime lease owner.");
  }
  return ownerToken;
}

function cloneTransactionState(state: SceneTransactionState): SceneTransactionState {
  return Object.freeze({
    ...state,
    error: state.error ? Object.freeze({ ...state.error }) : undefined,
    rollbackErrors: state.rollbackErrors?.map((error) => Object.freeze({ ...error })),
    cleanupErrors: state.cleanupErrors?.map((error) => Object.freeze({ ...error })),
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
