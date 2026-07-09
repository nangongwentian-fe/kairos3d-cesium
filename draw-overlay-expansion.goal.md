# Draw / Overlay Expansion Goal

This file is the source of truth for a Codex `/goal` run focused on
`packages/kairos3d-cesium`.

## Outcome

Expand `packages/kairos3d-cesium` draw and SDK-managed overlay capabilities:
add the second batch of draw result types, add an entity overlay manager when
needed, keep all new runtime results removable and snapshot-restorable, and
prove the package with non-server verification.

## Inspect First

- Read `packages/kairos3d-cesium/src/draw`, `style`, `scene`, `core`,
  `primitives`, and current public type tests.
- Inspect current package exports in `packages/kairos3d-cesium/package.json`
  and `packages/kairos3d-cesium/vite.config.ts`.
- Inspect current tests before adding new behavior.
- Treat Mars3D `draw` and CityBaseX `Model` only as capability references, not
  API compatibility targets.

## Work Items

1. Expand draw types
   - Extend `DrawType` with `circle`, `rectangle`, `billboard`, `label`, and
     `model`.
   - Add programmatic creation methods on `map.draw` for these types.
   - Keep existing point, polyline, polygon behavior compatible.
   - Keep new results under the same `DrawResult` lifecycle and snapshot
     contract.

2. Add or extend overlay management
   - Add an SDK-managed entity overlay module if the existing primitive overlay
     manager is not a good fit.
   - Support point, polyline, polygon, circle, rectangle, billboard, label, and
     model overlays.
   - Provide `add`, type-specific add helpers, `update`, `setStyle`, `get`,
     `list`, `remove`, `clear`, `toJSON`, and `load`.
   - Add subpath exports only if a new overlay module is created.

3. Programmatic update and lifecycle
   - Support programmatic updates for newly added draw and overlay types.
   - Clean SDK-created entities and runtime objects on remove, clear, destroy,
     and duplicate id replacement.
   - Keep line and polygon edit behavior unchanged unless a direct compatibility
     fix is required.

4. Snapshot and style
   - Keep all new snapshots data-only.
   - Do not serialize Cesium `Entity`, `Primitive`, `Material`, functions, or
     runtime object identities.
   - Add minimal billboard, label, and model style/config types only where
     needed for stable creation, update, and restore.
   - Make invalid snapshots fail before clearing existing managed results.

5. Public API and exports
   - Update public type tests.
   - Keep package exports, Vite library entries, and public entrypoints aligned.
   - Do not expose internal helpers unless they are intentionally part of the
     SDK API.

## Verification

Run the smallest relevant check after each meaningful change. Final verification
must include:

```powershell
pnpm --filter @kairos3d/cesium typecheck
pnpm --filter @kairos3d/cesium test
pnpm --filter @kairos3d/cesium build
git diff --check
```

If package API changes break workspace consumers, run the broader checks after
the minimum compatibility fix:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Do not start a dev server.

## Constraints

- Keep SDK core framework-free.
- Keep snapshots data-only.
- Preserve existing public API names unless a clear bug requires a change.
- Prefer small, test-backed changes over broad rewrites.
- Match existing module boundaries and code style.
- Preserve Cesium `1.143.0` compatibility.
- Do not commit, push, publish, deploy, or change remotes unless the user asks.

## Boundaries

Allowed writes:

- `packages/kairos3d-cesium/**`
- `draw-overlay-expansion.goal.md`

Allowed only for compatibility when package API changes break validation:

- `apps/examples/**`
- `apps/docs/**`
- `README.md`
- `package.json`
- `pnpm-lock.yaml`

Forbidden:

- Docs or examples display redesign.
- npm publishing, version release, or hosted deployment work.
- Mars3D widget, attribute panel, tooltip, or DOM UI systems.
- Military plotting algorithms.
- CityBaseX effect, water, video, or particle system migration.
- Server persistence, account systems, token management, or backend protocols.
- Destructive git operations such as `git reset --hard` or `git checkout --`.

## Iteration Policy

- Work in focused slices matching the work-item order.
- Before each slice, inspect the relevant current implementation and tests.
- Add or tighten tests before behavior changes when practical.
- Rerun the smallest relevant check after each slice.
- If the same blocker repeats three consecutive goal turns and no useful local
  progress remains, mark the goal blocked with evidence.

## Stop When

- New draw and overlay capabilities in the outcome are implemented within the
  allowed boundaries.
- Final package-level verification passes.
- The final report lists changed areas, verification commands, and remaining
  risks or follow-ups.

## Pause If

- A public API breaking change needs user approval.
- Real image, model, terrain, or 3D Tiles assets are required to prove runtime
  correctness.
- Credentials, production access, deployment, publishing, commit, or push
  authority is needed.
- A required dependency or Cesium API behavior cannot be verified locally.

## Progress Log

Append concise notes here only when useful for handoff.
