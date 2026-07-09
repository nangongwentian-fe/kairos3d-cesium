# Kairos3DCesium Runtime Verification Goal

## Outcome

完成一次真实 Cesium 浏览器运行验证，证明 `@kairos3d/cesium` 当前 SDK Core 的关键运行时能力可用：圆和矩形绘制/编辑、overlay 拾取、model 姿态、场景快照恢复，并用截图、控制台/网络摘要、自动化结果和构建命令证明。

## Scope

本 goal 只做运行时验证所需的最小代码和脚本。

允许验证的能力：

- Cesium Viewer 能加载，canvas 非空。
- Cesium 静态资源无 `Workers`、`Assets`、`Widgets`、`ThirdParty` 404。
- 圆绘制得到 `DrawResult.type === "circle"`，半径大于 `0`。
- 矩形绘制得到 `DrawResult.type === "rectangle"`，位置结构稳定。
- 圆和矩形编辑后 `id` 保持稳定，确认编辑会保留修改，取消编辑会恢复。
- overlay 拾取返回 `source === "overlay"`，包含 `overlayId` 和 `overlayType`。
- model 创建带 `heading/pitch/roll`，entity orientation 存在，快照保留姿态字段。
- 场景快照支持 `includeResults/includeOverlays/includePrimitives`，清空后可恢复 counts、camera、layers、bookmarks。

不处理：

- docs/examples 展示形式重做。
- npm 发布、版本发布、部署配置。
- 新 SDK 功能扩展，除非真实运行暴露已有 API bug。

## Inspect First

- `package.json`
- `pnpm-workspace.yaml`
- `Kairos3DCesium/apps/examples/package.json`
- `Kairos3DCesium/apps/examples/vite.config.ts`
- `Kairos3DCesium/apps/examples/src/**`
- `Kairos3DCesium/packages/kairos3d-cesium/src/draw/**`
- `Kairos3DCesium/packages/kairos3d-cesium/src/overlays/**`
- `Kairos3DCesium/packages/kairos3d-cesium/src/picking/**`
- `Kairos3DCesium/packages/kairos3d-cesium/src/scene/**`
- `Kairos3DCesium/packages/kairos3d-cesium/src/primitives/**`

## Work Items

1. 检查现有 examples 启动方式和 Cesium 静态资源配置。
2. 增加最小 runtime verification harness，优先放在 `apps/examples`，通过 `window.__kairosRuntimeVerify` 暴露稳定函数，不改变主要展示形态。
3. 如果需要自动化脚本，新增轻量验证脚本；优先使用 Chrome DevTools MCP 或 in-app browser，无法使用时再用 Playwright/headless fallback，并记录原因。
4. 启动一次短生命周期 dev server，使用可用端口，完成验证后关闭。
5. 运行浏览器验证并收集证据：
   - 自动化 JSON 结果。
   - 控制台错误摘要。
   - 网络 404 摘要。
   - canvas 非空截图或像素检测。
6. 如真实运行暴露 SDK bug，只在 `packages/kairos3d-cesium` 做最小修复，并补充相关测试。
7. 跑最终非 server 验证命令。

## Public Runtime Harness Contract

如果新增 harness，应尽量提供这些函数：

```ts
interface KairosRuntimeVerify {
  getState(): unknown;
  runDrawCircle(): Promise<unknown>;
  runDrawRectangle(): Promise<unknown>;
  editCircle(): Promise<unknown>;
  editRectangle(): Promise<unknown>;
  createOverlays(): Promise<unknown>;
  pickOverlayAt(position?: { x: number; y: number }): Promise<unknown>;
  createModelWithOrientation(): Promise<unknown>;
  snapshotRoundtrip(): Promise<unknown>;
  runAll(): Promise<unknown>;
}
```

函数名可以根据现有代码略调，但必须在最终结果里说明实际入口。

## Verification

浏览器验证必须覆盖：

- Viewer loaded。
- Canvas nonblank。
- Console uncaught error count is `0`，或逐条解释非阻断错误。
- Cesium asset 404 count is `0`。
- `runDrawCircle()` 通过。
- `runDrawRectangle()` 通过。
- `editCircle()` 通过。
- `editRectangle()` 通过。
- `createOverlays()` 和 overlay picking 通过。
- `createModelWithOrientation()` 通过。
- `snapshotRoundtrip()` 通过。

最终命令必须运行：

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

如果只修改 SDK 包且 workspace 验证过慢，可先跑包级命令；但停止前必须跑上面的 workspace 级命令。

## Constraints

- 保持 SDK core framework-free。
- 不把 Cesium runtime object、Entity、Primitive、Material、函数、picked feature 身份序列化进快照。
- 不引入 UI 组件库。
- 不依赖外部 token。
- 真实浏览器验证用短生命周期 dev server；验证完成后必须停止。
- 不提交、不 push，除非用户后续明确要求。

## Boundaries

Allowed writes:

- `Kairos3DCesium/runtime-verification.goal.md`
- `Kairos3DCesium/apps/examples/**`，仅限 runtime verification harness、脚本或最小兼容修复。
- `Kairos3DCesium/packages/kairos3d-cesium/**`，仅限真实运行暴露 SDK bug 时的最小修复和测试。
- `Kairos3DCesium/runtime-verification-artifacts/**`，仅限本次浏览器验证证据。
- `Kairos3DCesium/.gitignore`，仅限忽略本次验证产生的临时文件和 artifact。
- `Kairos3DCesium/package.json`、`Kairos3DCesium/pnpm-lock.yaml`，仅限验证脚本确实需要且现有依赖无法完成时。

Forbidden:

- 重做 examples 展示 UI。
- 重做 docs 文档站。
- 发布、部署、改远程仓库配置。
- 自动提交或 push。
- 写入真实用户持久化存储作为验证结果。
- 引入服务端存储、账号体系、token 管理。

## Iteration Policy

- 先读代码和配置，再写 harness。
- 每次改动后跑最小相关检查。
- 浏览器失败时先看 console/network，再改代码。
- 同一错误连续出现两次后换证据来源或缩小复现。
- dev server 必须记录 PID，结束时停止进程。

## Stop When

- 浏览器验证项目全部通过，或非阻断项有清楚解释。
- 最终 workspace 验证命令全部通过。
- dev server 已停止。
- 最终汇报列出：改动文件、验证命令、浏览器证据、剩余风险。

## Pause If

- 需要用户提供真实 3D Tiles、terrain、model 私有数据。
- 需要改变公开 API 才能继续。
- 需要安装大型新依赖或联网拉取非 npm 静态数据。
- 需要发布、部署、提交、push 权限。
- 浏览器工具不可用，且 headless fallback 也无法验证 canvas 或 Cesium runtime。

## Progress Log

- 2026-07-09: Created goal contract for real browser runtime verification.
