import { useEffect, useRef, useState } from "react";
import { Cartesian3, Color, Math as CesiumMath } from "cesium";
import { createMap, type KairosMap } from "@kairos3d/cesium/core";
import type { LayerConfig, LayerState } from "@kairos3d/cesium/layers";
import type {
  PerformanceStats,
  PrimitiveOptimizationCandidate
} from "@kairos3d/cesium/performance";
import type { CameraBookmark, CameraView, SceneSnapshot } from "@kairos3d/cesium/scene";
import type { PickResult } from "@kairos3d/cesium/picking";
import type { PrimitiveOverlay, ResultRenderMode } from "@kairos3d/cesium/primitives";
import {
  createMemorySnapshotStorage,
  type SnapshotStorageAdapter
} from "@kairos3d/cesium/persistence";
import type { ResultRecord } from "@kairos3d/cesium/results";
import type { ResultSymbolStyle, SDKStyleDefaults } from "@kairos3d/cesium/style";
import type { Tool } from "@kairos3d/cesium/tools";
import type { DrawEditStartOptions, DrawResult, DrawToolOptions } from "@kairos3d/cesium/draw";
import type {
  ClippingPolygonDrawOptions,
  ClippingResult,
  ContourDrawOptions,
  MeasureResult,
  MeasureToolOptions,
  ProfileDrawOptions,
  ProfileResult,
  TerrainResult,
  VisibilityPickOptions,
  VisibilityResult
} from "@kairos3d/cesium/analysis";
import {
  createPickPropertyRows,
  createProfileChartData,
  formatPickCoordinate,
  summarizeSceneSnapshot
} from "./ui-adapters";

type ExampleMode =
  | "layers"
  | "scene"
  | "picking"
  | "style"
  | "draw"
  | "measure"
  | "analysis"
  | "clipping"
  | "terrain"
  | "height"
  | "performance"
  | "primitives";
type ExampleTool = Tool<
  | DrawToolOptions
  | DrawEditStartOptions
  | MeasureToolOptions
  | VisibilityPickOptions
  | ProfileDrawOptions
  | ClippingPolygonDrawOptions
  | ContourDrawOptions
>;
type SDKResult =
  | DrawResult
  | MeasureResult
  | VisibilityResult
  | ProfileResult
  | ClippingResult
  | TerrainResult;

const osmLayer: LayerConfig = {
  id: "osm",
  name: "OpenStreetMap",
  type: "xyz",
  group: "base",
  order: 0,
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  maximumLevel: 19,
  metadata: { provider: "OSM" }
};

const cartoLayer: LayerConfig = {
  id: "carto-light",
  name: "Carto Light",
  type: "xyz",
  group: "base",
  order: 1,
  alpha: 0.75,
  url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  subdomains: ["a", "b", "c", "d"],
  maximumLevel: 20,
  metadata: { provider: "Carto" }
};

const tilesetDemoLayer: LayerConfig = {
  id: "tileset-demo",
  name: "3D Tiles Demo",
  type: "3dtiles",
  group: "business",
  order: 10,
  url: "https://raw.githubusercontent.com/CesiumGS/3d-tiles-samples/main/1.0/TilesetWithDiscreteLOD/tileset.json",
  maximumScreenSpaceError: 8,
  dynamicScreenSpaceError: true,
  skipLevelOfDetail: true,
  style: {
    color: "color('white', 0.92)"
  },
  metadata: { source: "CesiumGS 3d-tiles-samples" }
};

const geoJsonDemoLayer: LayerConfig = {
  id: "geojson-demo",
  name: "GeoJSON Demo",
  type: "geojson",
  group: "business",
  order: 11,
  clampToGround: true,
  data: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Kairos3D sample polygon",
          kind: "geojson"
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [114.145, 22.295, 0],
              [114.205, 22.295, 0],
              [114.205, 22.345, 0],
              [114.145, 22.345, 0],
              [114.145, 22.295, 0]
            ]
          ]
        }
      }
    ]
  },
  style: {
    stroke: "#35d07f",
    strokeWidth: 3,
    fill: { red: 0.1, green: 0.75, blue: 0.5, alpha: 0.25 }
  }
};

const gltfDemoLayer: LayerConfig = {
  id: "gltf-demo",
  name: "glTF Demo",
  type: "gltf",
  group: "business",
  order: 12,
  url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb",
  position: Cartesian3.fromDegrees(114.1694, 22.3193, 80),
  height: { mode: "relativeToGround", offset: 80 },
  scale: 120,
  minimumPixelSize: 48,
  maximumScale: 500,
  color: "#ffffff",
  colorBlendAmount: 0
};

const layerPresets = [osmLayer, cartoLayer];
const dataLayerPresets = [tilesetDemoLayer, geoJsonDemoLayer, gltfDemoLayer];

const cyanDefaults: SDKStyleDefaults = {
  draw: {
    polyline: { line: { color: "#00d4ff", width: 4 } },
    polygon: {
      line: { color: "#00d4ff", width: 2 },
      polygon: {
        fillColor: { red: 0, green: 0.8, blue: 1, alpha: 0.25 },
        outlineColor: "#00d4ff"
      }
    }
  },
  measure: {
    distance: {
      line: { color: "#00d4ff", width: 4 },
      label: { color: "#ffffff", outlineColor: "#000000" }
    },
    area: {
      polygon: {
        fillColor: { red: 0, green: 0.83, blue: 1, alpha: 0.27 },
        outlineColor: "#00d4ff"
      },
      label: { color: "#ffffff", outlineColor: "#000000" }
    },
    height: {
      line: { color: "#35d07f", width: 4 },
      label: { color: "#ffffff", outlineColor: "#000000" }
    }
  },
  visibility: {
    visibleLine: { color: "#35d07f", width: 4 },
    blockedLine: { color: "#ff3b30", width: 4 },
    point: { color: "#ffffff", pixelSize: 9 },
    blockedPoint: { color: "#ff3b30", pixelSize: 11 }
  },
  profile: {
    line: { color: "#00d4ff", width: 4 },
    point: { color: "#ffffff", pixelSize: 9 }
  },
  clipping: {
    line: { color: "#ffcc00", width: 3 }
  },
  selection: {
    entity: { point: { color: "#ffcc00", pixelSize: 14 } },
    tilesFeature: { color: "#ffcc00" }
  }
};

