# 项目路线图

本文记录当前里程碑顺序。默认原则是先补共享基础，再增加业务功能数量。

## 当前决策

M11 已建立普通 manager mutation 与 Scene 恢复之间的统一并发协调，因此 M12 进入 Primitive Renderer V2。`SceneSnapshot.version` 继续保持 `1`，真实不兼容 schema 出现前不设计迁移注册表。

## 已完成主线

| 里程碑 | 状态 | 结果 |
| --- | --- | --- |
| M7 | 已完成 | React Widget 平台和标准 Widget。 |
| M8 | 已完成 | 材质与九类几何、粒子、天气特效。 |
| M9 | 已完成 | Operations、取消、进度和晚到提交保护。 |
| M10 | 已完成 | v1 Scene 强事务 prepare/commit/rollback。 |
| M11 | 已完成 | Mutation Leases、Scene 独占、Preflight 和 Cleanup Diagnostics。 |

## 后续里程碑

| 顺序 | 里程碑 | 目标与依赖 |
| --- | --- | --- |
| 1 | [M12 Primitive Renderer V2](./milestones/m12-primitive-renderer-v2.md) | 复用 M10/M11，覆盖 point、billboard、label、polyline、polygon、wall、corridor 的共享 Collection 运行时。 |
| 2 | M13 Model Runtime Core | 动画、部件、姿态更新、跟踪和路线状态。 |
| 3 | M14 Camera Navigation Core | 飞行路线、漫游、跟踪、第一人称、打断和可恢复导航状态。 |
| 4 | M15 Standard Widgets V2 | 在 Model/Camera Core 稳定后补产品化管理面板。 |
| 5 | M16 业务能力扩展 | 恢复高级分析、开挖展示等领域功能扩展。 |
| 6 | 发布与部署强化 | 仅在发布优先级提高后处理 npm、版本、文档和示例部署。 |

## 优先级规则

| 规则 | 含义 |
| --- | --- |
| Core 无框架 | React/Vue UI 放在可选包或应用层。 |
| 快照只保存数据 | 不序列化 Cesium runtime、函数、回调或对象 identity。 |
| 真实变化才升级版本 | 没有不兼容持久化 schema 时保持 Scene v1。 |
| 基础优先 | Renderer、快照、图层、结果和交互合同优先于新算法数量。 |
| 发布延后 | 未提高发布优先级前不投入 npm 和站点部署。 |

## 里程碑验收基线

每个里程碑至少保持以下命令通过：

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
```

除非任务明确要求 Browser 验证，否则不自动启动开发服务器。
