# Kairos3DCesium

Kairos3DCesium is a pnpm monorepo for building a reusable Cesium common feature SDK, its documentation site, and runnable feature examples.

## Summary

| Workspace | Path | Purpose |
| --- | --- | --- |
| `@kairos3d/cesium` | `packages/kairos3d-cesium` | Framework-agnostic Cesium SDK package. |
| `@kairos3d/docs` | `apps/docs` | VitePress documentation site. |
| `@kairos3d/examples` | `apps/examples` | Vite React example site for SDK features. |

## Quick Start

```powershell
pnpm install
pnpm dev:examples
```

The examples app starts a local Vite server. The docs site can be started separately:

```powershell
pnpm dev:docs
```

## Common Commands

| Command | What it checks |
| --- | --- |
| `pnpm build` | Builds the SDK, examples site, and docs site. |
| `pnpm typecheck` | Runs TypeScript checks across all workspaces. |
| `pnpm test` | Runs SDK unit tests. |
| `pnpm lint` | Runs the current lightweight lint check, backed by TypeScript. |
| `pnpm verify` | Runs typecheck, tests, lint, and build in order. |
| `pnpm verify:runtime` | Starts a short-lived examples dev server and runs the browser runtime smoke check. |
| `pnpm release:check` | Runs the full non-publishing release verification and SDK pack dry run. |

`pnpm verify:runtime` requires a local Chromium-based browser. Set `CHROME_PATH` if Chrome is not in a standard location. Pass `-- --require-token` when the check must fail unless `apps/examples/.env` provides `VITE_CESIUM_ION_TOKEN`.

## Project Layout

```text
Kairos3DCesium/
|-- apps/
|   |-- docs/
|   `-- examples/
|-- packages/
|   `-- kairos3d-cesium/
|-- package.json
|-- pnpm-workspace.yaml
`-- tsconfig.base.json
```

## Cesium Asset Rule

Cesium needs runtime static assets such as `Workers`, `Assets`, `Widgets`, and `ThirdParty`. The examples app copies those assets with `vite-plugin-static-copy` and defines `CESIUM_BASE_URL`.

Keep this setup in each app that directly renders Cesium. The SDK package should keep `cesium` as a peer dependency and should not bundle Cesium itself.

## SDK Shape

The SDK is organized as small TypeScript modules instead of a global platform object.

| Subpath | Purpose |
| --- | --- |
| `@kairos3d/cesium/core` | `createMap`, `KairosMap`, events, viewer lifecycle. |
| `@kairos3d/cesium/layers` | Config-driven layer adapters, state management, grouping, ordering, and `registerLayer`. |
| `@kairos3d/cesium/tools` | Exclusive interactive tool lifecycle and `registerTool`. |
| `@kairos3d/cesium/draw` | Point, polyline, polygon drawing, editing, and draw result cleanup. |
| `@kairos3d/cesium/analysis` | Distance, area, height measurement, visibility/profile/terrain analysis, volume/flood/excavation estimates, clipping, and result cleanup. |
| `@kairos3d/cesium/scene` | Camera views, bookmarks, v1 snapshot validation, and transactional scene recovery. |
| `@kairos3d/cesium/picking` | Entity, 3D Tiles, imagery, and primitive picking with selection state. |
| `@kairos3d/cesium/materials` | Public-API material registry and factories for Entity properties and Primitive fabric materials. |
| `@kairos3d/cesium/effects` | SDK-managed geometry, particle, and weather effects with lifecycle and snapshot support. |
| `@kairos3d/cesium/operations` | Runtime operation status, progress, cancellation, and structured failure diagnostics. |
| `@kairos3d/cesium/style` | Shared symbol styles, style defaults, presets, and JSON-safe color serialization. |
| `@kairos3d/cesium/height` | Height modes, terrain sampling, clamp-to-ground helpers, and surface distance helpers. |
| `@kairos3d/cesium/results` | Aggregated SDK-managed result listing, lookup, removal, clearing, and result events. |
| `@kairos3d/cesium/performance` | Runtime stats, budget warnings, and Primitive optimization candidate hints. |
| `@kairos3d/cesium/primitives` | SDK-managed Primitive overlay helpers for performance-sensitive runtime graphics. |
| `@kairos3d/cesium/persistence` | Optional app-layer snapshot storage adapters. |

## Advanced Layers

Managed layers expose recoverable config, runtime Cesium objects, ownership checks for picking, and fly-to behavior.

```ts
await map.layers.add({
  id: "tileset-demo",
  type: "3dtiles",
  url: "/tileset/tileset.json",
  name: "Demo Tileset",
  group: "business",
  order: 10,
  maximumScreenSpaceError: 8,
  dynamicScreenSpaceError: true,
  skipLevelOfDetail: true,
  style: { color: "color('white', 0.92)" }
});

