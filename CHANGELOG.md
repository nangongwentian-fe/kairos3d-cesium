# Changelog

All notable changes to this workspace will be recorded here before a public release.

## Unreleased

- Added scene snapshot support for SDK-managed primitive overlays through `includePrimitives` and `restorePrimitives`.
- Added terrain triangulation helpers and precision options for surface area and volume-style estimates.
- Added scene-aware visibility occlusion mode on top of the existing terrain visibility path.
- Added clipping edit/update/cancel APIs for SDK-managed plane and polygon clipping results.
- Added examples-level pick/profile/snapshot helper adapters without moving UI into the SDK core.
- Added optional memory and localStorage-compatible snapshot persistence adapters.
- Added release preparation docs and a non-publishing `pnpm release:check` command.
