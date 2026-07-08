# @kairos3d/cesium

Framework-agnostic Cesium SDK package for Kairos3D projects.

## Current API

| Export | Purpose |
| --- | --- |
| `createMap` | Creates a `KairosMap` with viewer, layers, tools, and analysis managers. |
| `createViewer` | Creates a Cesium `Viewer` from a DOM container or container id. |
| `destroyViewer` | Destroys a `Viewer` if it exists and is not already destroyed. |
| `registerLayer` | Registers a custom config-driven layer adapter. |
| `LayerState` | Serializable layer state for list views and config recovery. |
| `LayerLoadOptions` | Options for loading a group of layer configs. |
| `TilesetLayerConfig` | Recoverable 3D Tiles layer config with common tileset runtime options. |
| `GeoJsonLayerStyle` | Basic point, line, and polygon style config for GeoJSON layers. |
| `GltfLayerConfig` | Recoverable glTF layer config with model, color, and height options. |
| `registerTool` | Registers a custom interactive tool. |
| `DrawResult` | Stable result shape for point, polyline, and polygon drawing. |
| `DrawResultSnapshot` | Serializable draw result shape for save/load. |
| `DrawEditOptions` | Options for editing managed draw results. |
| `DrawEditEvent` | Event payload emitted when draw result positions change. |
| `MeasureResult` | Stable result shape for distance, area, and height measurement. |
| `MeasureResultSnapshot` | Serializable measurement result shape for save/load. |
| `VisibilityResult` | Stable result shape for visibility analysis. |
| `ProfileResult` | Stable result shape for profile analysis. |
| `ProfileSample` | Sample point shape returned by profile analysis. |
| `SlopeAspectResult` | Terrain slope/aspect summary over a sampled polygon area. |
| `ContourResult` | Terrain contour line result over a sampled polygon area. |
| `VolumeResult` | Approximate cut/fill summary over a sampled terrain area. |
| `FloodResult` | Approximate flooded area and water volume summary. |
| `ExcavationResult` | Approximate excavation cut volume against a horizontal bottom plane. |
| `TerrainSampleGrid` | Sampled terrain grid used by terrain analysis results. |
| `ClippingResult` | Stable result shape for plane and polygon clipping. |
| `ClippingTarget` | Target descriptor for globe, layer, or picked-object clipping. |
| `AnalysisResultsSnapshot` | Serializable analysis result group for save/load. |
| `SerializablePosition` | JSON-safe longitude/latitude/height position. |
| `SerializableVector3` | JSON-safe vector shape for clipping plane normals. |
| `SerializableColor` | JSON-safe RGBA color shape for result styles. |
| `ResultSymbolStyle` | Shared point/line/polygon/label style shape for SDK-managed results. |
| `SDKStyleDefaults` | Default style configuration for draw, analysis, clipping, and selection. |
| `HeightMode` | Stable height mode: `absolute`, `clampToGround`, or `relativeToGround`. |
| `HeightOptions` | JSON-safe height options used by draw, measurement, profile, and snapshots. |
| `HeightSample` | Terrain sampling result with original position, resolved position, height, and sampled flag. |
| `DistanceMeasureMode` | Distance measurement mode: `space` or `surface`. |
| `AreaMeasureMode` | Area measurement mode: `projected` or `surface`. |
| `CameraView` | Serializable camera position and orientation. |
| `CameraBookmark` | Serializable named camera bookmark. |
| `RuntimeResultsSnapshot` | Serializable draw and analysis result group for scene snapshots. |
| `SceneSnapshot` | Serializable `camera + layers + bookmarks` snapshot, optionally with runtime results. |
| `SceneStateSnapshotOptions` | Options for exporting scene snapshots. |
| `SceneStateLoadOptions` | Options for loading a scene snapshot. |
| `ResultRecord` | Aggregated index entry for an SDK-managed runtime result. |
| `ResultSource` | Source label for aggregated results: draw, measure, visibility, profile, clipping, or terrain. |
| `ResultQueryOptions` | Filters accepted by `map.results.list()` and `map.results.clear()`. |
| `PerformanceStats` | Runtime stats for entities, SDK results, and layer runtime objects. |
| `PerformanceBudget` | Optional limits used by `map.performance.checkBudget()`. |
| `PrimitiveOptimizationCandidate` | Entity-heavy result hint for later Primitive renderer work. |
| `ResultRenderMode` | Result renderer mode: default `entity` or opt-in `primitive`. |
| `ResultPrimitiveRuntime` | Runtime Primitive object metadata owned by SDK-managed results. |
| `PrimitivePolylineOverlay` | SDK-managed polyline overlay backed by Cesium `PolylineCollection`. |
| `PrimitiveOverlaySnapshot` | Data-only primitive overlay snapshot for manual save/load. |
| `PickResult` | Normalized result shape for Entity, 3D Tiles, imagery, and primitive picking. |
| `PickOptions` | Options for drill picking and optional imagery feature queries. |
| `SelectionState` | Current selected result and highlight state. |
| `ViewerContainer` | Container type accepted by `createViewer`. |
| `ViewerOptions` | Options type accepted by `createViewer`. |