const objects = map.layers.getRuntimeObjects("tileset-demo");
await map.layers.flyTo("tileset-demo");

const configs = map.layers.toJSON();
await map.layers.load(configs, { clear: true, flyTo: false });
```

`getRuntimeObjects()` returns Cesium runtime objects such as `ImageryLayer`, `GeoJsonDataSource`, glTF `Entity`, `Cesium3DTileset`, or the active terrain provider. These objects are useful for picking, clipping, and app-level inspection, but they are never serialized by `toJSON()` or scene snapshots.

Terrain keeps Cesium's single-current-terrain model. Loading a terrain layer replaces the current provider while it is shown and restores the previous provider when the SDK-managed terrain layer is removed.

## Picking And Selection

Picking returns normalized result data instead of opening SDK-owned popup UI. Apps can render their own panels from `PickResult.properties`.

```ts
const result = await map.picking.pick(windowPosition);

map.picking.enableClick({
  select: true,
  includeImagery: false
});

map.picking.on("pick", (event) => {
  console.log(event.data.result);
});

map.selection.clear();
```

## Styles

Styles are SDK-managed data for draw, measurement, analysis, clipping, and selection results.

```ts
map.styles.setDefaults({
  draw: {
    polyline: { line: { color: "#00d4ff", width: 3 } }
  }
});

map.styles.registerPreset("warning", {
  line: { color: "#ff3b30", width: 4 },
  point: { color: "#ffcc00", pixelSize: 10 },
  label: { color: "#ffffff", outlineColor: "#000000" }
});

map.draw.setStyle(result.id, map.styles.getPreset("warning") ?? {});
```

Serializable result styles are included in runtime snapshots. Cesium `Material`, callbacks, functions, and app UI state are not serialized.

## Height Modes

Height options make draw, measurement, and profile results explicit about their vertical semantics.

```ts
const ground = await map.height.clampPositions(positions);
const sampled = await map.height.sampleTerrain(positions);

await map.draw.polyline({
  height: { mode: "clampToGround" },
  renderMode: "primitive"
});

await map.analysis.measure.distance({
  mode: "surface",
  height: { mode: "clampToGround", sampleTerrain: true },
  renderMode: "primitive"
});

await map.analysis.profile.draw({
  sampleCount: 128,
  height: { mode: "clampToGround", sampleTerrain: true }
});
```

`absolute` is the default for compatibility. `surface` distance uses resolved or sampled positions. `surface` area is currently a typed boundary only; the SDK does not claim true triangulated terrain area yet. When the active terrain provider has no availability, sampling returns original positions and marks samples as `sampled: false`.

## Terrain Analysis

Terrain analysis builds on the active viewer terrain provider. It includes terrain sample grids, slope/aspect summaries, contour line generation, and sampled-cell or triangulated estimates for volume, flooding, and excavation.

```ts
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
  sampleStep: 30,
  precision: { volumeMode: "triangulated" }
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

