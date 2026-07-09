# Getting Started

This page covers the shortest path for installing dependencies, running the example app, and building the workspace.

## Common Path

```powershell
pnpm install
pnpm dev:examples
```

Start the docs site in a separate terminal when needed:

```powershell
pnpm dev:docs
```

## Verification

| Command | Expected result |
| --- | --- |
| `pnpm build` | SDK, examples, and docs build successfully. |
| `pnpm typecheck` | All workspace TypeScript checks pass. |
| `pnpm test` | SDK unit tests pass. |

## Package Usage

```ts
import { Cartesian3 } from "cesium";
import { createMap } from "@kairos3d/cesium/core";

const map = await createMap({
  container: "cesiumContainer",
  viewerOptions: {
    baseLayer: false
  },
  layers: [
    {
      id: "osm",
      type: "xyz",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    }
  ]
});

map.tools.on("complete", (event) => {
  console.log(event.data);
});

map.styles.setDefaults({
  draw: {
    polyline: { line: { color: "#00d4ff", width: 3 } }
  },
  selection: {
    entity: { point: { color: "#ffd400", pixelSize: 12 } },
    tilesFeature: { color: "#ffd400" }
  }
});

map.layers.setShow("osm", false);
map.layers.toggle("osm");
map.layers.setOpacity("osm", 0.6);
const layerObjects = map.layers.getRuntimeObjects("osm");
const layerConfigs = map.layers.toJSON();
await map.layers.load(layerConfigs, { clear: true, flyTo: false });

await map.layers.add({
  id: "tileset-demo",
  type: "3dtiles",
  url: "/tileset/tileset.json",
  maximumScreenSpaceError: 8,
  dynamicScreenSpaceError: true,
  skipLevelOfDetail: true,
  style: { color: "color('white', 0.92)" }
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

console.log(layerObjects, map.layers.getRuntimeObjects("tileset-demo"));

const cameraView = map.sceneState.captureCamera();
await map.sceneState.flyToCamera(cameraView);
map.sceneState.bookmarks.add({
  id: "home",
  name: "Default view",
  view: cameraView
});
const snapshot = map.sceneState.toJSON({
  includeResults: true,
  includePrimitives: true
});
await map.sceneState.load(snapshot, {
  clearLayers: true,
  flyToCamera: true,
  restoreResults: true,
  clearResults: true,
  restorePrimitives: true,
  clearPrimitives: true
});

map.picking.enableClick({ select: true, includeImagery: false });
map.picking.on("pick", (event) => {
  console.log(event.data.result?.properties);
});
map.selection.clear();

await map.draw.polyline();
await map.draw.polyline({ renderMode: "primitive" });
const result = map.draw.list()[0];
map.draw.setStyle(result.id, {
  line: { color: "#35d07f", width: 4 }
});
await map.draw.edit(result.id);
map.draw.stopEdit();

await map.draw.polyline({
  height: { mode: "clampToGround" }
});
await map.analysis.measure.distance({
  mode: "surface",
  height: { mode: "clampToGround", sampleTerrain: true },
  renderMode: "primitive"
});
const terrainSamples = await map.height.sampleTerrain(result.positions);

await map.analysis.visibility.pick();
await map.analysis.profile.draw({
  sampleCount: 128,
  height: { mode: "clampToGround", sampleTerrain: true }
});
const clipping = map.analysis.clipping.addPlane({
  target: { type: "globe" },
  normal: Cartesian3.UNIT_Z,
  distance: 0
});
map.analysis.clipping.setEnabled(clipping.id, false);

const terrainArea = [
  Cartesian3.fromDegrees(114.14, 22.29, 0),
  Cartesian3.fromDegrees(114.20, 22.29, 0),
  Cartesian3.fromDegrees(114.20, 22.34, 0),
  Cartesian3.fromDegrees(114.14, 22.34, 0)
];
await map.analysis.terrain.slopeAspect({
  area: terrainArea,
  sampleStep: 30,
  maxSamples: 2500
});
await map.analysis.terrain.contour({
  area: terrainArea,
  interval: 10,
  sampleStep: 30
});
await map.analysis.terrain.volume({
  area: terrainArea,
  baseHeight: 12,
  sampleStep: 30
});
await map.analysis.terrain.flood({
  area: terrainArea,
  waterHeight: 12,
  sampleStep: 30
});
await map.analysis.terrain.excavation({
  area: terrainArea,
  depth: 8,
  sampleStep: 30
});

const drawState = map.draw.toJSON();
await map.draw.load(drawState, { clear: true });
const analysisState = map.analysis.toJSON();
await map.analysis.load(analysisState, { clear: true });

const records = map.results.list();
const terrainRecords = map.results.list({ source: "terrain" });
const distanceRecords = map.results.list({ type: "distance" });
map.results.remove(records[0].id, records[0].source);

map.performance.setBudget({
  maxEntities: 500,
  maxResults: 100,
  maxResultEntities: 300
});
const performanceStats = map.performance.getStats();
const primitiveCandidates = map.performance.recommendPrimitiveCandidates({
  minEntityCount: 20
});

const primitiveOverlay = map.primitives.addPolyline({
  positions: terrainArea,
  color: "#ffcc00",
  width: 4
});
const primitiveState = map.primitives.toJSON();
map.primitives.load(primitiveState, { clear: true });

map.draw.clear();
map.analysis.measure.clear();
map.analysis.visibility.clear();
map.analysis.profile.clear();
map.analysis.clipping.clear();
map.analysis.terrain.clear();
map.picking.disableClick();
map.destroy();
```

