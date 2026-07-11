import type { KairosMap } from "@kairos3d/cesium/core";
import { RuntimeMutationConflictError } from "@kairos3d/cesium/concurrency";
import type { EffectConfig, EffectType } from "@kairos3d/cesium/effects";
import {
  layerRegistry,
  type BaseLayerConfig,
  type LayerAdapter,
  type LayerConfig
} from "@kairos3d/cesium/layers";
import { isOperationCanceledError } from "@kairos3d/cesium/operations";
import { SceneTransactionError, type SceneSnapshot } from "@kairos3d/cesium/scene";
import { createMemoryWidgetSnapshotStorage } from "@kairos3d/cesium-widget";
import { Cartesian3, EllipsoidTerrainProvider, Material } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  KairosMapProvider,
  KairosMapViewport,
  KairosWidgetHost,
  KairosWidgetShell,
  KairosWidgetToolbar,
  useKairosMapState
} from "../../src";
import { standardWidgets } from "../../src/widgets";
import "../../src/styles.css";
import "./smoke.css";

const snapshotStorage = createMemoryWidgetSnapshotStorage();
const waterNormalMap = "/cesiumStatic/Assets/Textures/waterNormalsSmall.jpg";
const particleImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='12' fill='%2300d4ff' fill-opacity='.82'/%3E%3C/svg%3E";
const expectedTypes: EffectType[] = [
  "flow-line",
  "flow-wall",
  "pulse-circle",
  "radar-scan",
  "water-surface",
  "particle",
  "rain",
  "snow",
  "fog"
];

interface SmokeCounts {
  effects: number;
  runtimeObjects: number;
  animatedEffects: number;
  scenePrimitives: number;
  postProcessStages: number;
}

interface SmokeReport {
  status: "idle" | "running" | "ready" | "cleared" | "error";
  checks: Record<string, boolean>;
  counts: Partial<Record<"baseline" | "added" | "updated" | "removed" | "cleared" | "restored", SmokeCounts>>;
  ids: string[];
  types: EffectType[];
  error?: string;
}

const initialReport: SmokeReport = {
  status: "idle",
  checks: {},
  counts: {},
  ids: [],
  types: []
};

