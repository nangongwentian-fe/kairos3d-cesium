# Kairos3DCesium Agent 指南

## 文档入口

- 项目内部文档总入口：[`.agents/docs/README.md`](.agents/docs/README.md)
- 当前能力与缺口：[`.agents/docs/project-status.md`](.agents/docs/project-status.md)
- 里程碑顺序：[`.agents/docs/roadmap.md`](.agents/docs/roadmap.md)
- 项目架构决策：[`.agents/docs/project-architecture.md`](.agents/docs/project-architecture.md)
- 开发与验证流程：[`.agents/docs/development-workflow.md`](.agents/docs/development-workflow.md)
- SDK 用户文档：[`apps/docs`](apps/docs)

## 文档归属规则

| 内容 | 存放位置 |
| --- | --- |
| SDK 安装、公共 API、运行语义、使用限制 | `apps/docs/` |
| 项目状态、路线图、架构决策、开发流程、发布准备 | `.agents/docs/` |
| 当前里程碑设计 | `.agents/docs/milestones/` |
| 执行中的 Goal 合同 | `.agents/docs/goals/` |
| 已结束的 Goal 合同 | `.agents/docs/goals/archive/` |

新增文档前先判断读者。禁止把项目进度、里程碑规划、Agent 执行合同或内部发布决策写入 VitePress 用户文档。

## 使用规则

1. 开始非平凡任务前，先读取内部文档索引，再按任务需要加载具体文档。
2. 项目文档使用中文和 UTF-8；文件名使用小写英文和连字符。
3. `apps/docs` 面向 SDK 使用者，避免出现内部任务状态和临时实施计划。
4. Goal 完成后移入 `goals/archive/`，并注明它不再是当前任务源。
5. 不自动启动持久开发服务器；需要浏览器验证时使用临时服务，结束后关闭页面和进程。

## Git 提交规则

1. 一个主题完成并通过相关验证后，创建一个独立的中文 Conventional Commit。
2. 提交后 push 当前跟踪分支，不把多个已完成主题长期堆在工作区。
3. 工作区包含多个主题时按主题拆分暂存和提交，不使用含糊的混合 commit。
4. 除非用户明确要求，否则不 amend、不 rebase、不 force push，也不改写已有提交。
