# 开发与验证流程

本文供项目维护者和 Agent 使用，记录 monorepo 的安装、检查、运行时验证和服务器清理规则。SDK 消费者应阅读 [`apps/docs`](../../apps/docs)。

## 环境与安装

从仓库根目录执行：

```powershell
pnpm install
```

工作区结构：

| 路径 | 用途 |
| --- | --- |
| `packages/kairos3d-cesium` | SDK Core。 |
| `packages/kairos3d-cesium-widget` | Widget Platform Core。 |
| `packages/kairos3d-cesium-ui-react` | React UI 和标准 Widget。 |
| `apps/examples` | SDK 功能示例与 Browser fixture。 |
| `apps/docs` | SDK 用户文档。 |

## 常用检查

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | 全工作区 TypeScript 检查。 |
| `pnpm test` | 全工作区单元测试。 |
| `pnpm lint` | 当前 lint/类型约束检查。 |
| `pnpm build` | 构建 SDK、包、示例和文档。 |
| `pnpm verify` | 顺序执行 typecheck、test、lint 和 build。 |
| `pnpm verify:runtime` | 启动临时示例服务并执行 Browser runtime smoke。 |
| `pnpm release:check` | 非发布式完整验证和 SDK pack dry run。 |

包级检查优先于全工作区检查：

```powershell
pnpm --filter @kairos3d/cesium typecheck
pnpm --filter @kairos3d/cesium test
pnpm --filter @kairos3d/cesium build
```

## 开发服务器

仅在需要人工查看时手动启动：

```powershell
pnpm dev:examples
pnpm dev:docs
```

- 实现完成后默认不自动启动开发服务器。
- Browser 验证使用临时 Vite 服务并记录 PID。
- 验证结束后关闭 Browser 页面和 Vite 进程，避免端口冲突。
- `verify:runtime` 使用本地 Chromium；非标准路径通过 `CHROME_PATH` 指定。

## Cesium 静态资源

任何直接创建 Cesium Viewer 的应用必须提供：

- `Workers`
- `Assets`
- `Widgets`
- `ThirdParty`

示例应用通过 `vite-plugin-static-copy` 复制资源并定义 `CESIUM_BASE_URL`。该配置属于应用，不放入 SDK bundle。

## 文档验证

```powershell
pnpm --filter @kairos3d/docs build
git diff --check
```

文档迁移或重命名后还要检查本地 Markdown 相对链接，以及 VitePress 导航中是否残留内部项目文档。

## Git 规则

- 保留用户已有未提交修改，不回退无关文件。
- 一个主题完成并通过相关验证后，按主题创建独立中文 Conventional Commit，并 push 当前跟踪分支。
- 多个主题同时存在时分别暂存、提交和 push，禁止用一个含糊 commit 混合无关改动。
- 如果主题尚未完成、验证失败或用户明确要求保持未提交，则不提交该主题。
- Windows 下区分真实 whitespace error 与行尾规范化提示。