function BrowserSmoke() {
  const state = useKairosMapState();
  const started = useRef(false);
  const snapshot = useRef<SceneSnapshot | undefined>(undefined);
  const [report, setReport] = useState<SmokeReport>(initialReport);

  useEffect(() => {
    if (state.status !== "ready" || !state.map || started.current) {
      return;
    }
    started.current = true;
    let active = true;
    const map = state.map;
    seedM7Objects(map);
    setReport((current) => ({ ...current, status: "running" }));
    void runEffectsSmoke(map)
      .then((result) => {
        snapshot.current = result.snapshot;
        if (active) {
          setReport(result.report);
        }
      })
      .catch((cause) => {
        if (active) {
          setReport({
            ...initialReport,
            status: "error",
            error: cause instanceof Error ? cause.message : String(cause)
          });
        }
      });
    return () => {
      active = false;
    };
  }, [state]);

  const clearEffects = () => {
    if (state.status !== "ready" || !state.map) {
      return;
    }
    const map = state.map;
    map.effects.clear();
    setReport((current) => ({
      ...current,
      status: "cleared",
      counts: { ...current.counts, cleared: captureCounts(map) },
      ids: [],
      types: []
    }));
  };

  const restoreEffects = async () => {
    if (state.status !== "ready" || !state.map || !snapshot.current) {
      return;
    }
    const map = state.map;
    const savedSnapshot = snapshot.current;
    setReport((current) => ({ ...current, status: "running", error: undefined }));
    try {
      await restoreSnapshot(map, savedSnapshot);
      const restored = map.effects.list();
      setReport((current) => ({
        ...current,
        status: "ready",
        counts: { ...current.counts, restored: captureCounts(map) },
        ids: restored.map((effect) => effect.id),
        types: restored.map((effect) => effect.type)
      }));
    } catch (cause) {
      setReport((current) => ({
        ...current,
        status: "error",
        error: cause instanceof Error ? cause.message : String(cause)
      }));
    }
  };

  const rerun = async () => {
    if (state.status !== "ready" || !state.map) {
      return;
    }
    setReport({ ...initialReport, status: "running" });
    try {
      state.map.effects.clear();
      const result = await runEffectsSmoke(state.map);
      snapshot.current = result.snapshot;
      setReport(result.report);
    } catch (cause) {
      setReport({
        ...initialReport,
        status: "error",
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  };

  const passed =
    report.status === "ready" &&
    Object.keys(report.checks).length > 0 &&
    Object.values(report.checks).every(Boolean);
  const currentCounts =
    report.status === "cleared"
      ? report.counts.cleared
      : report.counts.restored ?? report.counts.updated ?? report.counts.added;

  return (
    <>
      <output className="smoke-status" data-k3d-status={state.status}>
        {state.status}
      </output>
      <aside
        className="effects-smoke"
        role="status"
        data-k3d-effects-status={report.status}
        data-k3d-effects-pass={passed ? "true" : "false"}
        data-k3d-runtime-count={currentCounts?.runtimeObjects ?? 0}
        data-k3d-animated-count={currentCounts?.animatedEffects ?? 0}
        data-k3d-scene-primitive-count={currentCounts?.scenePrimitives ?? 0}
        data-k3d-stage-count={currentCounts?.postProcessStages ?? 0}
        aria-label={`M8 Effects, M9 Operations, M10 Scene Transactions, and M11 Runtime Concurrency smoke report: ${report.status}; ${Object.values(report.checks).filter(Boolean).length}/${Object.keys(report.checks).length} checks`}
      >
        <header>
          <strong>M8 Effects / M9 Operations / M10 Transactions / M11 Concurrency</strong>
          <span className={`effects-smoke__badge effects-smoke__badge--${report.status}`}>
            {report.status}
          </span>
        </header>
        <div className="effects-smoke__actions">
          <button type="button" onClick={clearEffects} disabled={state.status !== "ready"}>
            Clear
          </button>
          <button
            type="button"
            onClick={() => void restoreEffects()}
            disabled={state.status !== "ready" || !snapshot.current}
          >
            Restore
          </button>
          <button
            type="button"
            aria-label={`Rerun smoke verification: ${report.status}; ${Object.values(report.checks).filter(Boolean).length}/${Object.keys(report.checks).length} checks`}
            onClick={() => void rerun()}
            disabled={state.status !== "ready"}
          >
            Rerun
          </button>
        </div>
        <div className="effects-smoke__summary">
          <span data-k3d-effect-count={report.ids.length}>{report.ids.length} effects</span>
          <span data-k3d-check-count={Object.keys(report.checks).length}>
            {Object.values(report.checks).filter(Boolean).length}/{Object.keys(report.checks).length} checks
          </span>
        </div>
        {report.error && <div className="effects-smoke__error" role="alert">{report.error}</div>}
        <pre data-k3d-effects-report>{JSON.stringify(report, null, 2)}</pre>
      </aside>
    </>
  );
}

async function runEffectsSmoke(map: KairosMap): Promise<{
  snapshot: SceneSnapshot;
  report: SmokeReport;
}> {
  markSmokeStep("effects-add");
  map.effects.clear();
  map.operations.clearFinished();
  const baseline = captureCounts(map);
  setCamera(map);

  for (const config of createEffectConfigs()) {
    await map.effects.add(config);
  }
  const added = captureCounts(map);
  const addedEffects = map.effects.list();
  const checks: Record<string, boolean> = {
    allNineCreated: addedEffects.length === expectedTypes.length,
    allTypesCreated: sameTypes(addedEffects.map((effect) => effect.type), expectedTypes),
    oneRuntimePerEffect: added.runtimeObjects === expectedTypes.length,
    sceneObjectsAdded:
      added.scenePrimitives === baseline.scenePrimitives + 6 &&
      added.postProcessStages === baseline.postProcessStages + 3
  };

  const weatherHidden = map.effects.setGroupShow("weather", false);
  checks.groupHide = weatherHidden.length === 3 && weatherHidden.every((effect) => !effect.show);
  const weatherShown = map.effects.setGroupShow("weather", true);
  checks.groupShow = weatherShown.length === 3 && weatherShown.every((effect) => effect.show);
  map.effects.setShow("snow-1", false);
  checks.singleHide = map.effects.get("snow-1")?.show === false;

  await map.effects.update("flow-line-1", {
    material: { type: "flow", color: "#35d07f", speed: 2, repeat: 5 }
  });
  const updated = captureCounts(map);
  checks.updateRuntimeStable =
    updated.runtimeObjects === added.runtimeObjects &&
    updated.scenePrimitives === added.scenePrimitives &&
    updated.postProcessStages === added.postProcessStages;
  checks.updateApplied =
    map.effects.get("flow-line-1")?.config.type === "flow-line" &&
    map.effects.get("flow-line-1")?.updatedAt instanceof Date;

  const snapshot = map.sceneState.toJSON({ includeEffects: true });
  checks.snapshotIncludesEffects = snapshot.effects?.length === expectedTypes.length;

  map.effects.remove("rain-1");
  const removed = captureCounts(map);
  checks.removeCleansStage =
    removed.effects === expectedTypes.length - 1 &&
    removed.postProcessStages === updated.postProcessStages - 1;

  map.effects.clear();
  const cleared = captureCounts(map);
  checks.clearRestoresBaseline =
    cleared.effects === 0 &&
    cleared.runtimeObjects === 0 &&
    cleared.animatedEffects === 0 &&
    cleared.scenePrimitives === baseline.scenePrimitives &&
    cleared.postProcessStages === baseline.postProcessStages;

  await restoreSnapshot(map, snapshot);
  const restored = captureCounts(map);
  const restoredEffects = map.effects.list();
  checks.restoreCount = restored.effects === expectedTypes.length;
  checks.restoreIdentity =
    sameTypes(restoredEffects.map((effect) => effect.type), expectedTypes) &&
    restoredEffects.every((effect) => effect.id.endsWith("-1"));
  checks.restoreGroups =
    restoredEffects.filter((effect) => effect.group === "geometry").length === 5 &&
    restoredEffects.filter((effect) => effect.group === "weather").length === 3 &&
    restoredEffects.filter((effect) => effect.group === "particle").length === 1;
  checks.restoreShow = map.effects.get("snow-1")?.show === false;
  checks.restoreRuntimeCount = restored.runtimeObjects === expectedTypes.length;
  markSmokeStep("operations");
  Object.assign(checks, await runOperationChecks(map, restored));
  markSmokeStep("runtime-concurrency");
  Object.assign(checks, await runRuntimeConcurrencyChecks(map));
  markSmokeStep("scene-transactions");
  Object.assign(checks, await runSceneTransactionChecks(map));
  markSmokeStep("complete");

  return {
    snapshot,
    report: {
      status: Object.values(checks).every(Boolean) ? "ready" : "error",
      checks,
      counts: { baseline, added, updated, removed, cleared, restored },
      ids: restoredEffects.map((effect) => effect.id),
      types: restoredEffects.map((effect) => effect.type),
      error: Object.values(checks).every(Boolean) ? undefined : "One or more smoke checks failed."
    }
  };
}

async function runOperationChecks(
  map: KairosMap,
  baseline: SmokeCounts
): Promise<Record<string, boolean>> {
  const effectsLoadId = "browser-effects-load";
  let runningProgressObserved = false;
  const offEffectsLoad = map.operations.on("change", (event) => {
    const operation = event.data;
    if (
      operation.id === effectsLoadId &&
      operation.status === "running" &&
      (operation.progress ?? 0) > 0 &&
      (operation.progress ?? 0) < 1 &&
      Boolean(operation.phase)
    ) {
      runningProgressObserved = true;
    }
  });
  try {
    await map.effects.load(map.effects.toJSON(), {
      clear: true,
      operationId: effectsLoadId
    });
  } finally {
    offEffectsLoad();
  }
  const afterEffectsLoad = captureCounts(map);

  const delayedType = "browser-delayed-material";
  let markStarted!: () => void;
  let resolveMaterial!: (material: Material) => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const delayedMaterial = new Promise<Material>((resolve) => {
    resolveMaterial = resolve;
  });
  map.materials.register({
    type: delayedType,
    targets: ["primitive"],
    createMaterial: async () => {
      markStarted();
      return delayedMaterial;
    }
  });

  const canceledId = "browser-effect-cancel";
  const canceledEffect = "browser-canceled-effect";
  const canceledPromise = map.effects.add(
    {
      id: canceledEffect,
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(114.17, 22.3),
      radius: 100,
      material: { type: delayedType, options: {} }
    },
    { operationId: canceledId }
  );
  await started;
  const cancelAccepted = map.operations.cancel(canceledId);
  let canceledRejected = false;
  try {
    await canceledPromise;
  } catch (error) {
    canceledRejected = isOperationCanceledError(error);
  }

  const lateMaterial = Material.fromType(Material.ColorType);
  resolveMaterial(lateMaterial);
  await waitForFrames(2);
  map.materials.unregister(delayedType);

  const failureType = "browser-failing-material";
  map.materials.register({
    type: failureType,
    targets: ["primitive"],
    createMaterial: async () => {
      throw new Error("browser operation failure");
    }
  });
  const failedId = "browser-effect-failure";
  let failureRejected = false;
  try {
    await map.effects.add(
      {
        id: "browser-failed-effect",
        type: "pulse-circle",
        position: Cartesian3.fromDegrees(114.17, 22.3),
        radius: 100,
        material: { type: failureType, options: {} }
      },
      { operationId: failedId }
    );
  } catch (error) {
    failureRejected = error instanceof Error && error.message === "browser operation failure";
  }
  map.materials.unregister(failureType);

  const successful = map.operations.list({ status: "succeeded" });
  const operationCounts = map.performance.getStats();
  const after = captureCounts(map);
  return {
    operationsTracked:
      successful.some((operation) => operation.kind === "effects.add") &&
      successful.some((operation) => operation.kind === "effects.update") &&
      successful.some((operation) => operation.kind === "effects.load") &&
      successful.some((operation) => operation.kind === "scene.load"),
    independentEffectsLoadSucceeded:
      map.operations.get(effectsLoadId)?.status === "succeeded" &&
      afterEffectsLoad.effects === baseline.effects &&
      afterEffectsLoad.runtimeObjects === baseline.runtimeObjects,
    runningProgressObserved,
    operationProgressComplete: successful.every((operation) => operation.progress === 1),
    sceneLoadUsesOneParent:
      map.operations.list({ kind: "scene.load" }).length === 1 &&
      map.operations.list({ kind: "effects.load" }).length === 1 &&
      map.operations.get(effectsLoadId)?.kind === "effects.load",
    cancelAccepted,
    canceledRejected,
    canceledState: map.operations.get(canceledId)?.status === "canceled",
    canceledRuntimeCleaned:
      map.effects.get(canceledEffect) === undefined &&
      after.effects === baseline.effects &&
      after.runtimeObjects === baseline.runtimeObjects &&
      lateMaterial.isDestroyed(),
    failureRejected,
    failedState:
      map.operations.get(failedId)?.status === "failed" &&
      map.operations.get(failedId)?.error?.message === "browser operation failure",
    operationPerformanceCounts:
      operationCounts.activeOperationCount === 0 && operationCounts.failedOperationCount === 1
  };
}

async function runRuntimeConcurrencyChecks(
  map: KairosMap
): Promise<Record<string, boolean>> {
  const checks: Record<string, boolean> = {};
  const baselineSnapshot = map.sceneState.toJSON({ includeEffects: true });
  const baselineCounts = captureCounts(map);
  const operationCountBefore = map.operations.list().length;
  const baselineEffect = map.effects.list()[0];
  if (!baselineEffect) {
    throw new Error("Browser concurrency fixture requires an existing effect.");
  }

  let waitingEventObserved = false;
  let activeEventObserved = false;
  const offConcurrency = map.concurrency.on("change", (event) => {
    waitingEventObserved ||= event.data.leases.some(
      (lease) => lease.kind === "scene.load" && lease.status === "waiting"
    );
    activeEventObserved ||= event.data.leases.some(
      (lease) => lease.kind === "effects.add" && lease.status === "active"
    );
  });

  const waitMaterial = createDelayedBrowserMaterial(map, "browser-concurrency-wait-material");
  const waitEffectId = "browser-concurrency-wait-effect";
  const waitWriter = map.effects.add(
    createDelayedPulseEffect(waitEffectId, waitMaterial.type),
    { operationId: "browser-concurrency-writer-wait" }
  );
  await waitMaterial.started;
  const waitLoadId = "browser-concurrency-scene-wait";
  const waitingScene = map.sceneState.load(baselineSnapshot, {
    clearLayers: true,
    restoreEffects: true,
    clearEffects: true,
    flyToCamera: false,
    operationId: waitLoadId
  });
  const waitingLeaseVisible = map.concurrency.list({
    kind: "scene.load",
    status: "waiting"
  }).length === 1;
  const waitingStats = map.performance.getStats();
  let reservedMutationRejected = false;
  try {
    map.effects.setShow(baselineEffect.id, !baselineEffect.show);
  } catch (error) {
    reservedMutationRejected = error instanceof RuntimeMutationConflictError;
  }
  waitMaterial.resolve();
  await waitWriter;
  await waitingScene;
  await map.sceneState.whenIdle();
  waitMaterial.unregister();
  const afterWait = captureCounts(map);
  checks.sceneWaitsForActiveMutation =
    waitingLeaseVisible &&
    waitingStats.activeMutationLeaseCount >= 1 &&
    waitingStats.waitingMutationLeaseCount >= 1 &&
    map.operations.get(waitLoadId)?.status === "succeeded";
  checks.sceneReservationRejectsLaterMutation = reservedMutationRejected;
  checks.concurrencyChangeEventsObserved = waitingEventObserved && activeEventObserved;
  checks.waitingRestoreDoesNotAccumulateRuntime =
    afterWait.effects === baselineCounts.effects &&
    afterWait.runtimeObjects === baselineCounts.runtimeObjects &&
    afterWait.scenePrimitives === baselineCounts.scenePrimitives &&
    afterWait.postProcessStages === baselineCounts.postProcessStages;

  const rejectMaterial = createDelayedBrowserMaterial(map, "browser-concurrency-reject-material");
  const rejectEffectId = "browser-concurrency-reject-effect";
  const rejectWriter = map.effects.add(
    createDelayedPulseEffect(rejectEffectId, rejectMaterial.type),
    { operationId: "browser-concurrency-writer-reject" }
  );
  await rejectMaterial.started;
  let rejectConflict = false;
  try {
    await map.sceneState.load(baselineSnapshot, {
      conflictPolicy: "reject",
      operationId: "browser-concurrency-scene-reject"
    });
  } catch (error) {
    rejectConflict = error instanceof RuntimeMutationConflictError;
  }
  rejectMaterial.resolve();
  await rejectWriter;
  map.effects.remove(rejectEffectId);
  rejectMaterial.unregister();
  checks.sceneRejectPolicyFailsImmediately =
    rejectConflict &&
    map.operations.get("browser-concurrency-scene-reject")?.status === "failed";

  let fixtureCreated = 0;
  let fixturePreflighted = 0;
  const cancelLayerType = "browser-concurrency-cancel-layer";
  const unregisterCancelLayer = registerFixtureLayer(cancelLayerType, {
    create: () => {
      fixtureCreated += 1;
    },
    preflight: () => {
      fixturePreflighted += 1;
    }
  });
  const cancelSnapshot = snapshotWithFixtureLayer(
    baselineSnapshot,
    cancelLayerType,
    "waiting-cancel"
  );
  const cancelMaterial = createDelayedBrowserMaterial(map, "browser-concurrency-cancel-material");
  const cancelEffectId = "browser-concurrency-cancel-effect";
  const cancelWriter = map.effects.add(
    createDelayedPulseEffect(cancelEffectId, cancelMaterial.type),
    { operationId: "browser-concurrency-writer-cancel" }
  );
  await cancelMaterial.started;
  const cancelController = new AbortController();
  const cancelLoadId = "browser-concurrency-scene-cancel";
  const canceledLoad = map.sceneState.load(cancelSnapshot, {
    signal: cancelController.signal,
    operationId: cancelLoadId
  });
  const cancelWaitVisible = map.concurrency.list({
    kind: "scene.load",
    status: "waiting"
  }).length === 1;
  cancelController.abort();
  let waitCanceled = false;
  try {
    await canceledLoad;
  } catch (error) {
    waitCanceled = isOperationCanceledError(error);
  }
  cancelMaterial.resolve();
  await cancelWriter;
  map.effects.remove(cancelEffectId);
  cancelMaterial.unregister();
  unregisterCancelLayer();
  await map.sceneState.whenIdle();
  await map.concurrency.whenIdle();
  offConcurrency();

  const finalStats = map.performance.getStats();
  const finalCounts = captureCounts(map);
  checks.sceneWaitCancellationSkipsPreflight =
    cancelWaitVisible &&
    waitCanceled &&
    fixtureCreated === 0 &&
    fixturePreflighted === 0 &&
    map.operations.get(cancelLoadId)?.status === "canceled";
  checks.concurrencyReturnsIdle =
    map.concurrency.list().length === 0 &&
    finalStats.activeMutationLeaseCount === 0 &&
    finalStats.waitingMutationLeaseCount === 0;
  checks.concurrencyCleansRuntime =
    finalCounts.effects === baselineCounts.effects &&
    finalCounts.runtimeObjects === baselineCounts.runtimeObjects &&
    finalCounts.animatedEffects === baselineCounts.animatedEffects &&
    finalCounts.scenePrimitives === baselineCounts.scenePrimitives &&
    finalCounts.postProcessStages === baselineCounts.postProcessStages;
  const operationIds = [
    "browser-concurrency-writer-wait",
    waitLoadId,
    "browser-concurrency-writer-reject",
    "browser-concurrency-scene-reject",
    "browser-concurrency-writer-cancel",
    cancelLoadId
  ];
  checks.sceneConcurrencyUsesSingleOperations =
    map.operations.list().length === operationCountBefore + operationIds.length &&
    operationIds.every(
      (id) => map.operations.list().filter((operation) => operation.id === id).length === 1
    ) &&
    [waitLoadId, "browser-concurrency-scene-reject", cancelLoadId].every(
      (id) => map.operations.get(id)?.kind === "scene.load"
    );
  return checks;
}

function createDelayedBrowserMaterial(map: KairosMap, type: string) {
  let markStarted!: () => void;
  let resolveMaterial!: (material: Material) => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const material = new Promise<Material>((resolve) => {
    resolveMaterial = resolve;
  });
  map.materials.register({
    type,
    targets: ["primitive"],
    createMaterial: async () => {
      markStarted();
      return material;
    }
  });
  return {
    type,
    started,
    resolve: () => resolveMaterial(Material.fromType(Material.ColorType)),
    unregister: () => map.materials.unregister(type)
  };
}

function createDelayedPulseEffect(id: string, materialType: string): EffectConfig {
  return {
    id,
    type: "pulse-circle",
    position: Cartesian3.fromDegrees(114.17, 22.3),
    radius: 100,
    material: { type: materialType, options: {} }
  };
}

async function runSceneTransactionChecks(map: KairosMap): Promise<Record<string, boolean>> {
  markSmokeStep("scene-prepare-failure");
  const checks: Record<string, boolean> = {};
  await ensureTransactionFixtureSections(map);
  const operationCountBefore = map.operations.list().length;
  const baselineSnapshot = map.sceneState.toJSON({
    includeResults: true,
    includePrimitives: true,
    includeOverlays: true,
    includeEffects: true
  });
  const baselineFingerprint = captureSceneFingerprint(map);
  const baselineRuntimeIdentity = captureSceneRuntimeIdentity(map);
  const loadOptions = {
    clearLayers: true,
    flyToCamera: false,
    restoreResults: true,
    clearResults: true,
    restorePrimitives: true,
    clearPrimitives: true,
    restoreOverlays: true,
    clearOverlays: true,
    restoreEffects: true,
    clearEffects: true
  } as const;

  const invalidMaterialSnapshot = structuredClone(baselineSnapshot);
  const materialEffect = invalidMaterialSnapshot.effects?.find(
    (effect) => effect.config.material !== undefined
  );
  if (!materialEffect) {
    throw new Error("Browser transaction fixture requires an effect with a material.");
  }
  materialEffect.config.material = {
    type: "browser-missing-material",
    options: {}
  };
  let prepareError: unknown;
  try {
    await map.sceneState.load(invalidMaterialSnapshot, {
      ...loadOptions,
      operationId: "browser-scene-prepare-failure"
    });
  } catch (error) {
    prepareError = error;
  }
  await map.sceneState.whenIdle();
  const afterPrepareFailure = captureSceneFingerprint(map);
  checks.scenePrepareFailure =
    prepareError instanceof SceneTransactionError && prepareError.phase === "prepare";
  checks.scenePreparePreservesFingerprint =
    sameFingerprint(afterPrepareFailure, baselineFingerprint);
  checks.scenePreparePreservesRuntimeIdentity =
    sameRuntimeIdentity(captureSceneRuntimeIdentity(map), baselineRuntimeIdentity);

  markSmokeStep("scene-commit-failure");
  const commitFailureType = "browser-transaction-commit-failure";
  const unregisterCommitFailure = registerFixtureLayer(commitFailureType, {
    attach: () => {
      throw new Error("browser layer commit failure");
    }
  });
  let commitError: unknown;
  try {
    await map.sceneState.load(
      snapshotWithFixtureLayer(baselineSnapshot, commitFailureType, "commit-failure"),
      { ...loadOptions, operationId: "browser-scene-commit-failure" }
    );
  } catch (error) {
    commitError = error;
  } finally {
    unregisterCommitFailure();
  }
  await map.sceneState.whenIdle();
  const afterCommitFailure = captureSceneFingerprint(map);
  checks.sceneCommitFailure =
    commitError instanceof SceneTransactionError &&
    commitError.phase === "commit" &&
    commitError.rollbackStatus === "succeeded";
  checks.sceneCommitRestoresFingerprint =
    sameFingerprint(afterCommitFailure, baselineFingerprint);
  checks.sceneCommitRestoresRuntimeIdentity =
    sameRuntimeIdentity(captureSceneRuntimeIdentity(map), baselineRuntimeIdentity);

  markSmokeStep("scene-prepare-cancel");
  const prepareGate = createBrowserGate();
  const prepareCancelType = "browser-transaction-prepare-cancel";
  const unregisterPrepareCancel = registerFixtureLayer(prepareCancelType, {
    prepare: async () => {
      prepareGate.markStarted();
      await prepareGate.waitForRelease;
    }
  });
  const prepareCancelPromise = map.sceneState.load(
    snapshotWithFixtureLayer(baselineSnapshot, prepareCancelType, "prepare-cancel"),
    { ...loadOptions, operationId: "browser-scene-prepare-cancel" }
  );
  await prepareGate.started;
  markSmokeStep("scene-prepare-cancel-started");
  const prepareCancelAccepted = map.operations.cancel("browser-scene-prepare-cancel");
  markSmokeStep(`scene-prepare-cancel-requested-${prepareCancelAccepted}`);
  let prepareCanceledImmediately = false;
  try {
    await prepareCancelPromise;
  } catch (error) {
    prepareCanceledImmediately = isOperationCanceledError(error);
  }
  markSmokeStep(`scene-prepare-cancel-rejected-${prepareCanceledImmediately}`);
  let concurrentBlocked = false;
  try {
    await map.sceneState.load(baselineSnapshot, loadOptions);
  } catch (error) {
    concurrentBlocked =
      error instanceof Error && error.message.includes("already running");
  }
  markSmokeStep(`scene-prepare-cancel-concurrent-${concurrentBlocked}`);
  prepareGate.release();
  markSmokeStep("scene-prepare-cancel-released");
  await map.sceneState.whenIdle();
  const afterPrepareCancel = captureSceneFingerprint(map);
  markSmokeStep("scene-prepare-cancel-idle");
  unregisterPrepareCancel();
  checks.scenePrepareCancelImmediate = prepareCancelAccepted && prepareCanceledImmediately;
  checks.sceneCancelBlocksConcurrentLoad = concurrentBlocked;
  checks.scenePrepareCancelRestoresFingerprint =
    sameFingerprint(afterPrepareCancel, baselineFingerprint);
  checks.scenePrepareCancelRestoresRuntimeIdentity =
    sameRuntimeIdentity(captureSceneRuntimeIdentity(map), baselineRuntimeIdentity);

  markSmokeStep("scene-commit-cancel");
  const commitGate = createBrowserGate();
  const commitCancelType = "browser-transaction-commit-cancel";
  const unregisterCommitCancel = registerFixtureLayer(commitCancelType, {
    attach: async () => {
      commitGate.markStarted();
      await commitGate.waitForRelease;
    }
  });
  const transactionStatuses: string[] = [];
  const offTransaction = map.sceneState.on("transaction-change", (event) => {
    transactionStatuses.push(event.data.status);
  });
  const commitCancelPromise = map.sceneState.load(
    snapshotWithFixtureLayer(baselineSnapshot, commitCancelType, "commit-cancel"),
    { ...loadOptions, operationId: "browser-scene-commit-cancel" }
  );
  await commitGate.started;
  const commitCancelAccepted = map.operations.cancel("browser-scene-commit-cancel");
  let commitCanceledImmediately = false;
  try {
    await commitCancelPromise;
  } catch (error) {
    commitCanceledImmediately = isOperationCanceledError(error);
  }
  commitGate.release();
  await map.sceneState.whenIdle();
  const afterCommitCancel = captureSceneFingerprint(map);
  offTransaction();
  unregisterCommitCancel();
  checks.sceneCommitCancelImmediate = commitCancelAccepted && commitCanceledImmediately;
  checks.sceneCommitCancelRestoresFingerprint =
    sameFingerprint(afterCommitCancel, baselineFingerprint);
  checks.sceneCommitCancelRestoresRuntimeIdentity =
    sameRuntimeIdentity(captureSceneRuntimeIdentity(map), baselineRuntimeIdentity);
  checks.sceneRollbackStateObserved =
    transactionStatuses.includes("rolling-back") &&
    map.sceneState.getTransactionState()?.status === "canceled" &&
    map.sceneState.getTransactionState()?.rollbackStatus === "succeeded";

  markSmokeStep("scene-success");
  const successSnapshot = structuredClone(baselineSnapshot);
  successSnapshot.layers = successSnapshot.layers.map((layer) => ({
    ...layer,
    show: layer.id === "smoke-geojson" ? false : layer.show
  }));
  successSnapshot.bookmarks = successSnapshot.bookmarks.map((bookmark, index) =>
    index === 0 ? { ...bookmark, name: "事务恢复视角" } : bookmark
  );
  map.viewer.camera.setView({
    destination: Cartesian3.fromDegrees(113.9, 22.1, 9_000),
    orientation: { heading: 0.2, pitch: -1.1, roll: 0 }
  });
  const runtimeBeforeSuccess = captureSceneRuntimeIdentity(map);
  const countsBeforeSuccess = captureCounts(map);
  const successProgress: number[] = [];
  const successTransactionStatuses: string[] = [];
  const offSuccessOperation = map.operations.on("change", (event) => {
    if (
      event.data.id === "browser-scene-success" &&
      event.data.progress !== undefined
    ) {
      successProgress.push(event.data.progress);
    }
  });
  const offSuccessTransaction = map.sceneState.on("transaction-change", (event) => {
    if (event.data.operationId === "browser-scene-success") {
      successTransactionStatuses.push(event.data.status);
    }
  });
  try {
    await map.sceneState.load(successSnapshot, {
      ...loadOptions,
      flyToCamera: true,
      operationId: "browser-scene-success"
    });
  } finally {
    offSuccessOperation();
    offSuccessTransaction();
  }
  await map.sceneState.whenIdle();
  const runtimeAfterSuccess = captureSceneRuntimeIdentity(map);
  const countsAfterSuccess = captureCounts(map);
  const cameraAfterSuccess = map.sceneState.captureCamera();
  checks.sceneSuccessAppliesLayers =
    map.layers.listState().find((layer) => layer.id === "smoke-geojson")?.show === false &&
    sameSerializable(map.layers.toJSON(), successSnapshot.layers);
  checks.sceneSuccessAppliesBookmarks =
    map.sceneState.bookmarks.list()[0]?.name === "事务恢复视角" &&
    sameSerializable(map.sceneState.bookmarks.list(), successSnapshot.bookmarks);
  checks.sceneSuccessAppliesCamera =
    successSnapshot.camera !== undefined &&
    sameCameraView(cameraAfterSuccess, successSnapshot.camera);
  checks.sceneSuccessAppliesDraw =
    containsSerializable(map.draw.toJSON(), successSnapshot.results?.draw);
  checks.sceneSuccessAppliesAnalysis =
    containsSerializable(map.analysis.toJSON(), analysisSnapshotFromScene(successSnapshot));
  checks.sceneSuccessAppliesPrimitives =
    containsSerializable(map.primitives.toJSON(), successSnapshot.primitives);
  checks.sceneSuccessAppliesOverlays =
    containsSerializable(map.overlays.toJSON(), successSnapshot.overlays);
  checks.sceneSuccessAppliesEffects =
    containsSerializable(map.effects.toJSON(), successSnapshot.effects);
  checks.sceneSuccessReplacesRuntimeIdentity =
    runtimeIdentityReplaced(runtimeAfterSuccess, runtimeBeforeSuccess);
  const retiredDestroyables = destroyableRuntimeObjects(runtimeBeforeSuccess);
  checks.sceneSuccessDestroysRetiredRuntime =
    retiredDestroyables.length > 0 &&
    retiredDestroyables.every((object) => object.isDestroyed());
  checks.sceneSuccessRuntimeCountsStable =
    countsAfterSuccess.effects === countsBeforeSuccess.effects &&
    countsAfterSuccess.runtimeObjects === countsBeforeSuccess.runtimeObjects &&
    countsAfterSuccess.animatedEffects === countsBeforeSuccess.animatedEffects &&
    countsAfterSuccess.scenePrimitives === countsBeforeSuccess.scenePrimitives &&
    countsAfterSuccess.postProcessStages === countsBeforeSuccess.postProcessStages;
  checks.sceneSuccessOperationAndTransaction =
    map.operations.get("browser-scene-success")?.status === "succeeded" &&
    isMonotonic(successProgress) &&
    successProgress.at(-1) === 1 &&
    successTransactionStatuses.includes("preparing") &&
    successTransactionStatuses.includes("committing") &&
    successTransactionStatuses.includes("succeeded") &&
    map.sceneState.getTransactionState()?.status === "succeeded";

  const operationIds = [
    "browser-scene-prepare-failure",
    "browser-scene-commit-failure",
    "browser-scene-prepare-cancel",
    "browser-scene-commit-cancel",
    "browser-scene-success"
  ];
  checks.sceneUsesSingleParentOperations =
    map.operations.list().length === operationCountBefore + operationIds.length &&
    operationIds.every((id) => map.operations.get(id)?.kind === "scene.load");
  return checks;
}

async function ensureTransactionFixtureSections(map: KairosMap): Promise<void> {
  if (map.sceneState.bookmarks.list().length === 0) {
    map.sceneState.bookmarks.add({
      id: "smoke-home",
      name: "Smoke Home",
      view: map.sceneState.captureCamera()
    });
  }
  if (map.primitives.list().length === 0) {
    map.primitives.addPolyline({
      id: "smoke-primitive",
      positions: [
        Cartesian3.fromDegrees(114.166, 22.298, 100),
        Cartesian3.fromDegrees(114.174, 22.302, 100)
      ],
      color: "#35d07f",
      width: 3
    });
  }
  if (map.analysis.visibility.list().length === 0) {
    await map.analysis.visibility.compute(
      {
        start: Cartesian3.fromDegrees(114.166, 22.298, 120),
        end: Cartesian3.fromDegrees(114.174, 22.302, 120),
        sampleCount: 8
      },
      { operationId: "browser-scene-baseline-visibility" }
    );
  }
}

interface SceneRuntimeIdentity {
  entries: Map<string, unknown[]>;
}

function captureSceneRuntimeIdentity(map: KairosMap): SceneRuntimeIdentity {
  const entries = new Map<string, unknown[]>();
  for (const layer of map.layers.listState()) {
    entries.set(`layer:${layer.id}`, uniqueObjects(map.layers.getRuntimeObjects(layer.id)));
  }
  for (const result of map.draw.list()) {
    entries.set(`draw:${result.id}`, managedRuntimeObjects(result));
  }
  const analysisGroups = [
    ["measure", map.analysis.measure.list()],
    ["visibility", map.analysis.visibility.list()],
    ["profile", map.analysis.profile.list()],
    ["clipping", map.analysis.clipping.list()],
    ["terrain", map.analysis.terrain.list()]
  ] as const;
  for (const [source, results] of analysisGroups) {
    for (const result of results) {
      entries.set(`analysis:${source}:${result.id}`, managedRuntimeObjects(result));
    }
  }
  for (const primitive of map.primitives.list()) {
    entries.set(`primitive:${primitive.id}`, managedRuntimeObjects(primitive));
  }
  for (const overlay of map.overlays.list()) {
    entries.set(`overlay:${overlay.id}`, managedRuntimeObjects(overlay));
  }
  for (const effect of map.effects.list()) {
    entries.set(
      `effect:${effect.id}`,
      uniqueObjects(map.effects.getRuntimeObjects(effect.id))
    );
  }
  return { entries };
}

function managedRuntimeObjects(value: object): unknown[] {
  const runtime = value as {
    entity?: unknown;
    entities?: unknown[];
    collection?: unknown;
    primitive?: unknown;
    polyline?: unknown;
    primitives?: Array<{
      collection?: unknown;
      primitive?: unknown;
      polyline?: unknown;
    }>;
  };
  return uniqueObjects([
    runtime.entity,
    ...(runtime.entities ?? []),
    runtime.collection,
    runtime.primitive,
    runtime.polyline,
    ...(runtime.primitives ?? []).flatMap((item) => [
      item,
      item.collection,
      item.primitive,
      item.polyline
    ])
  ]);
}

function uniqueObjects(values: unknown[]): unknown[] {
  return [...new Set(values.filter((value) => value !== undefined && value !== null))];
}

function sameRuntimeIdentity(
  left: SceneRuntimeIdentity,
  right: SceneRuntimeIdentity
): boolean {
  if (left.entries.size !== right.entries.size) {
    return false;
  }
  for (const [key, rightObjects] of right.entries) {
    const leftObjects = left.entries.get(key);
    if (
      !leftObjects ||
      leftObjects.length !== rightObjects.length ||
      leftObjects.some((object, index) => object !== rightObjects[index])
    ) {
      return false;
    }
  }
  return true;
}

function runtimeIdentityReplaced(
  current: SceneRuntimeIdentity,
  previous: SceneRuntimeIdentity
): boolean {
  if (current.entries.size !== previous.entries.size || current.entries.size === 0) {
    return false;
  }
  for (const [key, previousObjects] of previous.entries) {
    const currentObjects = current.entries.get(key);
    if (!currentObjects || currentObjects.length === 0 || previousObjects.length === 0) {
      return false;
    }
    if (currentObjects.some((object) => previousObjects.includes(object))) {
      return false;
    }
  }
  return true;
}

function destroyableRuntimeObjects(
  identity: SceneRuntimeIdentity
): Array<{ isDestroyed(): boolean }> {
  return uniqueObjects([...identity.entries.values()].flat()).filter(
    (value): value is { isDestroyed(): boolean } =>
      typeof (value as { isDestroyed?: unknown }).isDestroyed === "function"
  );
}

function sameCameraView(
  actual: ReturnType<KairosMap["sceneState"]["captureCamera"]>,
  expected: NonNullable<SceneSnapshot["camera"]>
): boolean {
  return (
    Math.abs(actual.longitude - expected.longitude) < 1e-6 &&
    Math.abs(actual.latitude - expected.latitude) < 1e-6 &&
    Math.abs(actual.height - expected.height) < 0.1 &&
    Math.abs(actual.heading - expected.heading) < 1e-6 &&
    Math.abs(actual.pitch - expected.pitch) < 1e-6 &&
    Math.abs(actual.roll - expected.roll) < 1e-6
  );
}

function isMonotonic(values: number[]): boolean {
  return values.length > 0 && values.every((value, index) => index === 0 || value >= values[index - 1]);
}

function analysisSnapshotFromScene(snapshot: SceneSnapshot) {
  return snapshot.results
    ? {
        measure: snapshot.results.measure,
        visibility: snapshot.results.visibility,
        profile: snapshot.results.profile,
        clipping: snapshot.results.clipping,
        terrain: snapshot.results.terrain
      }
    : undefined;
}

function sameSerializable(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortSerializable(left)) === JSON.stringify(sortSerializable(right));
}

function containsSerializable(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "number" && typeof expected === "number") {
    return Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => containsSerializable(actual[index], item))
    );
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      return false;
    }
    return Object.entries(expected as Record<string, unknown>).every(
      ([key, value]) =>
        value === undefined ||
        containsSerializable((actual as Record<string, unknown>)[key], value)
    );
  }
  return Object.is(actual, expected);
}

function sortSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortSerializable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortSerializable(item)])
    );
  }
  return value;
}

interface SceneFingerprint {
  camera: ReturnType<KairosMap["sceneState"]["captureCamera"]>;
  layers: ReturnType<KairosMap["layers"]["toJSON"]>;
  bookmarks: ReturnType<KairosMap["sceneState"]["bookmarks"]["list"]>;
  draw: ReturnType<KairosMap["draw"]["toJSON"]>;
  analysis: ReturnType<KairosMap["analysis"]["toJSON"]>;
  primitives: ReturnType<KairosMap["primitives"]["toJSON"]>;
  overlays: ReturnType<KairosMap["overlays"]["toJSON"]>;
  effects: ReturnType<KairosMap["effects"]["toJSON"]>;
  viewerEntityIds: string[];
  scenePrimitiveCount: number;
  postProcessStageNames: string[];
  effectRuntimeObjectCount: number;
  animatedEffectCount: number;
}

function captureSceneFingerprint(map: KairosMap): SceneFingerprint {
  const stats = map.performance.getStats();
  const postProcessStageNames: string[] = [];
  for (let index = 0; index < map.viewer.scene.postProcessStages.length; index += 1) {
    postProcessStageNames.push(map.viewer.scene.postProcessStages.get(index).name);
  }
  return {
    camera: map.sceneState.captureCamera(),
    layers: map.layers.toJSON(),
    bookmarks: map.sceneState.bookmarks.list(),
    draw: map.draw.toJSON(),
    analysis: map.analysis.toJSON(),
    primitives: map.primitives.toJSON(),
    overlays: map.overlays.toJSON(),
    effects: map.effects.toJSON(),
    viewerEntityIds: map.viewer.entities.values.map((entity) => entity.id).sort(),
    scenePrimitiveCount: map.viewer.scene.primitives.length,
    postProcessStageNames,
    effectRuntimeObjectCount: stats.effectRuntimeObjectCount,
    animatedEffectCount: stats.animatedEffectCount
  };
}

