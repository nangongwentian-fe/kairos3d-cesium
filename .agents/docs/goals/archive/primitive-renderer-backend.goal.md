# 历史 Goal：Primitive Renderer 第一阶段

> 本合同已归档，不再是当前任务源。第二阶段设计见 [M12 Primitive Renderer V2](../../milestones/m12-primitive-renderer-v2.md)。

## 目标

完成 `@kairos3d/cesium` Primitive renderer 第一阶段：Draw polyline/polygon 和 Measure distance/area 可以 opt-in Primitive 渲染，同时保持 Entity 默认和公共结果合同稳定。

## 必须实现

- 公共 `renderMode` 至少支持 `entity` 和 `primitive`。
- `entity` 保持默认。
- Draw polyline/polygon 支持 Primitive 路径。
- Measure distance/area 支持 Primitive 路径。
- DrawResult、MeasureResult、id、positions、timestamps、style、height 和 snapshot 结构保持稳定。
- remove、clear、destroy、setStyle、toJSON 和 load 正确清理或恢复 runtime。
- Primitive-backed 结果不再被 performance candidate 当作 Entity-only 结果。

## 约束

- 不全局替换 Entity renderer。
- 不序列化 Primitive、Collection、Material、callback 或 runtime identity。
- 不新增 UI 框架，不处理发布和部署。
- Core 保持无框架，Cesium 保持 peer dependency。

## 验证

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

## 停止与暂停条件

要求的 Draw/Measure Primitive 路径、默认 Entity 兼容、测试和文档完成后停止。需要凭据、付费数据、公共 API 破坏或 Cesium 1.143 缺少安全能力时暂停。

## 历史记录

- 创建用于执行 Roadmap 中 Primitive renderer backend 第一阶段。
