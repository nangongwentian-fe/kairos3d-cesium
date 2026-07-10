# Roadmap

This page records the current development order after the first complete SDK version.

## Summary

| Priority | Work | Why |
| --- | --- | --- |
| P0 | CI and verification guardrails | Complete first pass: GitHub Actions and local verification scripts keep the pushed first version reproducible before deeper changes. |
| P0 | Primitive renderer integration | First stage complete for draw polyline/polygon and distance/area measurement; continue expanding only where it pays off. |
| P0 | Runtime snapshot expansion | Complete: Primitive overlays participate in scene snapshots when requested. |
| P0 | Materials and effects core | M8 complete: public-API materials and nine managed geometry, particle, and weather effects are available. |
| P0 | Operations and loading core | M9 complete: cancellation, progress, errors, retention, and late-commit protection share one runtime contract. |
| P0 | Transactional scene recovery | M10 complete: v1 validation, detached prepare, commit, rollback, and transaction diagnostics are available. |
| P1 | Analysis precision upgrades | Complete first pass: terrain triangulation and scene-aware visibility are available. |
| P1 | Interactive clipping and editing polish | Complete first pass: clipping results have programmatic edit/update/cancel lifecycle. |
| P2 | UI and persistence adapters | Complete first pass: examples helper adapters and optional snapshot storage adapters exist. |
| P3 | Release, npm, and hosted deployments | Prepared, but still intentionally lower priority than SDK foundations. |

## Current Decision

M10 keeps `SceneSnapshot` at `version: 1` and makes transactional recovery the default. Version migration is intentionally absent: it should be designed only when a real incompatible persisted schema exists.

| Lowered item | Current priority | Notes |
| --- | --- | --- |
| Release/version management | P3 | Do not focus on `CHANGELOG`, tags, or release automation yet. |
| npm publishing preparation | P3 | Package metadata and registry decisions can wait. |
| Docs site deployment | P3 | VitePress remains local-build verified for now. |
| Examples site deployment | P3 | Examples remain local-build verified for now. |

## Next Work Queue

| Order | Milestone | Scope |
| --- | --- | --- |
| 1 | CI verification | Complete first pass: GitHub Actions runs `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, and `git diff --check`; local browser smoke is available through `pnpm verify:runtime`. |
| 2 | Primitive renderer backend | First stage complete: draw polyline/polygon and distance/area measurement support opt-in `renderMode: "primitive"`. |
| 3 | Primitive scene snapshots | Complete: `includePrimitives` / `restorePrimitives` keep primitive overlays data-only. |
| 4 | Terrain precision pass | Complete first pass: sampled-cell remains default and triangulated area/volume modes are available. |
| 5 | Visibility occlusion pass | Complete first pass: `occlusionMode` can use terrain, scene, or both. |
| 6 | Clipping interaction pass | Complete first pass: edit/update/cancel APIs keep result ids stable. |
| 7 | Optional UI adapters | Complete first pass: examples consume pick/profile/snapshot helper adapters outside SDK core. |
| 8 | Persistence adapters | Complete first pass: memory and localStorage-compatible snapshot storage adapters are available. |
| 9 | Materials and effects core | M8 complete: Entity/Primitive material factories, nine effect types, data-only effect snapshots, and effect performance counters are available. |
| 10 | Operations and loading core | M9 complete: async layers, effects, scene recovery, visibility, profile, and terrain work share cancellation and progress contracts. |
| 11 | Transactional scene recovery | M10 complete: strong staging and rollback for supported SDK-managed runtime, with progressive mode retained for compatibility. |
| 12 | Release/npm/deploy hardening | Remaining: only do full publish/deploy work when release priority is raised. |

## Guardrails

| Rule | Meaning |
| --- | --- |
| Keep SDK core framework-free | React/Vue UI belongs in examples or a later optional package. |
| Keep snapshots data-only | Serialize material/effect descriptors, never Cesium runtime objects, live materials, functions, animation phases, or picked feature identities. |
| Version only for real schema changes | Keep `SceneSnapshot.version` at `1`; do not create speculative migrations before an incompatible persisted schema exists. |
| Prefer foundations first | Improve renderer, snapshot, layer, result, and interaction contracts before adding unrelated analysis feature types. |
| Keep deployment deferred | Do not spend the next phase on npm release, docs hosting, or examples hosting unless this priority changes again. |

## Verification

Each milestone should keep the normal non-server validation green:

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

Do not start a dev server as part of validation unless the task explicitly asks for browser runtime verification.
