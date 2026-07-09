# Overlay Snapshot + Interaction Hardening Goal

This file is the source of truth for a Codex `/goal` run focused on
`packages/kairos3d-cesium`.

## Outcome

Harden the newly added entity overlay and expanded draw capabilities so they are
part of the same stable SDK core as existing results: overlays can be saved and
restored through scene snapshots, circle and rectangle can be created
interactively, circle and rectangle have minimal edit support, picking can
identify SDK-managed overlays, and model overlays/draw results can persist basic
orientation.

## Inspect First

- Read `packages/kairos3d-cesium/src/overlays`, `draw`, `scene`, `picking`,
  `style`, `height`, and current public type tests.
- Inspect `sceneState.toJSON/load` before changing snapshot shape.
- Inspect current draw tool and edit tool lifecycle before adding circle or
  rectangle interactions.
- Inspect picking normalization and layer ownership before adding overlay
  ownership.
- Treat existing unit tests as the behavioral contract unless this file
  explicitly requires a change.

## Work Items

1. Scene snapshot support for overlays
   - Add `includeOverlays?: boolean` to scene snapshot options.
   - Add `restoreOverlays?: boolean` and `clearOverlays?: boolean` to scene load
     options.
   - Add optional `overlays?: OverlaySnapshot[]` to `SceneSnapshot`.
   - `clearOverlays` defaults to `restoreOverlays`.
   - Old snapshots without `overlays` must still load.
   - Invalid overlay snapshots must fail before clearing existing overlays.

2. Circle and rectangle interactive draw tools
   - Add `draw.circle` and `draw.rectangle` tools to the shared tool registry.
   - Keep existing point, polyline, polygon behavior unchanged.
   - Circle: first click sets center, mouse move previews radius, right click or
     second click completes.
   - Rectangle: first click sets first corner, mouse move previews extent,
     right click or second click completes.
   - Esc/cancel removes only temporary preview entities and preserves completed
     results.

3. Minimal circle and rectangle edit support
   - Extend internal `draw.edit` only where needed for circle and rectangle.
   - Circle: drag center or edge handle, preserving `DrawResult.id`.
   - Rectangle: drag corner handles, preserving `DrawResult.id`.
   - `stopEdit` keeps changes; `cancelEdit` restores the previous positions and
     data.
   - Temporary handles must be removed on stop, cancel, remove, clear, and
     destroy.

4. Picking and selection overlay ownership
   - Extend `PickResult` with optional SDK ownership fields for overlays.
   - If a picked Entity belongs to `map.overlays`, return overlay attribution
     such as `source: "overlay"` and `overlayId`.
   - Preserve existing layer attribution behavior.
   - Do not introduce a popup or UI system.

5. Model orientation support
   - Add JSON-safe model orientation fields to draw/overlay data, such as
     `heading`, `pitch`, and `roll` in radians.
   - Apply orientation when creating or updating model entities.
   - Preserve orientation in draw and overlay snapshots.
   - Do not implement model drag-rotate UI in this goal.

6. Public API and verification
   - Update public type tests and package exports if needed.
   - Add focused unit tests for scene snapshot overlays, circle/rectangle tools,
     circle/rectangle edit helpers, overlay picking attribution, and model
     orientation snapshots.
   - Keep SDK core framework-free.

## Verification

Run the smallest relevant check after each meaningful change. Final
verification must include:

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
- Do not serialize Cesium `Entity`, `Primitive`, `Material`, functions,
  picked feature identities, or other runtime objects.
- Preserve existing public API names unless a clear bug requires a change.
- Keep circle and rectangle edit support minimal and test-backed.
- Preserve Cesium `1.143.0` compatibility.
- Do not commit, push, publish, deploy, or change remotes unless the user asks.

## Boundaries

Allowed writes:

- `packages/kairos3d-cesium/**`
- `overlay-snapshot-interaction-hardening.goal.md`

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
- CityBaseX effect, water, video, or particle system migration.
- Military plotting algorithms.
- Server persistence, account systems, token management, or backend protocols.
- Destructive git operations such as `git reset --hard` or `git checkout --`.

## Iteration Policy

- Work in focused slices matching the work-item order.
- Before each slice, inspect the relevant current implementation and tests.
- Add or tighten tests before behavior changes when practical.
- Rerun the smallest relevant check after meaningful changes.
- If the same blocker repeats three consecutive goal turns and no useful local
  progress remains, mark the goal blocked with evidence.

## Stop When

- All work items in the outcome are implemented within the allowed boundaries.
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