## Install

```powershell
pnpm add @kairos3d/cesium cesium
```

`cesium` is a peer dependency and must be installed by the consuming app.

## Subpath Imports

```ts
import { Cartesian3 } from "cesium";
import { createMap } from "@kairos3d/cesium/core";
import { registerLayer } from "@kairos3d/cesium/layers";
import { registerTool } from "@kairos3d/cesium/tools";
import type { LayerState } from "@kairos3d/cesium/layers";
import type { SerializablePosition } from "@kairos3d/cesium/core";
import type { DrawEditEvent, DrawResult, DrawResultSnapshot } from "@kairos3d/cesium/draw";
import type {
  AnalysisResultsSnapshot,
  ClippingResult,
  ContourResult,
  MeasureResult,
  MeasureResultSnapshot,
  ProfileResult,
  SlopeAspectResult,
  VisibilityResult
} from "@kairos3d/cesium/analysis";
import type { CameraView, RuntimeResultsSnapshot, SceneSnapshot } from "@kairos3d/cesium/scene";
import type { PickResult, SelectionState } from "@kairos3d/cesium/picking";
import type { ResultSymbolStyle, SDKStyleDefaults } from "@kairos3d/cesium/style";
import type { HeightMode, HeightOptions, HeightSample } from "@kairos3d/cesium/height";
```

## Layer State

```ts
await map.layers.add({
  id: "osm",
  name: "OpenStreetMap",
  type: "xyz",
  group: "base",
  order: 0,
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
});

map.layers.setShow("osm", false);
map.layers.toggle("osm");
map.layers.setOpacity("osm", 0.6);
map.layers.move("osm", 10);

const states = map.layers.listState();
const runtimeObjects = map.layers.getRuntimeObjects("osm");
const configs = map.layers.toJSON();

await map.layers.load(configs, { clear: true, flyTo: false });
```

Advanced data source configs stay data-only and recoverable:

```ts
const position = Cartesian3.fromDegrees(114.16, 22.31, 20);

await map.layers.add({
  id: "tileset-demo",
  type: "3dtiles",
  url: "/tileset/tileset.json",
  maximumScreenSpaceError: 8,
  dynamicScreenSpaceError: true,
  skipLevelOfDetail: true,
  style: { color: "color('white')" }
});

await map.layers.add({
  id: "geojson-demo",
  type: "geojson",
  data: "/data/features.geojson",
  clampToGround: true,
  style: {
    stroke: "#35d07f",
    strokeWidth: 3,
    fill: { red: 0.1, green: 0.75, blue: 0.5, alpha: 0.25 }
  }
});

await map.layers.add({
  id: "model-demo",
  type: "gltf",
  url: "/models/demo.glb",
  position,
  height: { mode: "relativeToGround", offset: 10 },
  scale: 20,
  minimumPixelSize: 48
});
```

`getRuntimeObjects()` exposes the SDK-owned Cesium objects for picking, clipping, and app inspection. `toJSON()` only stores recoverable config; it does not serialize Cesium objects, entities, primitives, or provider instances. Terrain follows Cesium's single active terrain provider model rather than a terrain stack.

## Picking

```ts
const result = await map.picking.pick(windowPosition);
const results = await map.picking.drillPick(windowPosition, {
  limit: 5,
  includeImagery: false
});

map.picking.enableClick({ select: true });

map.picking.on("pick", (event) => {
  console.log(event.data.result?.properties);
});

map.selection.clear();
```

Picking is data-only. The SDK normalizes objects and manages selection state, but popup panels, property tables, and feature-specific UI belong in the app layer.

## Styles