function sameFingerprint(left: SceneFingerprint, right: SceneFingerprint): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface FixtureLayerBehavior {
  create?: () => void;
  preflight?: () => void | Promise<void>;
  prepare?: () => void | Promise<void>;
  attach?: () => void | Promise<void>;
  detach?: () => void | Promise<void>;
}

function registerFixtureLayer(
  type: string,
  behavior: FixtureLayerBehavior
): () => void {
  layerRegistry.register(type, (config) => createFixtureLayer(config, behavior));
  return () => layerRegistry.unregister(type);
}

function createFixtureLayer(
  config: BaseLayerConfig,
  behavior: FixtureLayerBehavior
): LayerAdapter {
  behavior.create?.();
  const id = config.id ?? `${config.type}-fixture`;
  const runtime = { id, type: config.type };
  let show = config.show ?? true;
  let map: KairosMap | undefined;
  const adapter: LayerAdapter = {
    id,
    type: config.type,
    get show() {
      return show;
    },
    set show(value: boolean) {
      show = value;
    },
    transaction: {
      preflight: () => behavior.preflight?.(),
      prepare: () => behavior.prepare?.(),
      attach: () => behavior.attach?.(),
      detach: () => behavior.detach?.()
    },
    async addTo(nextMap) {
      map = nextMap;
      await adapter.transaction!.prepare(nextMap);
      await adapter.transaction!.attach(nextMap);
    },
    remove() {
      if (map) {
        void adapter.transaction!.detach(map);
        map = undefined;
      }
    },
    destroy() {
      adapter.remove();
    },
    toConfig: () => ({ ...config, id, show }) as LayerConfig,
    getRuntimeObjects: () => [runtime]
  };
  return adapter;
}

