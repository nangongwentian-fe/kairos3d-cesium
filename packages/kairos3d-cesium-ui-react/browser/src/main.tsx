import type { KairosMap } from "@kairos3d/cesium/core";
import type { EffectConfig, EffectType } from "@kairos3d/cesium/effects";
import type { SceneSnapshot } from "@kairos3d/cesium/scene";
import { createMemoryWidgetSnapshotStorage } from "@kairos3d/cesium-widget";
import { Cartesian3, EllipsoidTerrainProvider } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
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
        data-k3d-effects-status={report.status}
        data-k3d-effects-pass={passed ? "true" : "false"}
        data-k3d-runtime-count={currentCounts?.runtimeObjects ?? 0}
        data-k3d-animated-count={currentCounts?.animatedEffects ?? 0}
        data-k3d-scene-primitive-count={currentCounts?.scenePrimitives ?? 0}
        data-k3d-stage-count={currentCounts?.postProcessStages ?? 0}
        aria-label="M8 Effects Core smoke report"
      >
        <header>
          <strong>M8 Effects Core</strong>
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
          <button type="button" onClick={() => void rerun()} disabled={state.status !== "ready"}>
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
  map.effects.clear();
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

createRoot(document.getElementById("root")!).render(
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
      <BrowserSmoke />
    </KairosWidgetShell>
  </KairosMapProvider>
);
