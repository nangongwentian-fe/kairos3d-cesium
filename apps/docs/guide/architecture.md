# Architecture

This page records the workspace boundaries for the SDK, docs site, and examples site.

## Summary

| Part | Rule |
| --- | --- |
| SDK package | Keep it framework-agnostic and keep `cesium` as a peer dependency. |
| Examples app | Render real Cesium scenes and copy Cesium runtime assets. |
| Docs app | Explain stable usage and architecture decisions before deep details. |
| Milestone priority | Prefer shared foundations before adding more feature types when both are useful. |

## Workspace Boundaries

```text
apps/docs
  VitePress documentation.

apps/examples
  Vite React examples that consume @kairos3d/cesium.

packages/kairos3d-cesium
  SDK source, tests, and package build config.
```

## Cesium Runtime Assets

Cesium loads static resources at runtime. Any app that directly creates a Cesium `Viewer` must provide:

| Directory | Why it is needed |
| --- | --- |
| `Workers` | Cesium background workers. |
| `Assets` | Textures, images, and data assets. |
| `Widgets` | Widget CSS and images. |
| `ThirdParty` | Runtime files used by Cesium internals. |

The examples app uses `vite-plugin-static-copy` and defines `CESIUM_BASE_URL`. Keep that app-level setup outside the SDK package so consumers can choose their own bundler.

## SDK Modules

| Subpath | Boundary |
| --- | --- |
| `@kairos3d/cesium/core` | Viewer lifecycle, `KairosMap`, and events. |
| `@kairos3d/cesium/layers` | Config-to-Cesium layer adapters, registry, state, ordering, grouping, and config recovery. |
| `@kairos3d/cesium/tools` | Exclusive interaction lifecycle and shared tool events. |
| `@kairos3d/cesium/draw` | Drawing tools, draw result management, and first-stage point/line/polygon editing. |
| `@kairos3d/cesium/analysis` | Measurement tools, visibility/profile/terrain analysis, clipping, and analysis result management. |
| `@kairos3d/cesium/scene` | Camera views, bookmarks, v1 snapshot validation, transactional recovery, and rollback diagnostics. |
| `@kairos3d/cesium/picking` | Object picking, normalized properties, selection state, and first-stage highlight. |
| `@kairos3d/cesium/materials` | Target-aware material registry and factories built on public Cesium material APIs. |
| `@kairos3d/cesium/effects` | Long-running geometry, particle, and weather effect lifecycle. |
| `@kairos3d/cesium/operations` | Shared runtime status, progress, cancellation, and failure lifecycle for async managers. |
| `@kairos3d/cesium/style` | Shared symbol styles, style defaults, presets, and JSON-safe color serialization. |
| `@kairos3d/cesium/height` | Height modes, terrain sampling, clamp-to-ground helpers, and surface distance helpers. |
| `@kairos3d/cesium/results` | Aggregated SDK-managed result index, query, cleanup, and events. |
| `@kairos3d/cesium/performance` | Runtime stats, budget warnings, and Primitive optimization candidate hints. |
| `@kairos3d/cesium/primitives` | SDK-managed Primitive overlay helpers for performance-sensitive runtime graphics. |
| `@kairos3d/cesium/persistence` | Optional app-layer snapshot storage adapters. |

## Migration Rules

| Legacy pattern | New SDK rule |
| --- | --- |
| `window.CityBaseX` / `viewer.mars` | Keep state on `KairosMap`. |
| Prototype mutation | Prefer wrappers, adapters, and registries. |
| Draw edit widget system | Use temporary edit handles owned by `map.draw`, not DOM widgets or global tooltips. |
| `Cesium.when` / `readyPromise` | Use `await` and current Cesium async factories. |
| `imageryProvider` Viewer option | Prefer `baseLayer` in app-level viewer options. |
| Hardcoded tokens | Accept tokens through app configuration. |

## Analysis Boundaries

| Feature | Current boundary |
| --- | --- |
| Visibility analysis | Samples ellipsoid or available terrain along the sight line and can opt into Cesium scene ray picking for 3D Tiles/model/primitive occlusion. |
| Profile analysis | Returns sample data and basic Cesium entities; charts and tables belong in the app layer. |
| Terrain analysis | Supports sampled grids, slope/aspect summaries, contour lines, and sampled-cell or triangulated volume/flood/excavation estimates over polygon areas. |
| Terrain density | `sampleStep` and `maxSamples` are required safety controls for browser-side terrain requests. |
| Terrain volume estimates | Volume, flooding, and excavation default to sampled-cell accumulation and can opt into triangulated estimates; they are not survey-grade terrain solids. |
| Clipping | Supports first-stage plane and polygon clipping for globe, managed layer runtime objects, and picked objects that expose Cesium clipping collections. |
| Clipping replacement | One SDK clipping collection is active per target; adding another clipping result for the same target replaces the previous SDK-owned result. |
| Polygon support | Polygon clipping checks `ClippingPolygonCollection.isSupported(scene)` and fails early when the current scene cannot support it. |
| Legacy analysis UI | Do not migrate Mars3D/SRC widget popups into the SDK core. |

