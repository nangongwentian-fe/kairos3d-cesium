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
| `draw` | Point/polyline/polygon drawing, result list/get/remove/clear, style updates, data-only snapshots, first-stage vertex editing, and opt-in Primitive rendering for polyline/polygon. |
| `analysis.measure` | Distance, area, and height measurement with stable result records and cleanup, plus opt-in Primitive rendering for distance/area. |
| `analysis.visibility` | Programmatic and picked two-point visibility results with terrain and optional scene occlusion. |
| `analysis.profile` | Polyline profile sampling, distance chain, min/max height, managed entities, and snapshots. |
| `analysis.clipping` | Plane and polygon clipping for globe, managed layers, compatible picked targets, and programmatic result editing. |
| `analysis.terrain` | Terrain sample grids, slope/aspect, contours, sampled-cell and triangulated volume, flood, and excavation estimates. |
| `scene` | Camera capture/fly-to, bookmarks, v1 snapshot validation, transactional recovery with rollback diagnostics, optional runtime result recovery, and optional primitive/effect recovery. |
| `picking` | Entity, GeoJSON, glTF, 3D Tiles, primitive, and optional imagery feature normalization. |
| `materials` | Target-aware Entity/Primitive material registry and factories built only on public Cesium APIs. |
| `effects` | Nine managed geometry, particle, and weather effects with grouping, lifecycle cleanup, shared animation ticking, and data-only snapshots. |
| `operations` | Shared progress, cancellation, failure, retention, and late-commit protection for asynchronous SDK work. |
| `style` | JSON-safe colors, default styles, presets, and result style serialization. |
| `height` | Height modes, terrain sampling helpers, clamp helpers, and surface distance path. |
| `results` | Aggregate listing, lookup, remove, clear, and events across SDK-managed draw and analysis results. |
| `performance` | Runtime stats, result/layer counts, budget warnings, and Primitive optimization candidate hints. |
| `primitives` | SDK-managed Primitive polyline overlays with manual data-only snapshot/load. |
| `persistence` | Optional memory and localStorage-compatible snapshot storage adapters. |

## Snapshot Contract

| Stored | Not stored |
| --- | --- |
| Camera view, bookmarks, recoverable layer configs, and optional primitive/effect descriptions. | Cesium runtime objects, providers, and custom entities. |
| SDK-managed draw, measure, visibility, profile, terrain, and recoverable clipping results. | `PickResult.object`, 3D Tiles feature identity, picked-object clipping targets. |
| JSON-safe positions, vectors, colors, timestamps, result ids, types, and height/style options. | Cesium `Material`, `CallbackProperty`, functions, popup state, and app UI state. |

## Current Boundaries

| Topic | Boundary |
| --- | --- |
| Terrain analysis | Volume, flooding, excavation, and surface area can use triangulated estimates, but they are not survey-grade solid modeling or real terrain deformation. |
| Surface area | `surface` area is implemented through sampled grid triangulation. |
| Primitive rendering | Entity rendering is still the default. Draw polyline/polygon and distance/area measurement can opt into Primitive-backed rendering with `renderMode: "primitive"`. |
| Scene snapshots | `SceneSnapshot` remains version `1`; transactional recovery is the default, and no migration API exists before a real incompatible schema change. |
| Operations | Cancellation rejects immediately, while late Cesium work is retained only for cleanup and cannot commit afterward. |
| Effects | Effect snapshots contain descriptors only; they never serialize Cesium materials, primitives, particle systems, stages, or animation phase. |
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
