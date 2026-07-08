# Roadmap

This page records the current development order after the first complete SDK version.

## Summary

| Priority | Work | Why |
| --- | --- | --- |
| P0 | CI and verification guardrails | Keep the pushed first version reproducible before deeper changes. |
| P0 | Primitive renderer integration | First stage complete for draw polyline/polygon and distance/area measurement; continue expanding only where it pays off. |
| P0 | Runtime snapshot expansion | Make Primitive overlays participate in scene snapshots when requested. |
| P1 | Analysis precision upgrades | Improve terrain area/volume and visibility correctness before adding more feature types. |
| P1 | Interactive clipping and editing polish | Make clipping and existing result workflows more useful in real projects. |
| P2 | UI and persistence adapters | Keep SDK core framework-free; build optional app-layer helpers later. |
| P3 | Release, npm, and hosted deployments | Versioning, npm publishing, docs deployment, and examples deployment are intentionally lower priority for now. |

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
| 3 | Primitive scene snapshots | Include `map.primitives` in scene snapshots behind an explicit option, while keeping snapshots data-only. |
| 4 | Terrain precision pass | Implement real terrain-surface area triangulation and improve volume/flood/excavation precision modes. |
| 5 | Visibility occlusion pass | Add 3D Tiles/model-aware visibility checks where Cesium runtime APIs can support them. |
| 6 | Clipping interaction pass | Add plane drag handles, clipping result editing, and clearer target lifecycle controls. |
| 7 | Optional UI adapters | Add popup/property/profile chart helpers outside the SDK core, likely as examples first or a separate UI package later. |
| 8 | Persistence adapters | Add optional snapshot storage adapters without making `localStorage` or server persistence part of SDK core. |

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
