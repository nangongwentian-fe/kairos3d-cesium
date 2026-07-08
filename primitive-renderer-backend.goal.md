# Primitive Renderer Backend Goal

## Outcome

Complete the first Primitive renderer backend stage for `@kairos3d/cesium`: SDK-managed draw polyline/polygon and measure distance/area results can opt into Primitive-backed rendering while the default Entity behavior and public result contracts remain stable.

## Inspect First

- `apps/docs/guide/roadmap.md`
- `packages/kairos3d-cesium/src/primitives/*`
- `packages/kairos3d-cesium/src/draw/*`
- `packages/kairos3d-cesium/src/analysis/measure-*`
- `packages/kairos3d-cesium/src/performance/*`
- `apps/examples/src/App.tsx`
- `README.md`, `packages/kairos3d-cesium/README.md`, and docs pages that describe rendering boundaries.

## Required Scope

- Add public render mode types and options, with at least `"entity"` and `"primitive"`.
- Keep `"entity"` as the default render mode.
- Add opt-in Primitive-backed rendering for:
  - draw polyline
  - draw polygon outline/fill where feasible in this first stage
  - measure distance
  - measure area outline/fill where feasible in this first stage
- Preserve stable public result structures:
  - `DrawResult`
  - `MeasureResult`
  - existing ids, positions, timestamps, entities arrays, styles, height options, snapshots, and load behavior.
- Ensure `remove`, `clear`, `destroy`, `setStyle`, `toJSON`, and `load` clean up or restore SDK-managed Primitive runtime objects correctly.
- Update `performance.recommendPrimitiveCandidates()` or related stats so Primitive-backed results are not reported as if they are still Entity-only candidates.
- Add tests for render-mode defaults, Primitive result lifecycle cleanup, style updates, snapshots, and performance candidate behavior.
- Update examples so users can switch or trigger Entity vs Primitive draw/measure paths without adding a UI component library.
- Update docs and README to describe the current Primitive backend behavior and boundaries.

## Constraints

- Do not replace Entity rendering globally.
- Do not change Cesium version or package manager.
- Do not serialize Cesium Primitive, PrimitiveCollection, Material, callback, function, or other runtime object identities.
- Do not add npm release, package publishing, docs hosting, or examples hosting work in this goal.
- Do not add framework UI packages.
- Do not auto-start a dev server.
- Keep SDK core framework-free and keep Cesium as a peer dependency.
- Prefer small local abstractions that match the existing managers over broad rewrites.

## Boundaries

Allowed writes:

- `packages/kairos3d-cesium/src/**`
- `apps/examples/src/**`
- `apps/docs/**`
- `README.md`
- `packages/kairos3d-cesium/README.md`
- Project config or test files only when required by the implementation.

Forbidden writes:

- `node_modules/**`
- `dist/**`
- `.vitepress/dist/**`
- release, npm publishing, deployment, or credential files.
- unrelated repositories under `E:\Code\Project`.

## Verification

Run from `E:\Code\Project\CesiumSDK\Kairos3DCesium`:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

After verification, commit and push the completed change to `origin/main`.

## Iteration Policy

- Work in focused slices: inspect, implement one render path, test it, then expand.
- Prefer unit tests around managers and lifecycle before broad example changes.
- Rerun the smallest relevant check after each meaningful change.
- If a Cesium Primitive API behaves differently than expected, inspect current Cesium type declarations before guessing.
- If two attempts fail for the same reason, reduce scope to the smallest stable Primitive path and document the boundary.

## Stop When

- Primitive render mode is implemented for the required first-stage draw and measure paths.
- Default Entity behavior remains intact.
- Tests and docs cover the new API and boundaries.
- All verification commands pass.
- The change is committed and pushed to `origin/main`.

## Pause If

- The implementation requires credentials, paid terrain/tiles services, or remote deployment access.
- A public API breaking change appears necessary.
- Cesium 1.143 lacks a required Primitive capability and no safe fallback exists.
- Repeated validation failures indicate the goal needs a narrower scope.

## Progress Log

- Created to run the Roadmap P0 Primitive renderer backend stage.
