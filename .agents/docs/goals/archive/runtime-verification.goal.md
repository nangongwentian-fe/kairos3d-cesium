# 历史 Goal：真实 Cesium 运行时验证

> 本合同由原乱码文件重建为 UTF-8 中文，已归档，不再是当前任务源。当前验证流程见 [开发流程](../../development-workflow.md)。

## 目标

建立可重复的真实浏览器运行时验证，覆盖 Cesium Viewer、静态资源、主要 SDK manager、交互工具、快照和清理，而不是只依赖单元测试和构建成功。

## 验证范围

- 使用真实 Cesium Viewer 和本地静态资源。
- 验证示例应用能够创建、操作和销毁 `KairosMap`。
- 覆盖图层、绘制、分析、拾取、快照和 Primitive 等核心路径。
- 检查 Browser console、network 404、shader compile error 和资源泄漏。
- 保存必要截图或日志到 `runtime-verification-artifacts/`。
- 结束时关闭 Browser 页面和临时 Vite 服务。

## Runtime Harness 合同

- 使用本地数据或 data URI，避免依赖外网和 token。
- 需要 Ion 时由环境变量提供，不能硬编码凭据。
- 临时服务使用独立端口并记录 PID。
- Browser 失败时先检查 console/network，再修改实现。
- 同一错误连续出现两次后缩小复现或更换证据来源。

## 允许范围

- `apps/examples/**` 中与 runtime harness 直接相关的文件。
- `packages/kairos3d-cesium/**` 中由真实运行时暴露出的最小修复和测试。
- `runtime-verification-artifacts/**`。
- `.gitignore` 和必要验证脚本。

## 禁止范围

- 重做 examples UI 或 docs 站点。
- 发布、部署、修改远程配置、自动提交或 push。
- 将真实用户持久化数据作为验证结果。
- 引入服务端存储、账号或 token 管理。

## 验证

```powershell
pnpm verify
pnpm verify:runtime
git diff --check
```

## 停止与暂停条件

运行时场景通过、工作区检查通过、临时服务已关闭并记录证据后停止。需要私有 3D Tiles/terrain/model、公共 API 破坏、大型新依赖、发布权限，或 Browser 与 headless fallback 均不可用时暂停。

## 历史记录

- 2026-07-09：创建真实浏览器运行时验证合同。