```ts
map.styles.setDefaults({
  draw: {
    polyline: { line: { color: "#00d4ff", width: 3 } }
  },
  selection: {
    entity: { point: { color: "#ffd400", pixelSize: 12 } },
    tilesFeature: { color: "#ffd400" }
  }
});

map.styles.registerPreset("warning", {
  line: { color: "#ff3b30", width: 4 },
  point: { color: "#ffcc00", pixelSize: 10 },
  label: { color: "#ffffff", outlineColor: "#000000" }
});

map.draw.setStyle(result.id, map.styles.getPreset("warning") ?? {});
```

Result snapshots serialize SDK symbol styles as JSON-safe colors. Cesium materials, callbacks, functions, and app UI state stay outside the snapshot format.

## Height Modes

```ts
const ground = await map.height.clampPositions(positions);
const samples = await map.height.sampleTerrain(positions);

await map.draw.polyline({
  height: { mode: "clampToGround" }
});

await map.draw.polygon({
  height: { mode: "relativeToGround", offset: 10 }
});

await map.analysis.measure.distance({
  mode: "surface",
  height: { mode: "clampToGround", sampleTerrain: true }
});

const profile = await map.analysis.profile.compute({
  positions,
  sampleCount: 128,
  height: { mode: "clampToGround", sampleTerrain: true }
});

console.log(ground, samples, profile.samples);
```

`absolute` is the default mode and keeps older snapshots compatible. `clampToGround` uses Cesium ground rendering for lines and height references for point/polygon entities where Cesium supports them. `relativeToGround` stores an offset and can sample terrain when requested. If the active terrain provider does not expose availability, `sampleTerrain()` returns original positions with `sampled: false` instead of inventing heights.

`surface` distance is implemented by accumulating resolved positions. `surface` area is exposed as a type boundary only in this stage; true terrain-surface area needs a later triangulation pass.

## Terrain Analysis

```ts
const area = [
  Cartesian3.fromDegrees(114.14, 22.29, 0),
  Cartesian3.fromDegrees(114.20, 22.29, 0),
  Cartesian3.fromDegrees(114.20, 22.34, 0),
  Cartesian3.fromDegrees(114.14, 22.34, 0)
];

const slope = await map.analysis.terrain.slopeAspect({
  area,
  sampleStep: 30,
  maxSamples: 2500
});

const contour = await map.analysis.terrain.contour({
  area,
  interval: 10,
  sampleStep: 30
});

const volume = await map.analysis.terrain.volume({
  area,
  baseHeight: 12,
  sampleStep: 30
});

const flood = await map.analysis.terrain.flood({
  area,
  waterHeight: 12,
  sampleStep: 30
});

const excavation = await map.analysis.terrain.excavation({
  area,
  depth: 8,
  sampleStep: 30
});

await map.analysis.terrain.drawContour({
  interval: 10,
  sampleStep: 30
});

map.analysis.terrain.setStyle(contour.id, {
  line: { color: "#ffffff", width: 2, clampToGround: true }
});

map.analysis.terrain.clear();
```

Terrain results are SDK-managed and participate in `analysis.toJSON/load()` and scene snapshots with `includeResults: true`. `sampleStep` is meters. `maxSamples` protects the browser from accidental high-density requests. Volume, flooding, and excavation are first-stage sampled-cell estimates (`sampleStep * sampleStep` per sample), not survey-grade terrain solids or real terrain deformation. When the active terrain provider has no availability, results are marked as unsampled and use deterministic zero-height grid data.

## Scene State

```ts
const view = map.sceneState.captureCamera();
await map.sceneState.flyToCamera(view);

map.sceneState.bookmarks.add({
  id: "home",
  name: "Default view",
  view
});

const snapshot = map.sceneState.toJSON({ includeResults: true });
await map.sceneState.load(snapshot, {
  clearLayers: true,
  flyToCamera: true,
  restoreResults: true,
  clearResults: true
});
```

Scene snapshots include camera, recoverable layer configs, and camera bookmarks by default. Pass `includeResults: true` to also include SDK-managed draw, measure, visibility, profile, terrain, recoverable clipping results, and their serializable styles. Picked-object clipping, custom entities, Cesium runtime objects, and UI state are not serialized.

## Interaction Results

