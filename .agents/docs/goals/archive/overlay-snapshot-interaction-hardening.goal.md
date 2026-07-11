# 历史 Goal：Overlay 快照与交互强化

> 本合同已归档，不再是当前任务源。当前工作请读取 [项目路线图](../../roadmap.md)。

## 目标

强化 Overlay 的快照、交互、选择和生命周期，使覆盖物能够稳定保存、恢复、拾取、显隐、锁定和清理。

## 实施内容

- 稳定 Overlay 数据模型、类型联合和公共导出。
- 扩展 `toJSON/load`，保持数据描述与 Cesium runtime 分离。
- 接入 picking/selection ownership 和可恢复高亮。
- 统一 show、locked、editable、group、style、properties。
- 失败、取消、remove、clear 和 destroy 不遗留 Entity 或事件监听。
- 补类型测试、manager 测试和 snapshot roundtrip 测试。

## 约束

- 不把 Popup、属性面板或框架组件写入 SDK Core。
- 不序列化 Entity、Primitive、Material、CallbackProperty 或函数。
- 不修改用户手动创建的 Cesium 对象。
- 不自动启动 dev server，不发布、不部署、不 push。

## 允许范围

- `packages/kairos3d-cesium/src/**`
- `apps/examples/src/**`
- 用户 API 文档和包 README
- 直接相关的测试和配置

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

快照、交互、生命周期和验证完成后停止。需要公共 API 破坏、真实私有数据、凭据、发布权限或无法验证的 Cesium 行为时暂停。
