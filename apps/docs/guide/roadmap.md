# Roadmap

This page records the current development order after the first complete SDK version.

## Summary

| Priority | Work | Why |
| --- | --- | --- |
| P0 | CI and verification guardrails | Keep the pushed first version reproducible before deeper changes. |
| P0 | Primitive renderer integration | First stage complete for draw polyline/polygon and distance/area measurement; continue expanding only where it pays off. |
| P0 | Runtime snapshot expansion | Complete: Primitive overlays participate in scene snapshots when requested. |
| P1 | Analysis precision upgrades | Complete first pass: terrain triangulation and scene-aware visibility are available. |
| P1 | Interactive clipping and editing polish | Complete first pass: clipping results have programmatic edit/update/cancel lifecycle. |
| P2 | UI and persistence adapters | Complete first pass: examples helper adapters and optional snapshot storage adapters exist. |
| P3 | Release, npm, and hosted deployments | Prepared, but still intentionally lower priority than SDK foundations. |

## Current Decision

The next phase should prioritize SDK capability foundations over package release and hosted deployment work.

| Lowered item | Current priority | Notes |
| --- | --- | --- |
| Release/version management | P3 | Do not focus on `CHANGELOG`, tags, or release automation yet. |
| npm publishing preparation | P3 | Package metadata and registry decisions can wait. |
| Docs site deployment | P3 | VitePress remains local-build verified for now. |
| Examples site deployment | P3 | Examples remain local-build verified for now. |

## Next Work Queue

| Order | Milestone | Scope |
| --- | --- | --- |
| 1 | CI verification | Add GitHub Actions for `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. |
| 2 | Primitive renderer backend | First stage complete: draw polyline/polygon and distance/area measurement support opt-in `renderMode: "primitive"`. |
| 3 | Primitive scene snapshots | Complete: `includePrimitives` / `restorePrimitives` keep primitive overlays data-only. |
| 4 | Terrain precision pass | Complete first pass: sampled-cell remains default and triangulated area/volume modes are available. |
| 5 | Visibility occlusion pass | Complete first pass: `occlusionMode` can use terrain, scene, or both. |
| 6 | Clipping interaction pass | Complete first pass: edit/update/cancel APIs keep result ids stable. |
| 7 | Optional UI adapters | Complete first pass: examples consume pick/profile/snapshot helper adapters outside SDK core. |
| 8 | Persistence adapters | Complete first pass: memory and localStorage-compatible snapshot storage adapters are available. |
| 9 | Release/npm/deploy hardening | Remaining: only do full publish/deploy work when release priority is raised. |

## Guardrails

| Rule | Meaning |
| --- | --- |
| Keep SDK core framework-free | React/Vue UI belongs in examples or a later optional package. |
| Keep snapshots data-only | Do not serialize Cesium runtime objects, functions, materials, or picked feature identities. |
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