function snapshotWithFixtureLayer(
  snapshot: SceneSnapshot,
  type: string,
  id: string
): SceneSnapshot {
  return {
    ...structuredClone(snapshot),
    layers: [{ id, type } as LayerConfig]
  };
}

function createBrowserGate() {
  let markStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const waitForRelease = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { markStarted, release, started, waitForRelease };
}

function markSmokeStep(step: string): void {
  document.documentElement.dataset.k3dSmokeStep = step;
}

async function waitForFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function restoreSnapshot(map: KairosMap, snapshot: SceneSnapshot): Promise<void> {
  await map.sceneState.load(snapshot, {
    clearLayers: true,
    flyToCamera: false,
    restoreEffects: true,
    clearEffects: true
  });
}

function createEffectConfigs(): EffectConfig[] {
  const center = { longitude: 114.17, latitude: 22.3 };
  return [
    {
      id: "flow-line-1",
      type: "flow-line",
      positions: [
        Cartesian3.fromDegrees(center.longitude - 0.018, center.latitude + 0.014, 120),
        Cartesian3.fromDegrees(center.longitude, center.latitude + 0.02, 220),
        Cartesian3.fromDegrees(center.longitude + 0.018, center.latitude + 0.014, 120)
      ],
      width: 5,
      material: { type: "flow", color: "#00d4ff", speed: 1.5, repeat: 4 },
      group: "geometry",
      metadata: { fixture: "m8-browser" }
    },
    {
      id: "flow-wall-1",
      type: "flow-wall",
      positions: [
        Cartesian3.fromDegrees(center.longitude - 0.021, center.latitude - 0.006),
        Cartesian3.fromDegrees(center.longitude - 0.01, center.latitude - 0.012),
        Cartesian3.fromDegrees(center.longitude + 0.001, center.latitude - 0.006)
      ],
      minimumHeights: [0, 0, 0],
      maximumHeights: [550, 750, 550],
      material: { type: "flow", color: "#9d7dff", speed: 1.1, repeat: 3 },
      group: "geometry"
    },
    {
      id: "pulse-circle-1",
      type: "pulse-circle",
      position: Cartesian3.fromDegrees(center.longitude - 0.011, center.latitude + 0.002),
      radius: 650,
      material: { type: "radial-wave", color: "#00d4ff", speed: 1.2, rings: 4 },
      group: "geometry"
    },
    {
      id: "radar-scan-1",
      type: "radar-scan",
      position: Cartesian3.fromDegrees(center.longitude + 0.008, center.latitude + 0.003),
      radius: 700,
      material: { type: "radar-scan", color: "#35d07f", speed: 0.8, sectorSize: 0.2 },
      group: "geometry"
    },
    {
      id: "water-surface-1",
      type: "water-surface",
      positions: [
        Cartesian3.fromDegrees(center.longitude + 0.006, center.latitude - 0.015, 30),
        Cartesian3.fromDegrees(center.longitude + 0.022, center.latitude - 0.015, 30),
        Cartesian3.fromDegrees(center.longitude + 0.022, center.latitude - 0.004, 30),
        Cartesian3.fromDegrees(center.longitude + 0.006, center.latitude - 0.004, 30)
      ],
      material: {
        type: "water",
        normalMap: waterNormalMap,
        baseWaterColor: "#167aa6bb",
        blendColor: "#0b3854aa",
        frequency: 900,
        animationSpeed: 0.02,
        amplitude: 6,
        specularIntensity: 0.7
      },
      group: "geometry"
    },
    {
      id: "particle-1",
      type: "particle",
      position: Cartesian3.fromDegrees(center.longitude, center.latitude + 0.006, 120),
      image: particleImage,
      emissionRate: 10,
      speed: 2,
      particleLife: 4,
      startScale: 1,
      endScale: 0.3,
      imageSize: [22, 22],
      startColor: "#00d4ffdd",
      endColor: "#35d07f00",
      group: "particle"
    },
    { id: "rain-1", type: "rain", intensity: 0.16, speed: 0.8, group: "weather" },
    { id: "snow-1", type: "snow", intensity: 0.1, speed: 0.65, group: "weather" },
    { id: "fog-1", type: "fog", intensity: 0.08, color: "#dce6ee", group: "weather" }
  ];
}

