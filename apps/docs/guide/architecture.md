# Architecture

This page describes the public SDK module boundaries, runtime ownership, snapshots, and Cesium application requirements.

## Summary

| Topic | Contract |
| --- | --- |
| SDK package | Framework-agnostic TypeScript with `cesium` as a peer dependency. |
| Runtime state | SDK-owned state is composed under `KairosMap`. |
| Application integration | Each consuming app provides Cesium static assets and its preferred UI framework. |
| Serialization | Snapshots contain recoverable data descriptors, never Cesium runtime object identities. |

## Cesium Runtime Assets

Any application that creates a Cesium `Viewer` must serve these directories and define `CESIUM_BASE_URL`:

| Directory | Purpose |
| --- | --- |
| `Workers` | Cesium background workers. |
| `Assets` | Textures, images, and data assets. |
| `Widgets` | Widget CSS and images. |
| `ThirdParty` | Runtime files used by Cesium internals. |

Asset copying belongs to the consuming application so each app can choose its own bundler and deployment base path.

## SDK Modules

| Subpath | Public responsibility |
| --- | --- |
| `@kairos3d/cesium/core` | Viewer lifecycle, `KairosMap`, and events. |
| `@kairos3d/cesium/layers` | Layer adapters, state, ordering, grouping, runtime ownership, and config recovery. |
| `@kairos3d/cesium/tools` | Exclusive interaction lifecycle and shared tool events. |
| `@kairos3d/cesium/draw` | Drawing, editing, result ownership, styles, properties, and snapshots. |
| `@kairos3d/cesium/overlays` | Programmatic runtime graphics with grouping, properties, and snapshots. |
| `@kairos3d/cesium/analysis` | Measurement, visibility, profile, terrain, clipping, and result lifecycle. |
| `@kairos3d/cesium/scene` | Camera views, bookmarks, v1 snapshot validation, transaction recovery, and diagnostics. |
| `@kairos3d/cesium/picking` | Object normalization, properties, selection, and highlight state. |
| `@kairos3d/cesium/materials` | Entity and Primitive material definitions built on public Cesium APIs. |
| `@kairos3d/cesium/effects` | Geometry, particle, and weather effect lifecycle. |
| `@kairos3d/cesium/operations` | Async status, progress, cancellation, and failure diagnostics. |
| `@kairos3d/cesium/concurrency` | Observable mutation leases, conflicts, and runtime idle waits. |
| `@kairos3d/cesium/style` | JSON-safe symbol styles, defaults, and presets. |
| `@kairos3d/cesium/height` | Height modes, terrain sampling, and clamp helpers. |
| `@kairos3d/cesium/results` | Aggregate lookup and cleanup for SDK-managed results. |
| `@kairos3d/cesium/performance` | Runtime statistics, budgets, and optimization hints. |
| `@kairos3d/cesium/primitives` | SDK-managed Primitive overlays. |
| `@kairos3d/cesium/persistence` | Optional application-controlled snapshot storage adapters. |

## Runtime Ownership

| Runtime | Owner and cleanup rule |
| --- | --- |
| Layers | `map.layers` owns default adapter runtime objects and exposes them through `getRuntimeObjects()`. |
| Draw and overlays | Their managers own entities or Primitive runtimes and remove them with the logical result. |
| Analysis | Each analysis manager owns its result entities, primitives, clipping collections, and snapshots. |
| Effects | `map.effects` owns its Primitives, ParticleSystems, PostProcessStages, and shared animation ticker. |
| Selection | `map.selection` owns only temporary highlight state and restores supported original styles. |
| Scene staging | Transaction participants own prepared runtime until commit, rollback, finalize, or dispose completes. |

Business-created Cesium objects outside SDK managers are not automatically serialized, selected, rolled back, or destroyed by the SDK.

## Layer Boundaries

