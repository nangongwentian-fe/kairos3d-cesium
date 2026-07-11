# 历史 Goal：Draw / Overlay 扩展

> 本合同已归档，不再是当前任务源。当前工作请读取 [项目路线图](../../roadmap.md)。

## 目标

在保持现有 `KairosMap`、工具生命周期和数据快照合同的前提下，扩展绘制与覆盖物能力，使 SDK 能管理更多 Cesium 图形类型、样式、属性和批量操作。

## 实施内容

- 扩展 Draw 和 Overlay 的类型、配置和公共导出。
- 保持统一的 add/update/remove/clear 和事件语义。
- 新增 JSON-safe 属性、样式、分组和批量操作。
- 导入导出与快照不包含 Cesium runtime object、函数或回调。
- 示例只验证公共 API，不把 Widget 或业务 UI 写入 Core。
- 从 Mars3D/CityBaseX 迁移算法时使用当前 Cesium 公共 API 重写。

## 约束

- 不引入全局对象、Cesium prototype 修改或旧式 Widget 系统。
- 不更改包管理器、Cesium 版本和 monorepo 边界。
- 不自动启动开发服务器。
- 不发布、部署、提交或 push，除非用户另行授权。
- 不修改 `references/`。

## 允许范围

- `packages/kairos3d-cesium/src/**`
- `apps/examples/src/**`
- 用户 API 文档和包 README
- 与实现直接相关的测试和配置

## 验证

```powershell
pnpm --filter @kairos3d/cesium typecheck
pnpm --filter @kairos3d/cesium test
pnpm --filter @kairos3d/cesium build
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

## 停止与暂停条件

完成目标能力、测试和文档，并列出剩余风险后停止。出现公共 API 破坏、需要私有数据或凭据、需要发布权限，或当前 Cesium 公共 API 无法支持时暂停。