## Layer Boundaries

| Feature | Current boundary |
| --- | --- |
| Layer state | `listState()` is the SDK-owned view of id, type, group, show, order, opacity, metadata, and recoverable config. |
| Config recovery | `toJSON()` only includes layers whose adapter can return a config. Custom adapters should implement `toConfig()` when recovery matters. |
| Runtime objects | `getRuntimeObjects(id)` exposes SDK-owned Cesium objects for picking, clipping, and app inspection, but those objects are never serialized. |
| 3D Tiles | Default config supports common `Cesium3DTileset.fromUrl()` options such as style, model matrix, screen-space error, dynamic screen-space error, skip LOD, collision, and picking flags. |
| GeoJSON | Default config supports Cesium load styling, clamp-to-ground, and entity ownership marking for picking. |
| glTF | Default config supports entity position, orientation, scale, model colors, silhouette, and SDK height mode. |
| Terrain | Cesium still has one active terrain provider; this SDK does not maintain a terrain stack. |
| Imagery services | XYZ, WMS, and WMTS adapters expose common provider fields. Feature picking still depends on provider support and is not enabled globally by the SDK. |
| Ordering | Default adapters update native order for imagery, GeoJSON data sources, and 3D Tiles primitives. Other layers keep SDK state order only. |

## Scene Boundaries

| Feature | Current boundary |
| --- | --- |
| Camera view | `CameraView` stores longitude/latitude in degrees, height in meters, and heading/pitch/roll in Cesium radians. |
| Schema version | `SceneSnapshot` remains `version: 1`. There is no migration registry or v1→v2 conversion while no incompatible persisted schema exists. |
| Validation | `parseSceneSnapshot()` validates and deep-clones the v1 envelope without reading the Viewer or creating Cesium runtime. Transaction prepare delegates business-section validation to each manager. Persistence and Widget layers delegate Scene envelope validation to Core. |
| Snapshot | `SceneSnapshot` stores `camera + layers + bookmarks` by default, and can opt into results, primitive overlays, overlays, and effects. |
| Default recovery | `sceneState.load()` defaults to `mode: "transactional"`: validate, prepare detached runtime, commit the swap, then finalize the old runtime. |
| Rollback | Commit failure or cancellation detaches new runtime and reattaches supported original runtime objects. `whenIdle()` waits for rollback completion. |
| Progressive recovery | `mode: "progressive"` retains phase-by-phase loading for intentional partial recovery and legacy custom layer adapters. |
| Custom layers | Transactional recovery requires `LayerAdapter.transaction` hooks. Unsupported custom adapters fail before scene mutation; progressive mode remains available. |
| Export guard | `sceneState.toJSON()` rejects while a transaction is active, so applications cannot persist an intermediate scene. |
| Runtime results | SDK-managed draw, measure, visibility, profile, terrain, and recoverable clipping results can be serialized without Cesium runtime objects. |
| Result styles | SDK-managed result styles are serialized as JSON-safe colors when `includeResults: true` is used. |
| Primitive overlays | SDK-managed primitive overlays can be serialized with `includePrimitives: true`. |
| Effects | SDK-managed effects can be serialized with `includeEffects: true` and restored or cleared with `restoreEffects` / `clearEffects`. |
| Result index | `map.results` aggregates SDK-managed result lookup and cleanup, but it delegates entity ownership to draw and analysis managers. |
| Clipping recovery | Clipping snapshots only restore `globe` targets and `layer` targets with a stable `layerId`; picked-object targets are skipped. |
| Unsupported state | Custom entities, `PickResult.object`, 3D Tiles feature identities, popup/widget UI, Cesium runtime materials/objects, callbacks, functions, and intermediate animation phases are not serialized. |
| Transaction scope | Strong rollback covers SDK-managed runtime with transaction support. Business-created Cesium objects, external event side effects, render-frame isolation, and Widget Workspace state are outside the Scene transaction. |
| Transient interaction | Commit stops the active Tool and clears Selection. These transient states are not serialized or restored during rollback. |
| Persistence | The SDK provides optional adapters, but apps still decide whether to use memory, localStorage, files, or a backend. |
| Roaming | Route flight, keyboard roam, first-person roam, tracking mode, and Mars3D-style camera systems are out of scope for this milestone. |

## Operation Boundaries

