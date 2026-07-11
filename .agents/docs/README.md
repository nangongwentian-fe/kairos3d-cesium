# 项目内部文档

这里是 Kairos3DCesium 的项目治理与 Agent 协作文档入口。SDK 用户的安装、API 和运行语义文档位于 [`apps/docs`](../../apps/docs)。

## 快速入口

| 文档 | 使用场景 |
| --- | --- |
| [项目现状](./project-status.md) | 判断当前能力、成熟度、边界和主要缺口。 |
| [路线图](./roadmap.md) | 确认 M12 之后的实现顺序和优先级。 |
| [项目架构](./project-architecture.md) | 理解工作区边界、迁移规则和参考源码策略。 |
| [开发流程](./development-workflow.md) | 安装依赖、构建、测试、Browser 验证和清理进程。 |
| [发布准备](./release-preparation.md) | 发布优先级提高后执行版本、打包和部署检查。 |
| [M12 Primitive Renderer V2](./milestones/m12-primitive-renderer-v2.md) | 实现或评审下一阶段 Primitive 渲染器。 |
| [历史 Goal 合同](./goals/archive/) | 查询已执行任务的范围、约束和验收依据。 |

## 文档分类

| 读者与内容 | 正确位置 | 示例 |
| --- | --- | --- |
| SDK 使用者 | `apps/docs/` | 安装、API、取消语义、事务恢复、并发冲突。 |
| 项目维护者与 Agent | `.agents/docs/` | 当前进度、路线图、项目决策、开发和发布流程。 |
| 当前里程碑 | `.agents/docs/milestones/` | M12 的设计、范围、依赖和验收条件。 |
| 执行合同 | `.agents/docs/goals/` | 可验证的任务目标、允许写入范围、停止条件。 |
| 历史合同 | `.agents/docs/goals/archive/` | 已结束或不再作为当前任务源的 Goal。 |

## 维护规则

- 先更新已有主题文档，避免新增重复说明。
- README 和 `AGENTS.md` 只做发现入口，不复制详细正文。
- 项目状态发生实质变化时更新 `project-status.md`；里程碑顺序改变时更新 `roadmap.md`。
- 新增用户功能时同步更新 `apps/docs`，但不要把内部实现计划放入用户站点。
- 出现真实且不兼容的快照结构变化后再设计版本迁移；当前 `SceneSnapshot.version` 保持 `1`。
- 每个完成且验证通过的主题单独提交，并 push 当前跟踪分支；多主题工作区必须按主题拆分。