function captureCounts(map: KairosMap): SmokeCounts {
  const stats = map.performance.getStats();
  return {
    effects: stats.effectCount,
    runtimeObjects: stats.effectRuntimeObjectCount,
    animatedEffects: stats.animatedEffectCount,
    scenePrimitives: map.viewer.scene.primitives.length,
    postProcessStages: map.viewer.scene.postProcessStages.length
  };
}

function sameTypes(actual: EffectType[], expected: EffectType[]): boolean {
  return actual.slice().sort().join("|") === expected.slice().sort().join("|");
}

function setCamera(map: KairosMap): void {
  map.viewer.camera.setView({
    destination: Cartesian3.fromDegrees(114.17, 22.3, 7_200),
    orientation: {
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0
    }
  });
}

function seedM7Objects(map: KairosMap): void {
  const center = Cartesian3.fromDegrees(114.17, 22.3, 80);
  map.overlays.addPoint({
    id: "smoke-overlay",
    position: center,
    properties: { source: "browser-smoke" },
    group: "smoke"
  });
  map.draw.circle({
    id: "smoke-circle",
    center,
    radius: 250,
    properties: { source: "browser-smoke" }
  });
}

interface BrowserSmokeWindow extends Window {
  __KAIROS_BROWSER_SMOKE_ROOT__?: Root;
}

