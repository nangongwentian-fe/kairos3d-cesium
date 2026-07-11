# 发布准备

仅当项目优先级从 SDK 基础建设切换到版本、npm 发布或站点部署时使用本文。

## 当前状态

| 项目 | 状态 |
| --- | --- |
| 版本 | 暂缓；发布决策前包版本保持 `0.0.0`。 |
| npm | 已有 pack dry run，不自动发布。 |
| 用户文档 | 本地构建通过，尚未确定托管和 base path。 |
| 示例站 | 本地构建通过，部署前需确定资源路径。 |

## 非发布式检查

```powershell
pnpm release:check
```

该命令执行类型检查、测试、lint、构建和 SDK 打包 dry run，不发布任何内容。

## 发布前决策

| 决策 | 要求 |
| --- | --- |
| 版本 | 明确根项目和各包版本。 |
| Changelog | 将相关 `Unreleased` 内容归入目标版本。 |
| 包元数据 | 复核 `exports`、`files`、peer dependency、license 和 README。 |
| Fresh install | 在干净 clone 中验证安装、构建和 pack。 |
| Registry | 明确公开或私有 npm registry。 |
| 站点路径 | 明确 docs/examples 的域名和 base path。 |

## 当前边界

在发布优先级未提高前，不增加自动 npm publish、自动版本、文档托管或示例托管流程。
