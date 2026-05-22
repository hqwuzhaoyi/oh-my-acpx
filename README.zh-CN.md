# OMA (`oh-my-acpx`)

[English](./README.md) | [简体中文](./README.zh-CN.md)

安装 `oh-my-acpx`，运行 `oma install`，然后让你的 agent 使用已安装的 OMA skills，在值得节省主上下文空间时，把边界清晰的辅助工作通过 ACPX 进行 offload。

[![npm version](https://img.shields.io/npm/v/oh-my-acpx)](https://www.npmjs.com/package/oh-my-acpx) [![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

OMA 是给 **Host Agent** 使用的上下文节省型辅助 sidecar。Host Agent 保留主上下文，拥有 Host Plan，做主决策，并负责整合结果。OMA 只消费小而有边界的 Auxiliary Tasks，并且只在委托这些工作能带来收益时使用。

大多数用户应该把 OMA 理解成 **agent-installed skills + small runtime**，而不是一个需要整天手动操作的 CLI。

## 推荐默认流程

如果你想使用默认的 OMA 体验，从这里开始：

```bash
npm install -g oh-my-acpx
oma install
```

然后在你的 agent 里正常工作：

```text
$oma "Use OMA for this task when offloading can save context."
$oma-acpx-init "Approve ACPX-backed agents when real ACPX execution is needed."
```

这是主要路径。Skills 会引导 onboarding、planning、approvals、execution 和 result handling；`oma` CLI 是这些 skills 背后的小 runtime。

## 快速开始

### 要求

- Node.js 20+
- 一个可以使用已安装 skills 的 agent 环境
- 只有当你需要 ACPX-backed execution 时才需要 ACPX

### 安装

```bash
npm install -g oh-my-acpx
oma install
```

`oma install` 会全局安装 `skills/` 下的所有 bundled skills，内部运行：

```bash
npx skills add <oh-my-acpx>/skills --global --all --full-depth
```

它还会检查 `acpx` 是否可用；如果命令不存在，交互式终端会询问是否运行 `npm install -g acpx`，非交互式运行会跳过 ACPX 安装，除非传入 `--yes`。这个命令不支持只安装单个 skill。

如果想在安装时顺便查看当前声明的 ACPX adapters 和本机 PATH 上已安装的客户端命令，可以运行：

```bash
oma install --inspect-agents
```

发现结果会列出候选 adapter、已安装客户端命令（例如 `codex`、`claude`、`gemini`、`cursor`、`copilot`、`opencode`、`hermes`、`qodercli`），并按每个 agent 给出推荐角色，例如 `claude -> deep`、`gemini -> visual`。这些仍然只是候选项；需要用户确认它们已配置可用，再用 `oma acpx approve` 显式批准。

### 源码安装

```bash
npm install
npm run build
npm install -g .
oma install
```

包发布前 smoke check：

```bash
npm pack
npm install -g ./oh-my-acpx-*.tgz
oma --version
oma install
```

## OMA 适合什么

当一个任务满足这些条件时，适合使用 OMA：

- 边界足够清晰，可以打包成 Auxiliary Task
- 不需要完整 Host Agent 对话也能产生有用结果
- 委托出去能节省主上下文空间
- Host Agent 在整合结果之前可以验证它

如果工作需要完整 Host Plan 上下文、任务本身就是最终整合决策，或者你想要的是广义 team/swarm/autopilot 系统，就不应该使用 OMA。

## 一个简单心智模型

OMA **不会** 替代你的 agent。

它只是增加一个小的 offload 层：

- **Host Agent** 拥有主任务、决策和最终整合
- **OMA skills** 帮助 Host Agent 判断何时、如何 offload
- **OMA runtime** 读取有边界的 Offload Plans，并返回结构化结果
- **ACPX-backed agents** 是可选的执行后端，只用于已批准的 Auxiliary Tasks
- **`.oma/`** 在使用时保存 plans、approvals、artifacts 和 runtime state

**Offload Plan** 是 Host Agent 交给 OMA 的小任务包。**Auxiliary Task** 是一个独立、可验证的工作片段。**Auxiliary Task Return** 是 Host Agent 用来判断如何整合结果的结构化返回。

## 常用 Agent 入口

| 入口 | 用途 |
| --- | --- |
| `$oma "..."` | 判断是否要 offload 有边界的辅助工作，并驱动 OMA 流程 |
| `$oma-acpx-init "..."` | 为真实执行批准 ACPX-backed agents |
| `/skills` | 当你的 agent 支持 skill discovery 时，用来浏览已安装的 OMA skills |

日常使用 OMA 大多应该从 `$oma` 开始。当 execution 被缺失或不足的 ACPX approvals 阻塞，或者项目需要批准 agents 给 OMA 使用时，再使用 `$oma-acpx-init`。

## Advanced / Operator Surfaces

这些命令适合 skills、debugging 和 operator workflows，但不是主要 onboarding 路径。

```bash
oma setup
oma acpx init
oma acpx approve --agent codex --role deep --permissions edit --scope project
oma acpx approve --agent gemini --role visual --permissions edit --scope project
oma run .oma/plans/plan.json
oma run .oma/plans/plan.json --execute
oma run .oma/plans/plan.json --tasks docs-check,api-check
oma run .oma/plans/plan.json --execute --tasks docs-check,api-check --parallel 2
oma result show <task-id>
oma schema
```

关键边界：

- `oma run` 默认返回 Offload Proposal，不会调用 ACPX。
- `oma run --execute` 是显式 Execute Mode。
- `oma run --tasks a,b` 会为 Host Agent 选定的 tasks 返回 Offload Batch Proposal。
- `oma run --execute --tasks a,b --parallel N` 会显式执行 Host Agent 选定的 batch；每个 task 仍单独写 artifact，batch artifact 写到 `.oma/artifacts/batches/` 下。
- ACPX-backed execution 需要 Approved Agents。
- ACPX-backed task 默认 prompt timeout 是 600 秒，除非设置了 `route.timeoutSeconds`。
- `oma result show <task-id>` 用于查看已捕获的 Auxiliary Task 结果。
- `oma schema` 暴露 runtime return contract，供 operators 和 tests 使用。

包内包含一个受版本控制的 `bin/oma` wrapper，并在 `npm run build` 时 chmod `dist/src/cli/index.js`，这样 npm shims 可以执行 CLI。

## 可选 ACPX Console

`capabilities/acpx-tui` 是可选 companion console，用来检查和恢复 ACPX sessions。它不是核心 `oma run` 决策循环的一部分，也不会让 OMA 拥有 Host Plan。

如果你需要 TUI，请用 submodules 克隆：

```bash
git submodule update --init --recursive
```

## 边界

当前 MVP 范围内：

- agent-driven OMA skills
- 用 `oma install` 安装 bundled skills
- proposal-first `oma run`
- 显式 `oma run --execute`，支持 fake/local 或 ACPX-backed routes
- 统一的 Auxiliary Task Return artifacts
- 小型 TypeScript core modules 和 CLI

当前 MVP 范围外：

- 广义 ACPX provider abstraction
- 完整 team/swarm orchestration
- OMA core 内的 UI/HUD
- 广义 autopilot behavior
- 拥有 Host Plan

## 文档

- [OMA ACPX init](./docs/oma-acpx-init.md)
- [ADR 0001: proposal-first run](./docs/adr/0001-oma-run-defaults-to-offload-proposal.md)
- [ADR 0002: unified auxiliary return schema](./docs/adr/0002-use-unified-auxiliary-task-return-schema.md)
- [ADR 0003: ACPX TUI as companion capability](./docs/adr/0003-link-acpx-tui-as-companion-capability.md)
- [ADR 0004: schema-confirmed provisional accept](./docs/adr/0004-require-schema-confirmed-results-for-provisional-accept.md)
- [ADR 0005: capture auxiliary results separately from artifacts](./docs/adr/0005-capture-auxiliary-results-separately-from-artifacts.md)