```ts
const map = await createMap({ container: "cesiumContainer" });

map.tools.on("complete", (event) => {
  console.log(event.data);
});

await map.draw.polyline({ renderMode: "primitive" });
const result = map.draw.list()[0];
await map.draw.edit(result.id);
map.draw.stopEdit();

await map.analysis.measure.distance({ renderMode: "primitive" });
await map.analysis.visibility.pick();
await map.analysis.profile.draw({ sampleCount: 128 });
await map.analysis.clipping.drawPolygon({
  target: { type: "globe" }
});

const records = map.results.list();
const terrainRecords = map.results.list({ source: "terrain" });
const distanceRecords = map.results.list({ type: "distance" });
map.results.remove(records[0].id, records[0].source);
map.results.clear({ source: ["measure", "visibility"] });

const drawState = map.draw.toJSON();
await map.draw.load(drawState, { clear: true });
const analysisState = map.analysis.toJSON();
await map.analysis.load(analysisState, { clear: true });

const start = Cartesian3.fromDegrees(114.16, 22.31, 500);
const end = Cartesian3.fromDegrees(114.22, 22.32, 500);
const visibility = await map.analysis.visibility.compute({ start, end });
const profile = await map.analysis.profile.compute({
  positions: [start, end],
  sampleCount: 128
});
const plane = map.analysis.clipping.addPlane({
  target: { type: "globe" },
  normal: Cartesian3.UNIT_Z,
  distance: 0
});
console.log(visibility.visible, profile.samples, plane.enabled);

map.draw.clear();
map.analysis.measure.clear();
map.analysis.visibility.clear();
map.analysis.profile.clear();
map.analysis.clipping.clear();
```

`map.results` is an aggregate index. It delegates cleanup to the source manager and does not serialize or own Cesium entities.

## Performance And Primitive Planning

```ts
map.performance.setBudget({
  maxEntities: 500,
  maxResults: 100,
  maxResultEntities: 300,
  maxLayerRuntimeObjects: 100
});

const stats = map.performance.getStats();
const warnings = map.performance.checkBudget();
const candidates = map.performance.recommendPrimitiveCandidates({
  minEntityCount: 20
});
```

`map.performance` is a diagnostics layer. It tracks current Entity counts, SDK-managed result counts, result Primitive runtime counts, layer runtime object counts, and budget warnings. Primitive candidates are hints for renderer-specific work; results already using `renderMode: "primitive"` are skipped by candidate recommendations.

## Primitive Overlays

```ts
const overlay = map.primitives.addPolyline({
  positions,
  color: "#ffcc00",
  width: 4,
  metadata: { source: "demo" }
});

map.primitives.setShow(overlay.id, false);

const primitiveState = map.primitives.toJSON();
map.primitives.clear();
map.primitives.load(primitiveState, { clear: true });
```

Primitive overlays are SDK-managed runtime graphics. The first implementation uses Cesium `PolylineCollection` for polyline overlays. They are not draw results, do not participate in `map.results`, and are not automatically included in scene snapshots yet.

Draw polyline/polygon and distance/area measurement results can opt into Primitive-backed rendering with `renderMode: "primitive"`. The result keeps the same public result shape and data-only snapshot fields, while the Cesium Primitive runtime objects are owned and cleaned up by `map.draw` or `map.analysis.measure`.

## First-Stage Modules

| Module | Included now |
| --- | --- |
| `core` | `KairosMap`, `Evented`, viewer creation and destroy lifecycle. |
| `layers` | `xyz`, `wms`, `wmts`, `terrain`, `3dtiles`, `geojson`, `gltf`, state list, group show, ordering, opacity, config export/load. |
| `tools` | One active interactive tool at a time, plus `start`, `stop`, `cancel`, `complete`, `point-add`, and `clear` events. |
| `draw` | Point, polyline, polygon, result list/update/edit/remove/clear, and opt-in Primitive rendering for polyline/polygon. |
| `analysis` | Distance, area, height measurement, visibility/profile/terrain analysis, volume/flood/excavation estimates, clipping, result list/remove/clear, result snapshot load/export, and opt-in Primitive rendering for distance/area. |
| `scene` | Camera capture/fly-to, camera bookmarks, scene snapshot export/load, and optional runtime result recovery. |
| `picking` | Entity, GeoJSON, glTF, 3D Tiles, optional imagery feature picking, selection, and first-stage highlight. |
| `style` | Shared color parsing, style defaults, presets, and SDK result symbol styles. |
| `height` | Height mode normalization, terrain sampling, clamp helpers, and surface distance helpers. |
| `results` | Aggregated SDK-managed result listing, lookup, cleanup, and events for business panels. |
| `performance` | Runtime stats, budget warnings, and Primitive optimization candidate hints. |
| `primitives` | SDK-managed Primitive polyline overlays with manual data-only snapshot/load. |