| Feature | Current contract |
| --- | --- |
| Default adapters | XYZ, WMS, WMTS, terrain, 3D Tiles, GeoJSON, and glTF. |
| State | `listState()` exposes id, type, group, show, order, opacity, metadata, and recoverable config. |
| Runtime access | `getRuntimeObjects(id)` supports picking, clipping, and inspection without serializing runtime objects. |
| Terrain | Cesium has one active terrain provider; the SDK does not create a terrain stack. |
| Custom recovery | Custom adapters implement `toConfig()` for snapshots and transaction hooks for strong scene recovery. |
| Imagery picking | Feature queries are opt-in and still depend on provider support. |

## Analysis Boundaries

| Feature | Current contract |
| --- | --- |
| Visibility | Samples ellipsoid or terrain and can optionally include Cesium scene ray picking. |
| Profile | Returns samples and managed graphics; charts are application UI. |
| Terrain analysis | Provides sampled grids and browser-side estimates, not survey-grade solid modeling. |
| Clipping | Supports globe, managed layer, and compatible picked targets. |
| UI | Charts, popups, and business panels belong to the consuming app or optional UI package. |

## Scene And Snapshot Boundaries

| Feature | Current contract |
| --- | --- |
| Version | `SceneSnapshot.version` remains `1`; no migration API exists before an incompatible persisted schema appears. |
| Default load | `sceneState.load()` defaults to transactional recovery. |
| Progressive load | Available for intentional partial recovery and legacy custom adapters. |
| Stored data | Camera, bookmarks, recoverable layers, and optional results, primitives, overlays, and effects. |
| Excluded data | Cesium runtime objects, callbacks, functions, picked feature identities, operation history, and UI state. |
| Rollback | Supported SDK runtime is reattached after commit failure or cancellation; `whenIdle()` waits for cleanup. |
| Transient state | Active tools and selection are stopped or cleared at commit and are not restored. |

See [Transactional Scene Recovery](./scene-transactions.md) for the complete load contract.

## Operations And Concurrency

| Topic | Contract |
| --- | --- |
| Cancellation | Canceled promises reject immediately; uninterruptible Cesium work may remain only for cleanup. |
| Progress | Operation progress is monotonic from `0` to `1`. |
| Ordinary mutation | Conflicting writes throw `RuntimeMutationConflictError`. |
| Scene recovery | Holds a scene-wide exclusive lease and waits by default. |
| Public access | Applications can observe operations and leases but cannot acquire arbitrary internal leases. |

See [Operations And Loading](./operations.md) and [Runtime Concurrency](./runtime-concurrency.md).

## Picking And Selection

| Feature | Current contract |
| --- | --- |
| Result types | Entity, GeoJSON/glTF entities, 3D Tiles features, imagery feature info, and primitives. |
| Layer ownership | Default adapters resolve supported picked objects to a layer id. |
| Imagery | Disabled by default because provider feature picking can trigger requests. |
| Highlight | Entity and 3D Tiles highlights are reversible; unsupported objects still produce selection state. |
| UI | Property tables, sanitization, and popup rendering are application responsibilities. |

## Materials, Effects, And Styles

| Feature | Current contract |
| --- | --- |
| Entity materials | Use public Cesium `MaterialProperty` classes. |
| Primitive materials | Use public `new Material({ fabric })`. |
| Custom definitions | Must be registered before loading snapshots that reference them. |
| Effect updates | Prepare new runtime before replacing the old effect. |
| Effect snapshots | Store descriptors only and restart animation from the initial phase. |
| Result styles | Store JSON-safe point, line, polygon, label, billboard, and model style data. |

## Height, Performance, And Primitives

| Feature | Current contract |
| --- | --- |
| Height modes | `absolute`, `clampToGround`, and `relativeToGround`. |
| Terrain sampling | Uses the active terrain provider and preserves original positions when sampling is unavailable. |
| Performance | Statistics and budgets are diagnostic; they do not mutate the scene. |
| Primitive overlays | Stored as data descriptors and owned separately from draw or analysis results. |
| Result rendering | Supported draw and measure paths can opt into `renderMode: "primitive"`; Entity remains the default. |

True terrain deformation, model roaming, camera route systems, and automatic replacement of Entity rendering are not currently provided.