map.analysis.terrain.clear();
```

Large terrain areas must use a coarser `sampleStep` or a higher explicit `maxSamples`. Volume, flooding, and excavation default to compatible sampled-cell accumulation and can opt into triangulated estimates. They are still engineering estimates, not survey-grade terrain solids. If the active terrain provider has no availability, the SDK returns deterministic unsampled grid data instead of inventing terrain heights.

## Clipping

Clipping is SDK-managed analysis state. It can target the globe, a managed layer runtime object, or a picked result when the underlying Cesium object supports clipping.

```ts
const plane = map.analysis.clipping.addPlane({
  target: { type: "globe" },
  normal: Cartesian3.UNIT_Z,
  distance: 0
});

await map.analysis.clipping.drawPolygon({
  target: { type: "globe" },
  inverse: false
});

map.analysis.clipping.setEnabled(plane.id, false);
map.analysis.clipping.edit(plane.id);
map.analysis.clipping.updatePlane(plane.id, { distance: 20 });
map.analysis.clipping.stopEdit();
map.analysis.clipping.clear();
```

Polygon clipping depends on Cesium scene support for `ClippingPolygonCollection`. Clipping results can be programmatically edited with `edit/stopEdit/cancelEdit/updatePlane/updatePolygon`; popup UI and excavation widgets stay outside the SDK core.

## Materials And Effects

`map.materials` creates Entity `MaterialProperty` values or Primitive fabric materials through Cesium public APIs. `map.effects` owns long-running geometry, particle, and weather runtimes separately from analysis results.

```ts
const property = map.materials.createProperty({
  target: "entity",
  type: "polyline-glow",
  color: "#00d4ff",
  glowPower: 0.2
});

const effect = await map.effects.add({
  id: "traffic-flow",
  type: "flow-line",
  positions,
  width: 4,
  group: "traffic",
  material: {
    type: "flow",
    color: "#00d4ff",
    speed: 1.5
  }
});

await map.effects.update(effect.id, {
  material: { type: "flow", color: "#35d07f", speed: 2 }
});
map.effects.setGroupShow("traffic", false);
```

Built-in Entity materials cover color, image, grid, stripe, checkerboard, polyline dash, and polyline glow. Primitive materials cover color, image, water, flow, radial wave, and radar scan. Effects cover flow line/wall, pulse circle, radar scan, water surface, particles, rain, snow, and fog.

## Operations And Loading

Long-running layer, effect, scene, visibility, profile, and terrain work is exposed through `map.operations` without changing the existing API return values.

```ts
import { isOperationCanceledError } from "@kairos3d/cesium/operations";

const controller = new AbortController();
const loading = map.layers.load(configs, {
  clear: true,
  signal: controller.signal,
  operationId: "load-city"
});

map.operations.on("change", (event) => {
  console.log(event.data.status, event.data.progress, event.data.phase);
});

map.operations.cancel("load-city");
try {
  await loading;
} catch (error) {
  if (!isOperationCanceledError(error)) throw error;
}
```

Cancellation prevents late scene commits where the underlying Cesium promise cannot be aborted. A canceled transactional scene load rejects immediately, while `map.sceneState.whenIdle()` waits for background rollback to finish. See [Operations And Loading](apps/docs/guide/operations.md) and [Transactional Scene Recovery](apps/docs/guide/scene-transactions.md).

## Scene State

Scene state stores `camera + layers + bookmarks` by default. It can also include SDK-managed results, primitive overlays, and effects when a business app needs to save a complete working scene.

```ts
const view = map.sceneState.captureCamera();
await map.sceneState.flyToCamera(view);

map.sceneState.bookmarks.add({
  id: "home",
  name: "Default view",
  view
});