const browserSmokeWindow = window as BrowserSmokeWindow;
browserSmokeWindow.__KAIROS_BROWSER_SMOKE_ROOT__?.unmount();
const browserSmokeRoot = createRoot(document.getElementById("root")!);
browserSmokeWindow.__KAIROS_BROWSER_SMOKE_ROOT__ = browserSmokeRoot;

browserSmokeRoot.render(
  <KairosMapProvider
    createOptions={{
      viewerOptions: {
        baseLayer: false,
        terrainProvider: new EllipsoidTerrainProvider(),
        requestRenderMode: true,
        shouldAnimate: true,
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false
      },
      layers: [
        {
          id: "smoke-geojson",
          type: "geojson",
          name: "本地 GeoJSON",
          group: "测试数据",
          data: "/data/demo.geojson",
          order: 0,
          style: {
            markerColor: "#29c7d8",
            markerSize: 12
          }
        }
      ]
    }}
    modules={standardWidgets}
    snapshotStorage={snapshotStorage}
  >
    <KairosWidgetShell theme="dark">
      <KairosMapViewport />
      <KairosWidgetToolbar />
      <KairosWidgetHost />
    </KairosWidgetShell>
    <BrowserSmoke />
  </KairosMapProvider>
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (browserSmokeWindow.__KAIROS_BROWSER_SMOKE_ROOT__ === browserSmokeRoot) {
      browserSmokeRoot.unmount();
      delete browserSmokeWindow.__KAIROS_BROWSER_SMOKE_ROOT__;
    }
  });
}
