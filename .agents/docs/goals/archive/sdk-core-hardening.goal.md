# 历史 Goal：SDK Core 强化

> 本合同已归档，不再是当前任务源。当前工作请读取 [项目现状](../../project-status.md)和[路线图](../../roadmap.md)。

## 目标

强化 SDK Core 的 manager 生命周期、图层状态、绘制/分析结果、拾取、样式、快照、性能和运行时验证，为后续基础里程碑提供稳定合同。

## 实施内容

- 补齐 manager 的 add/update/remove/clear/destroy 一致性。
- 强化 Layer state、group、order、opacity、runtime ownership 和配置恢复。
- 强化 Draw、Analysis 和 Result 的稳定 id、样式、属性和清理。
- 拾取和选择只操作 SDK 管理对象，并恢复原始状态。
- 快照保持 data-only，不序列化 Cesium runtime。
- Performance 只提供统计、预算和建议，不自动修改场景。
- 补公共导出、公共类型、单元测试和 Browser 验证。

## 约束

- Core 保持无框架，不引入 React/Vue。
- 不使用 Cesium 私有 API、全局注册或原型修改。
- 不处理发布、部署或凭据。
- 保留已有用户修改，不重写无关模块。

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

Core 强化项、测试和文档完成后停止。需要破坏公共 API、真实私有数据、凭据、发布权限或当前 Cesium API 无法验证时暂停。