const snapshot = map.sceneState.toJSON({
  includeResults: true,
  includePrimitives: true,
  includeEffects: true
});
await map.sceneState.load(snapshot, {
  mode: "transactional",
  clearLayers: true,
  flyToCamera: true,
  restoreResults: true,
  clearResults: true,
  restorePrimitives: true,
  clearPrimitives: true,
  restoreEffects: true,
  clearEffects: true
});
```

`transactional` is the default load mode. It validates and prepares all supported SDK-managed runtime before replacing the current scene; commit failures restore the original runtime objects. Use `mode: "progressive"` only for legacy custom layer adapters that do not implement transaction hooks or when partial phase-by-phase loading is intentional.

`SceneSnapshot` remains fixed at `version: 1`; the SDK does not expose migration APIs while no incompatible persisted schema exists. Runtime snapshots are data-only. `EffectSnapshot` stores serializable effect configuration and restarts animation from its initial phase on recovery; it does not serialize Cesium `Material`, `Primitive`, `ParticleSystem`, `PostProcessStage`, callbacks, functions, or intermediate animation state. Custom material definitions must be registered before restoring effects that reference them.

## Persistence Adapters

Snapshot persistence is optional and app-controlled.

```ts
import { createMemorySnapshotStorage } from "@kairos3d/cesium/persistence";

const storage = createMemorySnapshotStorage();
await storage.save("latest", snapshot, { name: "Latest scene" });
const restored = await storage.load("latest");
```

The SDK does not auto-write `localStorage` or call a backend. Use the adapter interface to connect snapshots to the storage layer chosen by the application.

## Result Management

`map.results` is a lightweight aggregate index over SDK-managed draw and analysis results. It does not own Cesium entities; `remove()` and `clear()` delegate to the original managers so their cleanup and events stay intact.

```ts
const records = map.results.list();
const terrainRecords = map.results.list({ source: "terrain" });
const distanceRecords = map.results.list({ type: "distance" });

const record = map.results.get("draw-1");
map.results.remove("draw-1", "draw");
map.results.clear({ source: ["measure", "visibility"] });
```

## Performance And Primitive Planning

`map.performance` provides runtime stats for SDK-managed results, viewer entities, result Primitive runtimes, layer runtime objects, effects, effect runtime objects, animated effects, active operations, failed operations, and simple budget warnings. The operation fields are exposed as `activeOperationCount` and `failedOperationCount`. It does not replace renderers by itself; it identifies where a Primitive renderer is likely to matter.

```ts
map.performance.setBudget({
  maxEntities: 500,
  maxResults: 100,
  maxResultEntities: 300
});

const stats = map.performance.getStats();
const warnings = map.performance.checkBudget();
const candidates = map.performance.recommendPrimitiveCandidates({
  minEntityCount: 20
});
```

Primitive candidates are hints, not automatic rewrites. Results that already use `renderMode: "primitive"` are skipped by candidate recommendations.

## Primitive Overlays

`map.primitives` manages lightweight runtime overlays backed by Cesium primitives. The first overlay type is a polyline stored in an SDK-owned `PolylineCollection`.

```ts
const overlay = map.primitives.addPolyline({
  positions,
  color: "#ffcc00",
  width: 4
});

map.primitives.setShow(overlay.id, false);

const primitiveState = map.primitives.toJSON();
map.primitives.clear();
map.primitives.load(primitiveState, { clear: true });
```

Primitive overlays are runtime graphics, not draw results. Draw polyline/polygon and distance/area measurement can also opt into Primitive-backed result rendering with `renderMode: "primitive"`; those result primitives are owned by their result manager rather than `map.primitives`. Primitive overlays have their own data-only snapshot API and can participate in scene snapshots with `includePrimitives: true`.

`references/SRC` and `references/mars3d-sdk-2.2` are migration references. Port algorithms feature by feature, but keep the new SDK free of global mutation, hardcoded tokens, legacy Cesium APIs, and DOM widget assumptions.

When choosing between adding more feature types and strengthening shared foundations, prefer the foundation first. Stable layer, tool, draw, and result contracts make later complex examples easier to build and verify.
