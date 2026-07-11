# 项目现状

本文记录当前 SDK 可以确认的能力、工程成熟度和明确边界。百分比是基于 API 广度、生命周期、快照、运行时验证和剩余缺口的工程估算，不是代码覆盖率、测试覆盖率或发布完成度。

## 当前概览

| 项目 | 当前状态 |
| --- | --- |
| Monorepo | pnpm workspace 包含 SDK、VitePress 用户文档和 React 示例。 |
| SDK 包 | `@kairos3d/cesium` 保持无框架，Cesium 为 peer dependency。 |
| 运行时模型 | 状态统一挂载在 `KairosMap`，不修改 `window` 或 Cesium 原型。 |
| 基础能力 | 图层、工具、绘制、分析、拾取、样式、快照、材质、特效、操作、并发和 Widget 平台均已建立。 |
| 验证 | 常规检查为 `pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm build`。 |

## 已完成能力

| 模块 | 当前能力 |
| --- | --- |
| `core` | `createMap`、`createViewer`、销毁生命周期、事件和 manager 组合。 |
| `layers` | XYZ/WMS/WMTS/terrain/3D Tiles/GeoJSON/glTF、状态、分组、顺序、透明度、归属、事务准备、导出和恢复。 |
| `tools` | 独占交互工具生命周期及 start/stop/cancel/complete/point-add/clear 事件。 |
| `draw` / `overlays` | 绘制、编辑、属性、分组、样式、导入导出、数据快照和部分 Primitive 渲染。 |
| `analysis` | 距离、面积、高度、通视、剖面、裁剪、坡度坡向、等高线、体积、淹没和开挖估算。 |
| `scene` | 相机、书签、v1 快照校验、强事务恢复、回滚和清理诊断。 |
| `picking` | Entity、GeoJSON、glTF、3D Tiles、Primitive 和可选影像要素归一化。 |
| `materials` / `effects` | 公开 Cesium API 材质工厂及九类几何、粒子和天气特效。 |
| `operations` | 异步进度、取消、失败、保留和晚到提交保护。 |
| `concurrency` | 可观察资源租约、Scene 独占、公平等待、冲突错误和 idle 等待。 |
| `style` / `height` | JSON-safe 样式、预设、高度模式、地形采样和贴地辅助。 |
| `results` / `performance` | 聚合结果索引、运行时统计、预算告警和 Primitive 优化候选。 |
| `primitives` | SDK 管理的 Primitive polyline overlay 和部分绘制/量测 Primitive 结果。 |
| Widget 平台 | React Widget 基础设施和六个标准管理 Widget。 |

## 工程成熟度

| 领域 | 当前估算 | 已有基础 | 最大缺口 |
| --- | ---: | --- | --- |
| SDK 架构 | 95% | Manager 组合、Operations、Concurrency、事务、快照和销毁顺序稳定。 | 插件扩展和长期兼容策略。 |
| 绘制与覆盖物 | 92% | 绘制、编辑、分组、样式、属性、导入导出和 Widget。 | 更完整的 Primitive 渲染和高级编辑。 |
| 图层管理 | 85% | 七类 adapter、状态、顺序、归属和事务恢复。 | 更多服务协议、缓存和图层专属控制。 |
| 量测与地形分析 | 72% | 常用量测和浏览器端地形分析已具备。 | 测绘级精度、大数据量和 Worker。 |
| 裁剪 | 78% | 平面/多边形、编辑、快照和事务恢复。 | 剖切控制和开挖展示。 |
| 拾取与选择 | 85% | 多类 Cesium 对象归一化和可恢复高亮。 | 多选、选择集和业务策略。 |
| 场景与快照 | 96% | v1 校验、prepare/commit/rollback、诊断和并发门禁。 | 平台级事务和真实 schema 变化后的迁移。 |
| 样式系统 | 65% | JSON-safe 样式、默认值、预设和材质描述。 | Entity/Primitive 全类型统一样式。 |
| Primitive 性能 | 45% | Polyline overlay 及部分 draw/measure Primitive 路径。 | 主要几何的共享 Collection 渲染。 |
| 模型业务 | 40% | glTF 加载、样式、拾取、裁剪和恢复。 | 动画、部件、姿态、跟踪和路线。 |
| 相机业务 | 40% | 视角捕获、飞行、书签和事务恢复。 | 漫游、跟踪、第一人称和路线控制。 |
| 材质与特效 | 75% | 材质工厂、九类特效、快照和清理。 | 产品预设和更多几何接入。 |
| Widget/UI 平台 | 68% | React 平台和六个标准 Widget。 | 布局持久化、可访问性和专用面板。 |
| **整体** | **72%** | SDK 共享基础已经基本建立。 | Primitive、模型和相机仍是下一批结构性缺口。 |

该表只用于决定里程碑顺序。公共能力或运行时所有权边界发生变化后再重新评估。

## 关键边界

| 主题 | 当前边界 |
| --- | --- |
| 地形分析 | 浏览器端估算，不是测绘级实体建模或真实地形变形。 |
| Primitive | Entity 仍为兼容默认；Primitive 只覆盖已明确接入的路径。 |
| 场景快照 | `version: 1`；没有真实不兼容持久化数据前不增加迁移 API。 |
| Operations | 取消立即拒绝；Cesium 晚到结果只能清理，不能提交。 |
| Concurrency | 普通冲突写入立即拒绝；Scene 恢复默认等待并独占到清理结束。 |
| Effects | 快照只保存描述，不保存 Cesium runtime 或动画 phase。 |
| Persistence | SDK 返回可序列化数据，应用决定 localStorage、文件或后端。 |

## 验证入口

完整开发和 Browser 验证流程见 [开发流程](./development-workflow.md)。