const warningPreset: ResultSymbolStyle = {
  line: { color: "#ff3b30", width: 5 },
  visibleLine: { color: "#35d07f", width: 5 },
  blockedLine: { color: "#ff3b30", width: 5 },
  point: { color: "#ffcc00", pixelSize: 11 },
  blockedPoint: { color: "#ff3b30", pixelSize: 12 },
  polygon: {
    fillColor: { red: 1, green: 0.23, blue: 0.19, alpha: 0.27 },
    outlineColor: "#ff3b30",
    outlineWidth: 2
  },
  label: { color: "#ffffff", outlineColor: "#000000" }
};

export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KairosMap | null>(null);
  const activeToolRef = useRef<ExampleTool | null>(null);
  const savedLayerConfigsRef = useRef<LayerConfig[]>([]);
  const savedSnapshotRef = useRef<SceneSnapshot | null>(null);
  const snapshotStorageRef = useRef<SnapshotStorageAdapter>(createMemorySnapshotStorage());
  const [mode, setMode] = useState<ExampleMode>("layers");
  const [status, setStatus] = useState("初始化 Viewer");
  const [layerStates, setLayerStates] = useState<LayerState[]>([]);
  const [savedLayerCount, setSavedLayerCount] = useState(0);
  const [savedCameraView, setSavedCameraView] = useState<CameraView | null>(null);
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>([]);
  const [hasSceneSnapshot, setHasSceneSnapshot] = useState(false);
  const [pickResult, setPickResult] = useState<PickResult | null>(null);
  const [pickingEnabled, setPickingEnabled] = useState(false);
  const [lastDrawId, setLastDrawId] = useState<string | null>(null);
  const [clippingResults, setClippingResults] = useState<ClippingResult[]>([]);
  const [terrainResults, setTerrainResults] = useState<TerrainResult[]>([]);
  const [managedResults, setManagedResults] = useState<ResultRecord[]>([]);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [resultRenderMode, setResultRenderMode] = useState<ResultRenderMode>("entity");
  const [primitiveCandidates, setPrimitiveCandidates] = useState<
    PrimitiveOptimizationCandidate[]
  >([]);
  const [primitiveOverlays, setPrimitiveOverlays] = useState<PrimitiveOverlay[]>([]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let disposed = false;

    void createMap({
      container: containerRef.current,
      viewerOptions: {
        animation: false,
        baseLayer: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false
      }
    }).then((map) => {
      if (disposed) {
        map.destroy();
        return;
      }

      mapRef.current = map;
      map.styles.registerPreset("analysis-warning", warningPreset);
      setStatus("Viewer 已就绪");

      const offComplete = map.tools.on("complete", (event) => {
        const result = event.data as SDKResult;
        if (isDrawResult(result)) {
          setLastDrawId(result.id);
        }
        setStatus(formatResultStatus(result));
      });
      const offEditChange = map.draw.on("edit-change", (event) => {
        setStatus(`${drawTypeLabel(event.data.result.type)}已编辑：${event.data.positions.length} 个点`);
      });
      const offPick = map.picking.on("pick", (event) => {
        const result = event.data.result;
        setPickResult(result ?? null);
        setStatus(result ? formatPickStatus(result) : "未拾取到对象");
      });
      const clippingOffs = [
        map.analysis.clipping.on("add", () => refreshClippingResults(map)),
        map.analysis.clipping.on("update", () => refreshClippingResults(map)),
        map.analysis.clipping.on("remove", () => refreshClippingResults(map)),
        map.analysis.clipping.on("clear", () => refreshClippingResults(map))
      ];
      const terrainOffs = [
        map.analysis.terrain.on("add", () => refreshTerrainResults(map)),
        map.analysis.terrain.on("remove", () => refreshTerrainResults(map)),
        map.analysis.terrain.on("clear", () => refreshTerrainResults(map))
      ];
      const resultOffs = [
        map.results.on("add", () => refreshManagedResults(map)),
        map.results.on("remove", () => refreshManagedResults(map)),
        map.results.on("clear", () => refreshManagedResults(map))
      ];
      const layerOffs = [
        map.layers.on("add", () => refreshLayerAndPerformanceStates(map)),
        map.layers.on("remove", () => refreshLayerAndPerformanceStates(map)),
        map.layers.on("clear", () => refreshLayerAndPerformanceStates(map)),
        map.layers.on("update", () => refreshLayerAndPerformanceStates(map)),
        map.layers.on("move", () => refreshLayerAndPerformanceStates(map)),
        map.layers.on("load", () => refreshLayerAndPerformanceStates(map))
      ];

      map.viewer.camera.setView({
        destination: Cartesian3.fromDegrees(114.1694, 22.3193, 1800000)
      });
      refreshPerformanceStats(map);
      refreshPrimitiveOverlays(map);

      map.once("destroy", () => {
        offComplete();
        offEditChange();
        offPick();
        clippingOffs.forEach((off) => off());
        terrainOffs.forEach((off) => off());
        resultOffs.forEach((off) => off());
        layerOffs.forEach((off) => off());
      });
    });

    return () => {
      disposed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  function refreshLayerStates(map = mapRef.current) {
    setLayerStates(map?.layers.listState() ?? []);
  }

  function refreshLayerAndPerformanceStates(map = mapRef.current) {
    refreshLayerStates(map);
    refreshPerformanceStats(map);
  }

  function refreshClippingResults(map = mapRef.current) {
    setClippingResults(map?.analysis.clipping.list() ?? []);
  }

  function refreshTerrainResults(map = mapRef.current) {
    setTerrainResults(map?.analysis.terrain.list() ?? []);
  }

  function refreshManagedResults(map = mapRef.current) {
    setManagedResults(map?.results.list() ?? []);
    refreshPerformanceStats(map);
  }

  function refreshPerformanceStats(map = mapRef.current) {
    if (!map) {
      setPerformanceStats(null);
      setPrimitiveCandidates([]);
      return;
    }

    setPerformanceStats(
      map.performance.getStats({
        budget: {
          maxEntities: 500,
          maxResults: 100,
          maxResultEntities: 300,
          maxLayerRuntimeObjects: 100
        }
      })
    );
    setPrimitiveCandidates(map.performance.recommendPrimitiveCandidates({ minEntityCount: 10 }));
  }

  function refreshPrimitiveOverlays(map = mapRef.current) {
    setPrimitiveOverlays(map?.primitives.list() ?? []);
  }

  async function loadLayerPresets() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    await map.layers.load(layerPresets, { clear: true });
    refreshLayerStates(map);
    setStatus("图层预设已加载");
  }

  async function loadDataLayerPresets() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    await map.layers.load([...layerPresets, ...dataLayerPresets], {
      clear: true,
      flyTo: false
    });
    refreshLayerStates(map);
    setStatus("高级图层预设已加载，可用于拾取和裁剪验证");
  }

  function clearLayers() {
    mapRef.current?.layers.clear();
    refreshLayerStates();
    setStatus("图层已清理");
  }

  function saveLayerConfig() {
    const configs = mapRef.current?.layers.toJSON() ?? [];
    savedLayerConfigsRef.current = configs;
    setSavedLayerCount(configs.length);
    setStatus(`已保存 ${configs.length} 个图层配置`);
  }

  async function restoreLayerConfig() {
    const map = mapRef.current;
    if (!map || savedLayerConfigsRef.current.length === 0) {
      setStatus("请先保存图层配置");
      return;
    }

    await map.layers.load(savedLayerConfigsRef.current, { clear: true, flyTo: false });
    refreshLayerStates(map);
    setStatus("图层配置已恢复");
  }

  function toggleLayerState(id: string) {
    mapRef.current?.layers.toggle(id);
    refreshLayerStates();
    setStatus(`图层 ${id} 显隐已切换`);
  }

  function fadeLayer(id: string) {
    const state = mapRef.current?.layers.get(id)?.getState?.();
    const opacity = state?.opacity === undefined || state.opacity < 1 ? 1 : 0.45;
    mapRef.current?.layers.setOpacity(id, opacity);
    refreshLayerStates();
    setStatus(`图层 ${id} 透明度已设为 ${opacity}`);
  }

  function moveLayer(id: string, delta: number) {
    const state = mapRef.current?.layers.listState().find((item) => item.id === id);
    if (!state) {
      return;
    }

    mapRef.current?.layers.move(id, Math.max(0, state.order + delta));
    refreshLayerStates();
    setStatus(`图层 ${id} 顺序已更新`);
  }

  async function flyToLayer(id: string) {
    const success = await mapRef.current?.layers.flyTo(id);
    setStatus(success ? `已定位到图层 ${id}` : `图层 ${id} 暂不支持定位`);
  }

  function captureCameraView() {
    const view = mapRef.current?.sceneState.captureCamera();
    if (!view) {
      return;
    }

    setSavedCameraView(view);
    setStatus(`已保存视角：${formatCameraView(view)}`);
  }

  async function flyToSavedCamera() {
    const map = mapRef.current;
    if (!map || !savedCameraView) {
      setStatus("请先保存一个视角");
      return;
    }

    const success = await map.sceneState.flyToCamera(savedCameraView, { duration: 1 });
    setStatus(success ? "已飞回保存视角" : "视角飞行已取消");
  }

  function addCameraBookmark() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const view = savedCameraView ?? map.sceneState.captureCamera();
    const bookmark = map.sceneState.bookmarks.add({
      id: `bookmark-${Date.now()}`,
      name: `视角 ${map.sceneState.bookmarks.list().length + 1}`,
      view
    });
    setSavedCameraView(view);
    refreshBookmarks(map);
    setStatus(`已添加书签：${bookmark.name ?? bookmark.id}`);
  }

  async function flyToBookmark(id: string) {
    const map = mapRef.current;
    const bookmark = map?.sceneState.bookmarks.get(id);
    if (!map || !bookmark) {
      return;
    }

    const success = await map.sceneState.flyToCamera(bookmark.view, { duration: 1 });
    setStatus(success ? `已定位到书签 ${bookmark.name ?? bookmark.id}` : "书签飞行已取消");
  }

  function removeBookmark(id: string) {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.sceneState.bookmarks.remove(id);
    refreshBookmarks(map);
    setStatus(`书签 ${id} 已删除`);
  }

  function clearCameraBookmarks() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.sceneState.bookmarks.clear();
    refreshBookmarks(map);
    setStatus("视角书签已清理");
  }

  function saveSceneSnapshot() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    savedSnapshotRef.current = map.sceneState.toJSON({
      includeResults: true,
      includePrimitives: true
    });
    setHasSceneSnapshot(true);
    void snapshotStorageRef.current.save("latest", savedSnapshotRef.current, {
      name: "Latest scene"
    });
    setStatus(`已保存场景快照：${summarizeSceneSnapshot(savedSnapshotRef.current)}`);
  }

  async function restoreSceneSnapshot() {
    const map = mapRef.current;
    const snapshot = savedSnapshotRef.current ?? (await snapshotStorageRef.current.load("latest"));
    if (!map || !snapshot) {
      setStatus("请先保存场景快照");
      return;
    }

    savedSnapshotRef.current = snapshot;
    await map.sceneState.load(snapshot, {
      clearLayers: true,
      flyToCamera: true,
      restoreResults: true,
      clearResults: true,
      restorePrimitives: true,
      clearPrimitives: true
    });
    refreshLayerStates(map);
    refreshBookmarks(map);
    refreshClippingResults(map);
    refreshTerrainResults(map);
    refreshManagedResults(map);
    setLastDrawId(map.draw.list().at(-1)?.id ?? null);
    setSavedCameraView(snapshot.camera ?? null);
    setStatus("场景快照和运行时结果已恢复");
  }

  function refreshBookmarks(map = mapRef.current) {
    setBookmarks(map?.sceneState.bookmarks.list() ?? []);
  }

  function clearRuntimeResults() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.results.clear();
    setLastDrawId(null);
    refreshClippingResults(map);
    refreshTerrainResults(map);
    refreshManagedResults(map);
    setStatus("运行时结果已清理");
  }

  function enablePicking() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.tools.cancel();
    map.picking.enableClick({ select: true, includeImagery: false });
    setPickingEnabled(true);
    setStatus("拾取已启用：点击地图对象查看属性");
  }

  function disablePicking() {
    mapRef.current?.picking.disableClick();
    setPickingEnabled(false);
    setStatus("拾取已停用");
  }

  function clearPicking() {
    mapRef.current?.selection.clear();
    setPickResult(null);
    setStatus("选择已清理");
  }

  function applyCyanDefaults() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.styles.setDefaults(cyanDefaults);
    map.styles.registerPreset("analysis-warning", warningPreset);
    map.selection.setStyle(cyanDefaults.selection ?? {});
    setStatus("青色默认样式已应用，后续绘制和分析会使用新样式");
  }

  function applyWarningPresetToResults() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const preset = map.styles.getPreset("analysis-warning") ?? warningPreset;
    for (const result of map.draw.list()) {
      map.draw.setStyle(result.id, preset);
    }
    for (const result of map.analysis.measure.list()) {
      map.analysis.measure.setStyle(result.id, preset);
    }
    for (const result of map.analysis.visibility.list()) {
      map.analysis.visibility.setStyle(result.id, preset);
    }
    for (const result of map.analysis.profile.list()) {
      map.analysis.profile.setStyle(result.id, preset);
    }
    for (const result of map.analysis.clipping.list()) {
      map.analysis.clipping.setStyle(result.id, preset);
    }
    refreshClippingResults(map);
    setStatus(`警示样式已应用到 ${countRuntimeResults(map)} 个运行时结果`);
  }

  async function startPolylineDraw() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.draw.polyline({ renderMode: resultRenderMode });
    setStatus("绘制线：左键加点，右键或双击完成");
  }

  async function startPolygonDraw() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.draw.polygon({ renderMode: resultRenderMode });
    setStatus("绘制面：左键加点，右键或双击完成");
  }

  function clearDrawResults() {
    mapRef.current?.draw.clear();
    setLastDrawId(null);
    setStatus("绘制结果已清理");
  }

  async function editLatestDraw() {
    const map = mapRef.current;
    if (!map || !lastDrawId) {
      setStatus("请先完成一个绘制结果");
      return;
    }

    activeToolRef.current = await map.draw.edit(lastDrawId);
    setStatus("编辑绘制：拖拽顶点，中点插入，Delete 删除点");
  }

  function stopDrawEdit() {
    mapRef.current?.draw.stopEdit();
    activeToolRef.current = null;
    setStatus("绘制编辑已保存");
  }

  function cancelDrawEdit() {
    mapRef.current?.draw.cancelEdit();
    activeToolRef.current = null;
    setStatus("绘制编辑已取消");
  }

  async function startDistanceMeasure() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.measure.distance({
      renderMode: resultRenderMode
    });
    setStatus("距离量测：左键加点，右键或双击完成");
  }

  async function startAreaMeasure() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.measure.area({
      renderMode: resultRenderMode
    });
    setStatus("面积量测：左键加点，右键或双击完成");
  }

  async function startHeightMeasure() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.measure.height();
    setStatus("高度量测：左键选择两个点");
  }

  function clearMeasureResults() {
    mapRef.current?.analysis.measure.clear();
    setStatus("量测结果已清理");
  }

  async function startAbsolutePolylineDraw() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.draw.polyline({
      height: { mode: "absolute" }
    });
    setStatus("Height demo: draw an absolute polyline");
  }

  async function startGroundPolylineDraw() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.draw.polyline({
      height: { mode: "clampToGround" }
    });
    setStatus("Height demo: draw a clamp-to-ground polyline");
  }

  async function startSpaceDistanceMeasure() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.measure.distance({
      mode: "space",
      height: { mode: "absolute" }
    });
    setStatus("Height demo: space distance");
  }

  async function startSurfaceDistanceMeasure() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.measure.distance({
      mode: "surface",
      height: { mode: "clampToGround", sampleTerrain: true }
    });
    setStatus("Height demo: surface distance with terrain sampling");
  }

  async function startGroundProfileDraw() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.profile.draw({
      sampleCount: 128,
      height: { mode: "clampToGround", sampleTerrain: true }
    });
    setStatus("Height demo: draw a clamp-to-ground profile");
  }

  async function sampleLatestDrawHeight() {
    const map = mapRef.current;
    const result = lastDrawId ? map?.draw.get(lastDrawId) : undefined;
    if (!map || !result) {
      setStatus("Height demo: finish a draw result first");
      return;
    }

    const samples = await map.height.sampleTerrain(result.positions);
    const sampledCount = samples.filter((sample) => sample.sampled).length;
    const heights = samples.map((sample) => sample.height.toFixed(2)).join(", ");
    setStatus(`Height samples: ${sampledCount}/${samples.length} sampled, ${heights} m`);
  }

  async function startVisibilityPick() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.visibility.pick({ sampleCount: 64 });
    setStatus("通视分析：左键选择起点和终点");
  }

  async function startProfileDraw() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.profile.draw({ sampleCount: 128 });
    setStatus("剖面分析：左键加点，右键或双击生成剖面数据");
  }

  function clearAnalysisResults() {
    mapRef.current?.analysis.visibility.clear();
    mapRef.current?.analysis.profile.clear();
    setStatus("分析结果已清理");
  }

  function addGlobePlaneClipping() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const result = map.analysis.clipping.addPlane({
      target: { type: "globe" },
      normal: Cartesian3.UNIT_Z,
      distance: 0,
      edgeColor: Color.YELLOW,
      edgeWidth: 2
    });
    refreshClippingResults(map);
    setStatus(`Clipping plane applied: ${result.id}`);
  }

  async function drawGlobePolygonClipping() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.clipping.drawPolygon({
      target: { type: "globe" },
      inverse: false
    });
    setStatus("Draw clipping polygon: left click points, right click or double click to finish");
  }

  function toggleClippingResult(id: string) {
    const map = mapRef.current;
    const result = map?.analysis.clipping.get(id);
    if (!map || !result) {
      return;
    }

    const next = map.analysis.clipping.setEnabled(id, !result.enabled);
    refreshClippingResults(map);
    setStatus(`Clipping ${next.enabled ? "enabled" : "disabled"}: ${id}`);
  }

  function clearClippingResults() {
    mapRef.current?.analysis.clipping.clear();
    refreshClippingResults();
    setStatus("Clipping results cleared");
  }

  async function computeSlopeAspectDemo() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const result = await map.analysis.terrain.slopeAspect({
      area: createTerrainDemoArea(),
      sampleStep: 500,
      maxSamples: 100
    });
    refreshTerrainResults(map);
    setStatus(`Slope/aspect ready: avg ${result.averageSlope.toFixed(2)} deg`);
  }

  async function computeContourDemo() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const result = await map.analysis.terrain.contour({
      area: createTerrainDemoArea(),
      interval: 20,
      sampleStep: 500,
      maxSamples: 100
    });
    refreshTerrainResults(map);
    setStatus(`Contour ready: ${result.lines.length} line segments`);
  }

  async function computeVolumeDemo() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const result = await map.analysis.terrain.volume({
      area: createTerrainDemoArea(),
      baseHeight: 12,
      sampleStep: 500,
      maxSamples: 100
    });
    refreshTerrainResults(map);
    setStatus(
      `Volume ready: cut ${formatCubicMeters(result.cutVolume)}, fill ${formatCubicMeters(result.fillVolume)}`
    );
  }

  async function computeFloodDemo() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const result = await map.analysis.terrain.flood({
      area: createTerrainDemoArea(),
      waterHeight: 12,
      sampleStep: 500,
      maxSamples: 100
    });
    refreshTerrainResults(map);
    setStatus(
      `Flood ready: ${formatSquareMeters(result.floodedArea)}, ${formatCubicMeters(result.waterVolume)}`
    );
  }

  async function computeExcavationDemo() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const result = await map.analysis.terrain.excavation({
      area: createTerrainDemoArea(),
      depth: 8,
      sampleStep: 500,
      maxSamples: 100
    });
    refreshTerrainResults(map);
    setStatus(`Excavation ready: ${formatCubicMeters(result.cutVolume)}`);
  }

  function addPrimitivePolylineDemo() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const overlay = map.primitives.addPolyline({
      positions: [
        Cartesian3.fromDegrees(114.12, 22.28, 1500),
        Cartesian3.fromDegrees(114.18, 22.33, 2500),
        Cartesian3.fromDegrees(114.24, 22.3, 1800)
      ],
      color: "#ffcc00",
      width: 4,
      metadata: { demo: "primitive-polyline" }
    });
    refreshPrimitiveOverlays(map);
    refreshPerformanceStats(map);
    setStatus(`Primitive polyline ready: ${overlay.id}`);
  }

  function clearPrimitiveOverlays() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.primitives.clear();
    refreshPrimitiveOverlays(map);
    refreshPerformanceStats(map);
    setStatus("Primitive overlays cleared");
  }

  async function drawTerrainContour() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    activeToolRef.current = await map.analysis.terrain.drawContour({
      interval: 20,
      sampleStep: 300,
      maxSamples: 900
    });
    setStatus("Draw terrain contour area: left click points, right click or double click to finish");
  }

  function clearTerrainResults() {
    mapRef.current?.analysis.terrain.clear();
    refreshTerrainResults();
    setStatus("Terrain analysis results cleared");
  }

  function stopTool() {
    mapRef.current?.tools.cancel();
    mapRef.current?.picking.disableClick();
    activeToolRef.current = null;
    setPickingEnabled(false);
    setStatus("当前工具已取消");
  }

  function getLayerRuntimeCount(id: string): number {
    return mapRef.current?.layers.getRuntimeObjects(id).length ?? 0;
  }

  return (
    <main className="example-shell">
      <aside className="example-sidebar" aria-label="SDK examples">
        <div>
          <p className="eyebrow">Kairos3DCesium</p>
          <h1>SDK Examples</h1>
        </div>
        <nav className="example-tabs" aria-label="Example modes">
          <button className={mode === "layers" ? "active" : ""} onClick={() => setMode("layers")}>
            图层
          </button>
          <button className={mode === "scene" ? "active" : ""} onClick={() => setMode("scene")}>
            场景
          </button>
          <button className={mode === "picking" ? "active" : ""} onClick={() => setMode("picking")}>
            拾取
          </button>
          <button className={mode === "style" ? "active" : ""} onClick={() => setMode("style")}>
            样式
          </button>
          <button className={mode === "draw" ? "active" : ""} onClick={() => setMode("draw")}>
            绘制
          </button>
          <button className={mode === "measure" ? "active" : ""} onClick={() => setMode("measure")}>
            量测
          </button>
          <button className={mode === "analysis" ? "active" : ""} onClick={() => setMode("analysis")}>
            分析
          </button>
          <button className={mode === "clipping" ? "active" : ""} onClick={() => setMode("clipping")}>
            Clipping
          </button>
          <button className={mode === "terrain" ? "active" : ""} onClick={() => setMode("terrain")}>
            Terrain
          </button>
          <button className={mode === "height" ? "active" : ""} onClick={() => setMode("height")}>
            Height
          </button>
          <button
            className={mode === "performance" ? "active" : ""}
            onClick={() => setMode("performance")}
          >
            Performance
          </button>
          <button
            className={mode === "primitives" ? "active" : ""}
            onClick={() => setMode("primitives")}
          >
            Primitives
          </button>
        </nav>
        <div className="example-actions">
          {mode === "layers" && (
            <>
              <button onClick={loadLayerPresets}>加载预设</button>
              <button className="ghost" onClick={() => void loadDataLayerPresets()}>
                加载高级图层
              </button>
              <button className="ghost" onClick={saveLayerConfig}>
                保存配置
              </button>
              <button className="ghost" onClick={restoreLayerConfig}>
                恢复配置{savedLayerCount > 0 ? `(${savedLayerCount})` : ""}
              </button>
              <button className="ghost" onClick={clearLayers}>
                清理图层
              </button>
              <div className="layer-list" aria-label="Layer states">
                {layerStates.length === 0 ? (
                  <p className="empty-state">暂无图层</p>
                ) : (
                  layerStates.map((layer) => (
                    <div className="layer-row" key={layer.id}>
                      <div className="layer-meta">
                        <strong>{layer.name ?? layer.id}</strong>
                        <span>
                          {layer.type} · {layer.group ?? "default"} · order {layer.order}
                        </span>
                        <span>runtime objects: {getLayerRuntimeCount(layer.id)}</span>
                      </div>
                      <div className="layer-controls">
                        <button className="ghost" onClick={() => toggleLayerState(layer.id)}>
                          {layer.show ? "隐藏" : "显示"}
                        </button>
                        <button className="ghost" onClick={() => fadeLayer(layer.id)}>
                          透明度
                        </button>
                        <button className="ghost" onClick={() => moveLayer(layer.id, -1)}>
                          上移
                        </button>
                        <button className="ghost" onClick={() => moveLayer(layer.id, 1)}>
                          下移
                        </button>
                        <button className="ghost" onClick={() => void flyToLayer(layer.id)}>
                          定位
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {mode === "scene" && (
            <>
              <button onClick={captureCameraView}>保存视角</button>
              <button className="ghost" onClick={() => void flyToSavedCamera()}>
                飞回视角
              </button>
              <button className="ghost" onClick={addCameraBookmark}>
                添加书签
              </button>
              <button className="ghost" onClick={saveSceneSnapshot}>
                保存快照
              </button>
              <button className="ghost" onClick={() => void restoreSceneSnapshot()}>
                恢复快照{hasSceneSnapshot ? "(1)" : ""}
              </button>
              <button className="ghost" onClick={clearRuntimeResults}>
                清理结果
              </button>
              <button className="ghost" onClick={clearCameraBookmarks}>
                清理书签
              </button>
              <div className="layer-list" aria-label="Camera bookmarks">
                {bookmarks.length === 0 ? (
                  <p className="empty-state">暂无视角书签</p>
                ) : (
                  bookmarks.map((bookmark) => (
                    <div className="layer-row" key={bookmark.id}>
                      <div className="layer-meta">
                        <strong>{bookmark.name ?? bookmark.id}</strong>
                        <span>{formatCameraView(bookmark.view)}</span>
                      </div>
                      <div className="layer-controls">
                        <button className="ghost" onClick={() => void flyToBookmark(bookmark.id)}>
                          定位
                        </button>
                        <button className="ghost" onClick={() => removeBookmark(bookmark.id)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="layer-list" aria-label="Managed results">
                {managedResults.length === 0 ? (
                  <p className="empty-state">No managed results</p>
                ) : (
                  managedResults.map((record) => (
                    <div className="layer-row" key={`${record.source}:${record.id}`}>
                      <div className="layer-meta">
                        <strong>{record.id}</strong>
                        <span>{formatManagedResult(record)}</span>
                      </div>
                      <div className="layer-controls">
                        <button
                          className="ghost"
                          onClick={() => {
                            mapRef.current?.results.remove(record.id, record.source);
                            refreshManagedResults();
                            refreshClippingResults();
                            refreshTerrainResults();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {mode === "picking" && (
            <>
              <button onClick={enablePicking}>
                {pickingEnabled ? "拾取已启用" : "启用拾取"}
              </button>
              <button className="ghost" onClick={disablePicking}>
                停用拾取
              </button>
              <button className="ghost" onClick={clearPicking}>
                清理选择
              </button>
              <div className="layer-list" aria-label="Picked result">
                {!pickResult ? (
                  <p className="empty-state">暂无拾取结果</p>
                ) : (
                  <div className="layer-row">
                    <div className="layer-meta">
                      <strong>{pickResult.name ?? pickResult.id}</strong>
                      <span>
                        {pickTypeLabel(pickResult.type)} · {pickResult.layerId ?? "unmanaged"}
                      </span>
                      <span>{formatPickCoordinate(pickResult)}</span>
                    </div>
                    <div className="property-list">
                      {createPickPropertyRows(pickResult).map(({ key, value }) => (
                        <div className="property-row" key={key}>
                          <span>{key}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {mode === "style" && (
            <>
              <button onClick={applyCyanDefaults}>应用默认样式</button>
              <button className="ghost" onClick={applyWarningPresetToResults}>
                预设应用结果
              </button>
              <button className="ghost" onClick={saveSceneSnapshot}>
                保存含样式快照
              </button>
              <button className="ghost" onClick={clearRuntimeResults}>
                清理结果
              </button>
              <button className="ghost" onClick={() => void restoreSceneSnapshot()}>
                恢复快照{hasSceneSnapshot ? "(1)" : ""}
              </button>
            </>
          )}
          {mode === "draw" && (
            <>
              <button
                className={resultRenderMode === "entity" ? "active" : "ghost"}
                onClick={() => setResultRenderMode("entity")}
              >
                Entity
              </button>
              <button
                className={resultRenderMode === "primitive" ? "active" : "ghost"}
                onClick={() => setResultRenderMode("primitive")}
              >
                Primitive
              </button>
              <button onClick={startPolylineDraw}>绘制线</button>
              <button onClick={startPolygonDraw}>绘制面</button>
              <button onClick={editLatestDraw}>编辑最新绘制</button>
              <button className="ghost" onClick={stopDrawEdit}>
                保存编辑
              </button>
              <button className="ghost" onClick={cancelDrawEdit}>
                取消编辑
              </button>
              <button className="ghost" onClick={clearDrawResults}>
                清理绘制
              </button>
            </>
          )}
          {mode === "measure" && (
            <>
              <button
                className={resultRenderMode === "entity" ? "active" : "ghost"}
                onClick={() => setResultRenderMode("entity")}
              >
                Entity
              </button>
              <button
                className={resultRenderMode === "primitive" ? "active" : "ghost"}
                onClick={() => setResultRenderMode("primitive")}
              >
                Primitive
              </button>
              <button onClick={startDistanceMeasure}>距离量测</button>
              <button onClick={startAreaMeasure}>面积量测</button>
              <button onClick={startHeightMeasure}>高度量测</button>
              <button className="ghost" onClick={clearMeasureResults}>
                清理量测
              </button>
            </>
          )}
          {mode === "height" && (
            <>
              <button onClick={startAbsolutePolylineDraw}>Absolute line</button>
              <button onClick={startGroundPolylineDraw}>Ground line</button>
              <button onClick={startSpaceDistanceMeasure}>Space distance</button>
              <button onClick={startSurfaceDistanceMeasure}>Surface distance</button>
              <button onClick={startGroundProfileDraw}>Ground profile</button>
              <button className="ghost" onClick={() => void sampleLatestDrawHeight()}>
                Sample latest draw
              </button>
            </>
          )}
          {mode === "performance" && (
            <>
              <button onClick={() => refreshPerformanceStats()}>Refresh stats</button>
              <button className="ghost" onClick={clearRuntimeResults}>
                Clear results
              </button>
              <div className="layer-list" aria-label="Performance stats">
                {!performanceStats ? (
                  <p className="empty-state">No performance stats</p>
                ) : (
                  <div className="layer-row">
                    <div className="layer-meta">
                      <strong>Runtime</strong>
                      <span>
                        entities {performanceStats.entityCount} / result entities{" "}
                        {performanceStats.resultEntityCount} / unmanaged{" "}
                        {performanceStats.unmanagedEntityCount}
                      </span>
                      <span>result primitives {performanceStats.resultPrimitiveCount}</span>
                      <span>
                        results {performanceStats.resultCount} / layers{" "}
                        {performanceStats.layerCount} / runtime objects{" "}
                        {performanceStats.layerRuntimeObjectCount}
                      </span>
                      <span>primitive overlays {performanceStats.primitiveOverlayCount}</span>
                    </div>
                  </div>
                )}
                {performanceStats?.warnings.map((warning) => (
                  <div className="layer-row" key={warning.code}>
                    <div className="layer-meta">
                      <strong>{warning.code}</strong>
                      <span>
                        {warning.current} / {warning.limit}
                      </span>
                      <span>{warning.message}</span>
                    </div>
                  </div>
                ))}
                {primitiveCandidates.map((candidate) => (
                  <div className="layer-row" key={`${candidate.source}:${candidate.id}`}>
                    <div className="layer-meta">
                      <strong>{candidate.id}</strong>
                      <span>
                        {candidate.source} / {candidate.type} / {candidate.priority}
                      </span>
                      <span>{candidate.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {mode === "primitives" && (
            <>
              <button onClick={addPrimitivePolylineDemo}>Add primitive line</button>
              <button className="ghost" onClick={clearPrimitiveOverlays}>
                Clear primitives
              </button>
              <div className="layer-list" aria-label="Primitive overlays">
                {primitiveOverlays.length === 0 ? (
                  <p className="empty-state">No primitive overlays</p>
                ) : (
                  primitiveOverlays.map((overlay) => (
                    <div className="layer-row" key={overlay.id}>
                      <div className="layer-meta">
                        <strong>{overlay.id}</strong>
                        <span>
                          {overlay.type} / {overlay.positions.length} positions / width{" "}
                          {overlay.width}
                        </span>
                      </div>
                      <div className="layer-controls">
                        <button
                          className="ghost"
                          onClick={() => {
                            mapRef.current?.primitives.remove(overlay.id);
                            refreshPrimitiveOverlays();
                            refreshPerformanceStats();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {mode === "analysis" && (
            <>
              <button onClick={startVisibilityPick}>通视选点</button>
              <button onClick={startProfileDraw}>绘制剖面</button>
              <button className="ghost" onClick={clearAnalysisResults}>
                清理分析
              </button>
            </>
          )}
          {mode === "clipping" && (
            <>
              <button onClick={addGlobePlaneClipping}>Globe plane</button>
              <button onClick={drawGlobePolygonClipping}>Draw globe polygon</button>
              <button className="ghost" onClick={clearClippingResults}>
                Clear clipping
              </button>
              <div className="layer-list" aria-label="Clipping results">
                {clippingResults.length === 0 ? (
                  <p className="empty-state">No clipping results</p>
                ) : (
                  clippingResults.map((result) => (
                    <div className="layer-row" key={result.id}>
                      <div className="layer-meta">
                        <strong>{result.id}</strong>
                        <span>
                          {result.type} / {result.target.type} /{" "}
                          {result.enabled ? "enabled" : "disabled"}
                        </span>
                      </div>
                      <div className="layer-controls">
                        <button className="ghost" onClick={() => toggleClippingResult(result.id)}>
                          {result.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          className="ghost"
                          onClick={() => {
                            mapRef.current?.analysis.clipping.remove(result.id);
                            refreshClippingResults();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {mode === "terrain" && (
            <>
              <button onClick={() => void computeSlopeAspectDemo()}>Slope/aspect</button>
              <button onClick={() => void computeContourDemo()}>Contour area</button>
              <button onClick={() => void computeVolumeDemo()}>Volume</button>
              <button onClick={() => void computeFloodDemo()}>Flood</button>
              <button onClick={() => void computeExcavationDemo()}>Excavation</button>
              <button onClick={() => void drawTerrainContour()}>Draw contour</button>
              <button className="ghost" onClick={clearTerrainResults}>
                Clear terrain
              </button>
              <div className="layer-list" aria-label="Terrain results">
                {terrainResults.length === 0 ? (
                  <p className="empty-state">No terrain analysis results</p>
                ) : (
                  terrainResults.map((result) => (
                    <div className="layer-row" key={result.id}>
                      <div className="layer-meta">
                        <strong>{result.id}</strong>
                        <span>{formatTerrainResult(result)}</span>
                      </div>
                      <div className="layer-controls">
                        <button
                          className="ghost"
                          onClick={() => {
                            mapRef.current?.analysis.terrain.remove(result.id);
                            refreshTerrainResults();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          <button className="ghost" onClick={stopTool}>
            取消工具
          </button>
        </div>
        <dl>
          <div>
            <dt>Package</dt>
            <dd>@kairos3d/cesium</dd>
          </div>
          <div>
            <dt>Cesium</dt>
            <dd>1.143.0</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{status}</dd>
          </div>
        </dl>
      </aside>
      <section className="viewer-stage" aria-label="Cesium viewer">
        <div ref={containerRef} className="viewer-container" />
      </section>
    </main>
  );
}

function formatResultStatus(result: SDKResult): string {
  if (isClippingResult(result)) {
    return `${result.type} clipping applied: ${result.id}`;
  }

  if (isTerrainResult(result)) {
    return `Terrain ${formatTerrainResult(result)}`;
  }

  if (result.type === "visibility") {
    return result.visible
      ? `通视完成：可见，距离 ${formatMeters(result.distance)}`
      : `通视完成：被遮挡，距离 ${formatMeters(result.distance)}`;
  }

  if (result.type === "profile") {
    return `剖面完成：${createProfileChartData(result).length} 个采样点，总长 ${formatMeters(result.totalDistance)}，高程 ${result.minHeight.toFixed(2)}-${result.maxHeight.toFixed(2)} m`;
  }

  if (isMeasureResult(result)) {
    return `${measureTypeLabel(result.type)}完成：${result.label ?? `${result.value} ${result.unit}`}`;
  }

  return `${drawTypeLabel(result.type)}完成：${result.positions.length} 个点`;
}

function formatManagedResult(record: ResultRecord): string {
  return `${record.source} · ${record.type} · ${record.createdAt.toLocaleTimeString()}`;
}

function countRuntimeResults(map: KairosMap): number {
  return map.results.count();
}

function isDrawResult(result: SDKResult): result is DrawResult {
  return (
    "entity" in result &&
    (result.type === "point" || result.type === "polyline" || result.type === "polygon")
  );
}

function isMeasureResult(result: SDKResult): result is MeasureResult {
  return result.type === "distance" || result.type === "area" || result.type === "height";
}

function isClippingResult(result: SDKResult): result is ClippingResult {
  return "collection" in result;
}

function isTerrainResult(result: SDKResult): result is TerrainResult {
  return (
    result.type === "slope-aspect" ||
    result.type === "contour" ||
    result.type === "volume" ||
    result.type === "flood" ||
    result.type === "excavation"
  );
}

function formatTerrainResult(result: TerrainResult): string {
  if (result.type === "volume") {
    return `volume · cut ${formatCubicMeters(result.cutVolume)} · fill ${formatCubicMeters(result.fillVolume)} · net ${formatCubicMeters(result.netVolume)}`;
  }

  if (result.type === "flood") {
    return `flood · area ${formatSquareMeters(result.floodedArea)} · water ${formatCubicMeters(result.waterVolume)}`;
  }

  if (result.type === "excavation") {
    return `excavation · bottom ${result.bottomHeight.toFixed(1)} m · cut ${formatCubicMeters(result.cutVolume)}`;
  }

  if (result.type === "slope-aspect") {
    return `slope/aspect · avg ${result.averageSlope.toFixed(2)} deg · ${result.grid.samples.length} samples`;
  }

  return `contour · ${result.lines.length} segments · ${result.minHeight.toFixed(1)}-${result.maxHeight.toFixed(1)} m`;
}

function drawTypeLabel(type: DrawResult["type"]): string {
  return type === "polyline" ? "绘制线" : type === "polygon" ? "绘制面" : "绘制点";
}

function measureTypeLabel(type: MeasureResult["type"]): string {
  if (type === "distance") {
    return "距离量测";
  }
  if (type === "area") {
    return "面积量测";
  }
  return "高度量测";
}

function pickTypeLabel(type: PickResult["type"]): string {
  if (type === "entity") {
    return "Entity";
  }
  if (type === "3dtiles") {
    return "3D Tiles";
  }
  if (type === "imagery") {
    return "Imagery";
  }
  return "Primitive";
}

function formatPickStatus(result: PickResult): string {
  const name = result.name ?? result.id;
  return `已拾取 ${pickTypeLabel(result.type)}：${name}`;
}

function formatPickPosition(result: PickResult): string {
  if (!result.cartographic) {
    return "无坐标";
  }

  return `${CesiumMath.toDegrees(result.cartographic.longitude).toFixed(5)}, ${CesiumMath.toDegrees(result.cartographic.latitude).toFixed(5)}, ${result.cartographic.height.toFixed(2)} m`;
}

function formatPickProperties(properties: Record<string, unknown>): [string, string][] {
  const entries = Object.entries(properties).slice(0, 8);
  if (entries.length === 0) {
    return [["properties", "无属性"]];
  }

  return entries.map(([key, value]) => [key, formatPropertyValue(value)]);
}

function formatPropertyValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatMeters(meters: number): string {
  return Math.abs(meters) >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${meters.toFixed(2)} m`;
}

function formatSquareMeters(squareMeters: number): string {
  return Math.abs(squareMeters) >= 1_000_000
    ? `${(squareMeters / 1_000_000).toFixed(2)} km2`
    : `${squareMeters.toFixed(0)} m2`;
}

function formatCubicMeters(cubicMeters: number): string {
  return Math.abs(cubicMeters) >= 1_000_000_000
    ? `${(cubicMeters / 1_000_000_000).toFixed(3)} km3`
    : `${cubicMeters.toFixed(0)} m3`;
}

function formatCameraView(view: CameraView): string {
  return `${view.longitude.toFixed(4)}, ${view.latitude.toFixed(4)}, ${view.height.toFixed(0)} m`;
}

function createTerrainDemoArea(): Cartesian3[] {
  return [
    Cartesian3.fromDegrees(114.145, 22.295, 0),
    Cartesian3.fromDegrees(114.205, 22.295, 0),
    Cartesian3.fromDegrees(114.205, 22.345, 0),
    Cartesian3.fromDegrees(114.145, 22.345, 0)
  ];
}
