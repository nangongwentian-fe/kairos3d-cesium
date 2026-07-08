# First Version Status

This page records what the current SDK can claim as the first complete version and what remains deliberately out of scope.

## Summary

| Area | Status |
| --- | --- |
| Monorepo | SDK package, VitePress docs, and React examples are wired in one pnpm workspace. |
| SDK package | `@kairos3d/cesium` exposes framework-agnostic modules with Cesium as a peer dependency. |
| Runtime model | All SDK state hangs from `KairosMap`; the SDK does not mutate `window` or Cesium prototypes. |
| Examples | The examples app has tabs for layers, scene, picking, style, draw, measure, analysis, clipping, terrain, height, performance, and primitives. |
| Validation | The expected release check is `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. |

## Completed Capability Map

| Module | First-version capability |
| --- | --- |
| `core` | `createMap`, `createViewer`, destroy lifecycle, shared events, and manager composition. |
| `layers` | Config-driven XYZ/WMS/WMTS/terrain/3D Tiles/GeoJSON/glTF adapters, state, groups, order, opacity, runtime objects, ownership checks, fly-to, export, and load. |
| `tools` | Exclusive interactive tool lifecycle with shared start, stop, cancel, complete, point-add, and clear events. |
| `draw` | Point/polyline/polygon drawing, result list/get/remove/clear, style updates, data-only snapshots, and first-stage vertex editing. |
| `analysis.measure` | Distance, area, and height measurement with stable result records and cleanup. |
| `analysis.visibility` | Programmatic and picked two-point visibility results with managed entities. |
| `analysis.profile` | Polyline profile sampling, distance chain, min/max height, managed entities, and snapshots. |
| `analysis.clipping` | Plane and polygon clipping for globe, managed layers, and compatible picked targets. |
| `analysis.terrain` | Terrain sample grids, slope/aspect, contours, sampled-cell volume, flood, and excavation estimates. |
| `scene` | Camera capture/fly-to, bookmarks, scene snapshots, and optional runtime result recovery. |
| `picking` | Entity, GeoJSON, glTF, 3D Tiles, primitive, and optional imagery feature normalization. |
| `style` | JSON-safe colors, default styles, presets, and result style serialization. |
| `height` | Height modes, terrain sampling helpers, clamp helpers, and surface distance path. |
| `results` | Aggregate listing, lookup, remove, clear, and events across SDK-managed draw and analysis results. |
| `performance` | Runtime stats, result/layer counts, budget warnings, and Primitive optimization candidate hints. |
| `primitives` | SDK-managed Primitive polyline overlays with manual data-only snapshot/load. |

## Snapshot Contract

| Stored | Not stored |
| --- | --- |
| Camera view, bookmarks, recoverable layer configs. | Cesium runtime objects, providers, primitives, and custom entities. |
| SDK-managed draw, measure, visibility, profile, terrain, and recoverable clipping results. | `PickResult.object`, 3D Tiles feature identity, picked-object clipping targets. |
| JSON-safe positions, vectors, colors, timestamps, result ids, types, and height/style options. | Cesium `Material`, `CallbackProperty`, functions, popup state, and app UI state. |

## Current Boundaries

| Topic | Boundary |
| --- | --- |
| Terrain analysis | Volume, flooding, and excavation are sampled-cell estimates, not survey-grade solid modeling or real terrain deformation. |
| Surface area | The type exists as a boundary; true triangulated terrain-surface area is not implemented yet. |
| Primitive rendering | Primitive overlays exist, but draw and analysis results still render through their Entity-owned managers unless a module later adds a Primitive backend. |
| Scene snapshots | Primitive overlays have their own snapshot API and are not included in `sceneState.toJSON({ includeResults: true })` yet. |
| UI widgets | Popup panels, property tables, chart components, and Mars3D-style widgets belong in apps, not the SDK core. |
| Persistence | The SDK returns serializable data; apps decide whether to use files, localStorage, or a backend. |

## Release Check

Run these commands from the workspace root:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

The examples and docs servers are manual only:

```powershell
pnpm dev:examples
pnpm dev:docs
```