| Feature | Current boundary |
| --- | --- |
| Tracking | Layers, Effects, scene recovery, visibility, profile, and terrain compute expose one shared runtime operation contract. |
| Cancellation | Uses `AbortSignal`; work that Cesium cannot abort is prevented from committing after it resolves. |
| Progress | Progress is monotonic from `0` to `1`; composite scene loads reuse one parent operation instead of creating duplicate records. |
| Retention | At most 100 finished records are retained. Operation records are runtime diagnostics and are not serialized. |
| Scene recovery | Transactional mode uses one `scene.load` operation. Cancellation rejects that promise immediately; rollback continues independently and is observed through Scene transaction state. |
| Progressive limit | Progressive scene loading and direct `layers.load({ clear: true })` can leave completed phases applied after cancellation. |
| UI | Core does not add an Operations, Effects, or Transaction Widget. Applications subscribe to manager events directly. |

## Picking Boundaries

| Feature | Current boundary |
| --- | --- |
| Result shape | `PickResult` normalizes Entity, GeoJSON/glTF entities, 3D Tiles features, imagery feature info, and unsupported primitives. |
| Layer ownership | Default adapters expose runtime ownership so picked objects can resolve to a layer id when possible. |
| Imagery features | Imagery feature queries are opt-in with `includeImagery: true` because provider feature picking can trigger requests. |
| Selection | Entity picks use a temporary marker; 3D Tiles features get a reversible color highlight. |
| UI | Popup panels, property tables, sanitization of imagery HTML descriptions, and framework components belong in the app layer. |
| External queries | Server-side business attribute queries are not wrapped in this milestone. |

## Style Boundaries

| Feature | Current boundary |
| --- | --- |
| Color input | SDK accepts Cesium `Color`, CSS color strings, or JSON-safe RGBA objects. |
| Presets | `map.styles.registerPreset()` stores reusable SDK symbol styles; apps decide how presets are shown in UI. |
| Result updates | `setStyle()` only updates SDK-managed draw, measure, visibility, profile, clipping, and selection render objects. |
| Snapshot style | Result snapshots store serializable point, line, polygon, and label styles. |
| Thematic styling | SLD, Cesium 3D Tiles styling DSL, function callbacks, and full thematic mapping are out of scope. |

## Material And Effect Boundaries

| Feature | Current boundary |
| --- | --- |
| Material APIs | Entity materials use public `MaterialProperty` classes; Primitive materials use public `new Material({ fabric })`. Private material caches, shader fields, and global prototype changes are forbidden. |
| Registry | Built-in definitions cannot be replaced or unregistered. Custom definitions must be registered before restoring snapshots that reference them. |
| Effect ownership | `map.effects` owns its Primitives, ParticleSystems, PostProcessStages, and shared animation ticker. Effects do not participate in results, picking, selection, or layer ownership. |
| Replacement | Effect updates prepare a new runtime before replacing the old one; a failed update leaves the old effect active. |
| Rendering | Animated effects share one ticker and request renders when Cesium request-render mode is active. |
| Snapshot | `EffectSnapshot` stores serializable effect descriptors only. Runtime objects and the current animation phase are never serialized. |

## Height Boundaries

| Feature | Current boundary |
| --- | --- |
| Default mode | `absolute` keeps old draw, measure, analysis, and snapshot behavior stable. |
| Terrain sampling | Uses the active viewer terrain provider. If provider availability is missing, samples keep original positions and `sampled: false`. |
| Surface distance | Implemented by accumulating resolved or sampled positions. |
| Surface area | `surface` area can use sampled terrain grids and triangulated area estimates. |
| Rendering | Lines can use Cesium `clampToGround`; points and polygons use Cesium height references where supported. |
| Future terrain analysis | True terrain deformation, excavation wall rendering, heatmap rendering, and terrain-specific Primitive optimization are out of scope. The water-surface effect is visual-only and does not deform terrain. |

## Performance Boundaries

| Feature | Current boundary |
| --- | --- |
| Runtime stats | Counts viewer entities, SDK-managed result entities, layer runtime objects, result records, effects, effect runtime objects, animated effects, active operations, and failed operations. |
| Budgets | Budgets produce warnings only; they do not mutate layers, results, or viewer settings. |
| Primitive candidates | Candidate hints identify entity-heavy Entity results. Results already using `renderMode: "primitive"` are skipped. |
| Renderer ownership | Entity cleanup remains owned by draw and analysis managers; performance stats do not own runtime objects. |

## Primitive Overlay Boundaries

| Feature | Current boundary |
| --- | --- |
| Polyline overlay | Uses Cesium `PolylineCollection` for SDK-managed runtime polylines. |
| Snapshot | `map.primitives.toJSON/load()` stores positions, color, width, show, loop, metadata, and timestamps only. |
| Scene integration | Primitive overlays are separate runtime graphics and participate in scene snapshots only when `includePrimitives: true` is requested. |
| Draw integration | Draw polyline/polygon and distance/area measurement can opt into Primitive-backed result rendering with `renderMode: "primitive"`. |
| Ownership | Primitive-backed result runtimes are owned by `map.draw` or `map.analysis.measure`, not by `map.primitives`. |

## Reference Policy

Mars3D and Holo3D can inform feature design, but they are references rather than compatibility targets for this SDK.
