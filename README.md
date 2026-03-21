# Oh My ACPX 🦞

> Multi-agent orchestration for OpenClaw ACP runtime. Inspired by Oh My OpenCode.

**Oh My ACPX** 是一个多 agent 调度框架，根据任务复杂度自动分派给最适合的 coding agent（trae / codex / claude）。

## 核心理念

不同 agent 有不同的能力，匹配任务复杂度是关键：

```
        ┌──────────────┐
        │   claude     │  ← ultrabrain/deep：复杂架构、深度推理
        │   (最强)      │
        ├──────────────┤
        │    codex     │  ← standard：常规开发、API、测试
        │   (中等)      │
        ├──────────────┤
        │    trae      │  ← quick：单文件、快速原型、中文需求
        │   (最快)      │
        └──────────────┘
```

## 特性

- 🎯 **智能路由** - 按任务复杂度自动选择最佳 agent
- ⚡ **并行执行** - 独立任务同时处理
- 🔄 **瀑布模式** - 先规划后执行
- 📊 **对比验证** - 多 agent 做同一任务，选最优
- 🇨🇳 **中文优化** - trae 对中文需求特别优化

## 类别路由

| 类别 | 任务类型 | 首选 Agent | 说明 |
|---|---|---|---|
| ultrabrain | 复杂架构、深度推理 | claude | 最强能力 |
| deep | 多文件重构 | claude | 深度理解 |
| visual-engineering | 前端 UI、CSS | trae | 快速原型 |
| standard | 常规开发、CRUD | codex | 平衡选择 |
| quick | 单文件、小修改 | trae | 最快响应 |
| writing | 文档、注释 | trae | 中文友好 |
| explore | 代码搜索、调研 | codex | 快速检索 |

## 快速开始

### 前置要求

1. OpenClaw 已安装
2. acpx 已配置 (`~/.acpx/config.json`)
3. 至少一个 agent 可用（trae / codex / claude）

### 安装 Skill

```bash
# 复制 skill 到你的 skills 目录
cp -r skills/acp-orchestrator ~/.agents/skills/
```

### 使用示例

**单任务执行：**

```
用户：用 quick 模式帮我创建一个登录表单

→ 自动路由到 trae（快速、单文件）
```

**并行多任务：**

```
用户：创建一个博客系统，前端 React，后端 Node.js

→ 架构设计 → claude (deep)
→ 后端 API → codex (standard)  
→ 前端 UI → trae (visual-engineering)
```

## 配置

### acpx 配置 (`~/.acpx/config.json`)

```json
{
  "defaultAgent": "codex",
  "defaultPermissions": "approve-all",
  "nonInteractivePermissions": "deny",
  "agents": {
    "trae": {
      "command": "trae-cli acp serve"
    }
  }
}
```

**完整配置指南**: 见 [docs/acpx-agent-config.md](docs/acpx-agent-config.md)

### 内置 vs 自定义 Agent

| Agent | 内置? | 需要配置? |
|---|---|---|
| claude | ✅ | ❌ |
| codex | ✅ | ❌ |
| gemini | ✅ | ❌ |
| copilot | ✅ | ❌ |
| kimi | ✅ | ❌ |
| qwen | ✅ | ❌ |
| cursor | ✅ | ❌ |
| **trae** | ❌ | ✅ 需要 |
| **pi** | ❌ | ✅ 需要 |

### Agent 能力对比

| 特性 | trae | codex | claude |
|---|---|---|---|
| **能力** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **速度** | ⚡⚡⚡ | ⚡⚡ | ⚡ |
| **中文优化** | ✅ | ❌ | ❌ |
| **复杂架构** | ❌ | ⚠️ | ✅ |
| **快速原型** | ✅ | ✅ | ⚠️ (overkill) |

## API

### sessions_spawn

```json
sessions_spawn({
  runtime: "acp",
  agentId: "trae",        // trae / codex / claude
  mode: "run",            // run (一次性) / session (持久)
  streamTo: "parent",     // 必须！否则收不到结果
  cwd: "/path/to/project",
  task: "任务描述"
})
```

### sessions_yield

等待所有 agent 完成并收集结果：

```json
sessions_yield({ message: "等待 agent 完成" })
```

## 最佳实践

### ✅ 推荐做法

- **匹配能力** - 复杂任务用 claude，简单任务用 trae
- **并行独立任务** - 前后端分离、多模块同时开发
- **中文需求用 trae** - 字节出品，中文优化
- **先规划后执行** - 瀑布模式确保方向正确

### ❌ 避免做法

- 用 trae 做复杂架构设计
- 用 claude 做简单单文件修改
- 串行执行独立任务
- 忘记设置 `streamTo: "parent"`

## 项目结构

```
oh-my-acpx/
├── README.md                 # 本文件
├── SKILL.md                  # Skill 定义（用于 OpenClaw）
├── config/
│   └── acpx-config.json      # acpx 配置示例
├── examples/
│   ├── quick-task.md         # quick 任务示例
│   ├── parallel-task.md      # 并行任务示例
│   └── waterfall-task.md     # 瀑布模式示例
└── docs/
    ├── agents.md             # Agent 详细对比
    └── best-practices.md     # 最佳实践指南
```

## 致谢

- 灵感来自 [Oh My OpenCode](https://ohmyopencode.org/) 的多 agent 设计
- 基于 [OpenClaw](https://openclaw.ai) ACP runtime
- 使用 [acpx](https://github.com/openclaw/acpx) 作为 ACP 客户端

## License

MIT
