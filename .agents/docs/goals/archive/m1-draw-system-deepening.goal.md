# 历史 Goal：M1 Draw 系统深化

> 本合同已归档，不再是当前任务源。当前工作请读取 [项目路线图](../../roadmap.md)。

## 目标

深化 Draw 与 Overlay 系统，补齐常用图形类型、批量管理、属性、样式、导入导出和快照 roundtrip，使后续 Primitive、Widget 和业务功能可以复用稳定合同。

## 目标范围

- 扩展点、线、面之外的常用实体图形和标绘类型。
- 稳定 show、locked、editable、group、properties、style 和 timestamps。
- 提供分组、批量更新、删除和查询能力。
- 支持 GeoJSON 或 SDK 数据格式导入导出。
- 新字段和支持类型参与 Draw/Overlay snapshot roundtrip。
- 保持 DrawResult、Overlay 和事件的向后兼容。

## 公共 API 目标

- 单对象 add/get/update/remove。
- `setShow`、`setLocked`、`setEditable`、`setStyle`、`setProperties`。
- 分组查询、显隐、样式和清理。
- `toJSON/load`、导入导出及稳定错误。
- 所有序列化结果保持 JSON-safe。

## 约束

- 不使用 Cesium 私有 API、全局注册或 DOM Widget。
- 不引入新框架或 UI 组件库。
- Entity 仍是兼容渲染载体；Primitive 优化单独实施。
- 不修改外部参考源码，不自动启动 dev server。

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

M1 公共 API、快照、批量操作、导入导出和测试完成后停止。需要破坏公共 API、新依赖、私有数据、发布权限，或 Cesium 1.143 没有稳定公开能力时暂停。

## 历史记录

- 2026-07-09：创建 M1 Draw 系统深化合同。
