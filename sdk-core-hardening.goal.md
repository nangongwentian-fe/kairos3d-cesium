# SDK Core Hardening Goal

This file is the source of truth for a Codex `/goal` run focused on
`packages/kairos3d-cesium`.

## Outcome

Complete SDK Core Hardening for `packages/kairos3d-cesium`: public APIs,
lifecycles, snapshot roundtrips, layer runtime access, picking/selection/clipping
integration, terrain/visibility boundaries, and high-value primitive rendering
are stable enough for continued SDK expansion, with package-level verification
proving the result.

## Inspect First

- Read the current package structure under `packages/kairos3d-cesium/src`.
- Inspect `packages/kairos3d-cesium/package.json` exports and subpath entries.
- Inspect `packages/kairos3d-cesium/src/public-types.test.ts`.
- Inspect current tests for `analysis`, `draw`, `layers`, `picking`,
  `primitives`, `results`, `scene`, `height`, `style`, `performance`, and
  `persistence`.
- Run focused checks before broad edits when the failure surface is unclear.

## Work Items

1. Public API audit
   - Keep package exports, subpath exports, and public type tests aligned.
   - Avoid leaking obvious internal helpers through public entrypoints.
   - Preserve existing public API names unless a clear bug requires a change.

2. Lifecycle hardening
   - Make SDK-managed `destroy`, `remove`, `clear`, `stop`, and `cancel`
     operations safe to call repeatedly where the API exposes them.
   - Ensure event handlers, Cesium entities, primitives, temporary handles, and
     managed runtime collections are cleaned up by the owning manager.

3. Snapshot roundtrip hardening
   - Verify and harden `draw`, `analysis`, `terrain`, `clipping`,
     `primitives`, and `sceneState` save/load behavior.
   - Preserve stable fields such as `id`, `type`, positions, style, height
     semantics, timestamps, and render mode.
   - Keep old snapshots without newer optional fields loadable.

4. Layer runtime hardening
   - Strengthen default adapters around `getRuntimeObjects`,
     `ownsRuntimeObject`, `flyTo`, `toJSON`, and `load`.
   - Keep runtime objects out of serialized config.
   - Return clear errors for unsupported or invalid layer operations.

5. Picking, selection, and clipping integration
   - Keep layer ownership detection stable for SDK-created GeoJSON, glTF,
     imagery, terrain, and 3D Tiles runtime objects.
   - Keep `PickResult`, `SelectionState`, and clipping target resolution
     predictable for supported objects.
   - Unsupported runtime objects should fail with clear messages or produce
     unsupported results without corrupting selection/clipping state.

6. Terrain and visibility boundaries
   - Improve tests and defensive behavior for triangulated area/volume-style
     calculations and scene-aware visibility.
   - Keep terrain precision engineering-oriented, not survey-grade.
   - Do not require real remote terrain or 3D Tiles data for the package test
     suite.

7. Primitive rendering hardening
   - Expand primitive rendering only for high-value SDK-managed result types
     where it fits the current architecture.
   - Keep `renderMode` and primitive snapshot semantics data-only and
     recoverable.

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

Do not start a dev server. If browser runtime verification becomes necessary,
record it as a follow-up or pause condition.

## Constraints

- Keep SDK core framework-free.
- Keep snapshots data-only. Do not serialize Cesium runtime objects, entities,
  primitives, functions, materials, or picked feature identities.
- Prefer small, test-backed changes over broad rewrites.
- Match existing module boundaries and code style.
- Preserve Cesium `1.143.0` compatibility.
- Do not commit, push, publish, deploy, or change remotes unless the user asks.

## Boundaries

Allowed writes:

- `packages/kairos3d-cesium/**`

Allowed only for compatibility when package API changes break validation:

- `apps/examples/**`
- `apps/docs/**`
- `README.md`
- `package.json`
- `pnpm-lock.yaml`

Forbidden:

- Docs or examples display redesign.
- npm publishing, version release, or hosted deployment work.
- UI component libraries.
- Server persistence, account systems, token management, or backend protocols.
- Destructive git operations such as `git reset --hard` or `git checkout --`.

## Iteration Policy

- Work in focused slices matching the work-item order.
- Before each slice, inspect the relevant current implementation and tests.
- Prefer adding or tightening tests before behavior changes when a bug or gap is
  reproducible.
- Rerun the smallest relevant check after each slice.
- If the same blocker repeats three consecutive goal turns and no useful local
  progress remains, mark the goal blocked with evidence.

## Stop When

- All work items above have been addressed within the allowed boundaries.
- Final package-level verification passes.
- The final report lists changed areas, verification commands, and remaining
  risks or follow-ups.

## Pause If

- A public API breaking change needs user approval.
- Real 3D Tiles, model, or terrain data is required to prove correctness.
- Credentials, production access, deployment, publishing, commit, or push
  authority is needed.
- A required dependency or Cesium API behavior cannot be verified locally.

## Progress Log

Append concise notes here only when useful for handoff.
