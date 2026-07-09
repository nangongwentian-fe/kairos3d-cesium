# Release Preparation

Use this page when the project priority changes from SDK foundation work to packaging, npm publishing, or hosted documentation.

## Summary

| Item | Current state |
| --- | --- |
| Versioning | Deferred; package versions remain `0.0.0` until release priority is raised. |
| npm publishing | Prepared with a dry-run command, not published automatically. |
| Docs hosting | Build-verified locally; hosted deployment is not automatic yet. |
| Examples hosting | Build-verified locally; hosted deployment needs base-path decisions first. |

## Common Path

Run the full non-publishing release check from the workspace root:

```powershell
pnpm release:check
```

This runs type checks, tests, lint, build, and an SDK package dry run.

## Before Publishing

| Check | Rule |
| --- | --- |
| Version | Set root and SDK package versions intentionally. |
| Changelog | Move relevant `Unreleased` entries into the target version section. |
| Package metadata | Recheck `exports`, `files`, `peerDependencies`, license, and README. |
| Fresh install | Verify from a fresh clone before any registry publish. |
| Docs/examples base path | Decide whether hosted assets live at root, `/docs`, `/examples`, or a GitHub Pages repository subpath. |

## Boundaries

Release, npm publishing, docs deployment, and examples deployment remain lower priority than SDK foundations. Do not add automatic publish or hosted deploy workflows until the target registry, version policy, and hosting base paths are decided.
