# M1 Draw System Deepening Goal

## Outcome

Complete the first deepening pass for `packages/kairos3d-cesium` draw and overlay capabilities: richer managed draw types, stable properties/metadata, batch visibility/editing/group APIs, JSON-safe snapshots, and GeoJSON/Kairos JSON import/export helpers, while keeping SDK core framework-free and verifiable.

## Scope

This goal improves SDK core drawing foundations. It does not try to clone all Mars3D military plotting, widgets, DOM tooltip systems, or CityBaseX platform UI.

Primary targets:

- Extend managed draw/overlay data semantics with stable `properties`, `metadata`, `group`, `show`, `locked`, and `editable` fields.
- Add first high-value programmatic draw/overlay geometry types beyond the current set: `ellipse`, `wall`, `corridor`, `box`, and `cylinder` when Cesium Entity support is straightforward.
- Keep interactive editing focused and safe: preserve current point/polyline/polygon/circle/rectangle editing; add simple drag editing for point-like overlays where low risk.
- Add batch result management APIs: query/list filters, group operations, visibility, lock/editable controls, and group removal/clear.
- Add import/export helpers for SDK-managed draw/overlay data:
  - Kairos JSON snapshot format for full-fidelity restore.
  - GeoJSON export/import for supported point/line/polygon/circle/rectangle-style features, with unsupported types explicitly skipped or represented in properties.
- Preserve data-only snapshot behavior: no Cesium `Entity`, `Primitive`, `Material`, callback, function, or runtime object serialization.

## Inspect First

- `package.json`
- `packages/kairos3d-cesium/src/draw/**`
- `packages/kairos3d-cesium/src/overlays/**`
- `packages/kairos3d-cesium/src/style/**`
- `packages/kairos3d-cesium/src/scene/**`
- `packages/kairos3d-cesium/src/core/serialization.ts`
- Existing draw/overlay tests and public type tests.

## Public API Targets

Stabilize or add APIs in this shape when compatible with the existing code:

```ts
map.draw.list({
  type,
  group,
  visible,
  locked,
  editable
});

map.draw.setShow(id, show);
map.draw.setLocked(id, locked);
map.draw.setEditable(id, editable);
map.draw.setGroup(id, group);
map.draw.removeGroup(group);
map.draw.clearGroup(group);

map.draw.toGeoJSON();
await map.draw.loadGeoJSON(geojson, { clear: true });

map.overlays.list({ type, group, visible, locked, editable });
map.overlays.setShow(id, show);
map.overlays.setLocked(id, locked);
map.overlays.setEditable(id, editable);
map.overlays.setGroup(id, group);
map.overlays.removeGroup(group);
map.overlays.clearGroup(group);
map.overlays.toGeoJSON();
await map.overlays.loadGeoJSON(geojson, { clear: true });
```

New or extended public types should include:

```ts
interface DrawResult {
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  group?: string;
  show: boolean;
  locked: boolean;
  editable: boolean;
}

interface DrawQueryOptions {
  type?: DrawType | DrawType[];
  group?: string;
  visible?: boolean;
  locked?: boolean;
  editable?: boolean;
}

type DrawType =
  | "point"
  | "polyline"
  | "polygon"
  | "circle"
  | "rectangle"
  | "billboard"
  | "label"
  | "model"
  | "ellipse"
  | "wall"
  | "corridor"
  | "box"
  | "cylinder";
```

Exact naming may follow existing local conventions if a cleaner existing pattern is discovered.

## Verification

Run focused checks during implementation, then before stopping run:

```powershell
pnpm --filter @kairos3d/cesium typecheck
pnpm --filter @kairos3d/cesium test
pnpm verify
git diff --check
```

Run `pnpm verify:runtime` only if runtime-sensitive draw/edit/picking behavior changes and local Chrome is available. If it is skipped, record why.

## Constraints

- Keep `@kairos3d/cesium` framework-free.
- Do not introduce a UI component library or widget system in this goal.
- Do not serialize Cesium runtime objects, functions, callbacks, materials, or picked object identities.
- Do not change release, npm publishing, docs deployment, or examples deployment.
- Do not commit or push unless explicitly asked after implementation.
- Keep Cesium as a peer dependency.
- Preserve existing public APIs where practical; additive changes are preferred.

## Boundaries

Allowed writes:

- `packages/kairos3d-cesium/**`
- `apps/examples/**` only for minimal API compatibility or runtime verification harness updates.
- `apps/docs/**`, `README.md`, and package README files only for short API notes required by this M1 goal.
- `m1-draw-system-deepening.goal.md`
- `package.json` only if a script is clearly needed; avoid dependency changes unless unavoidable.

Forbidden:

- `references/**`
- Real user data, tokens, credentials, or external services.
- Deployment, publishing, remote configuration, or Git history rewriting.
- Mars3D/CityBase global mutation patterns, DOM widget systems, or legacy Cesium prototype monkey-patching.

## Iteration Policy

- Start by reading current draw/overlay managers and tests.
- Make one focused slice at a time: types and state, rendering, snapshots, batch APIs, import/export, tests.
- After each slice, run the smallest relevant test or typecheck.
- If an intended geometry type requires complex Cesium behavior or large custom algorithms, defer it and record the boundary rather than forcing a fragile implementation.
- If the same blocker repeats twice, reduce scope or pause with evidence.

## Stop When

- M1 public API targets are implemented or explicitly narrowed with evidence.
- Draw/overlay snapshots round-trip new fields and supported new types.
- Batch management and import/export have unit coverage.
- Required verification commands pass.
- Final report lists changes, verification, skipped runtime checks if any, and remaining M1/M2 risks.

## Pause If

- A public API breaking change appears necessary.
- A new dependency is required.
- A feature needs real proprietary data to validate correctly.
- Cesium 1.143 lacks a stable public API for a planned geometry type.
- Credentials, deployment, release, or push permissions are needed.

## Progress Log

- 2026-07-09: Created M1 draw system deepening run contract.