Apps that render Cesium must also install `cesium` and configure Cesium static assets in their bundler.

## Height Notes

| Mode | Meaning |
| --- | --- |
| `absolute` | Use Cartesian positions as-is. This is the default and old snapshot behavior. |
| `clampToGround` | Render supported entities on the ground and optionally sample terrain for calculations. |
| `relativeToGround` | Treat `offset` as height above ground; sample terrain when exact positions are needed. |

When the active terrain provider has no availability, terrain sampling returns the original positions with `sampled: false`.

## Performance Notes

| Topic | Rule |
| --- | --- |
| Stats | `map.performance.getStats()` reads current viewer entities, SDK results, and layer runtime objects. |
| Budgets | `checkBudget()` reports warnings only; it does not remove results or change rendering. |
| Primitive candidates | Candidate records identify entity-heavy SDK results that may deserve a Primitive renderer. Results already using `renderMode: "primitive"` are skipped. |
| Result primitives | `getStats()` counts Primitive runtimes owned by SDK-managed results separately from `map.primitives` overlays. |

## Primitive Overlay Notes

| Topic | Rule |
| --- | --- |
| Current overlay | `map.primitives.addPolyline()` uses an SDK-owned Cesium `PolylineCollection`. |
| Snapshot | `map.primitives.toJSON/load()` is data-only and does not serialize Cesium primitive instances. |
| Scene snapshot | Primitive overlays are included only when `includePrimitives: true` is requested. |
| Result rendering | Draw polyline/polygon and distance/area measurement can opt into Primitive-backed rendering with `renderMode: "primitive"`. |

## Terrain Analysis Notes

| Topic | Rule |
| --- | --- |
| `sampleStep` | Meters between grid samples; larger values are safer for large areas. |
| `maxSamples` | Hard limit that prevents accidental high-density terrain requests. |
| Provider availability | Missing availability returns deterministic unsampled grid data instead of fake terrain heights. |
| Current terrain tools | Includes sampled grids, slope/aspect summaries, contour lines, sampled-cell estimates, and triangulated estimates. |
| Volume estimate | Defaults to sampled-cell accumulation and can opt into `precision: { volumeMode: "triangulated" }`. |
| Excavation | Computes against a horizontal bottom plane; it does not modify terrain or create excavation walls. |

## Layer Notes

| Topic | Rule |
| --- | --- |
| Runtime objects | Use `map.layers.getRuntimeObjects(id)` for Cesium objects needed by picking, clipping, or app inspection. |
| Recovery | `map.layers.toJSON()` stores recoverable config only, not Cesium objects or entities. |
| Terrain | Cesium has one active terrain provider; the SDK documents that behavior instead of creating a terrain stack. |
| Imagery picking | Provider feature queries are opt-in and depend on each imagery provider. |
