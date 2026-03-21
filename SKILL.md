---
name: acp-orchestrator
description: Multi-agent task orchestration using OpenClaw ACP runtime. Automatically analyzes requirements, splits tasks, and dispatches to the best agent (trae/claude/codex). Use when: (1) user requests multi-step coding tasks, (2) complex requirements need parallel processing, (3) comparing outputs from different agents, (4) large projects need task decomposition. Triggers on "用多个agent", "并行处理", "分派任务", "multi-agent", "parallel agents", "orchestrate", "oh my acpx".
---

# Oh My ACPX - Multi-Agent Orchestration

> 智能路由，按能力分层，高效并行。

## 核心原则

1. **streamTo: "parent"** - 必须！否则收不到结果
2. **能力匹配** - 复杂任务给强 agent，简单任务给快 agent
3. **并行优于串行** - 独立任务同时执行

## Agent 能力分层

```
┌─────────────────────────────────────────────────────────────┐
│  ultrabrain / deep                                          │
│  复杂架构、深度推理、多文件重构                                │
│  ─────────────────────────────────────────────────────────  │
│  claude (最强)                                               │
│  - 复杂架构设计                                               │
│  - 多文件重构                                                 │
│  - 深度调试                                                   │
│  - 跨域综合                                                   │
├─────────────────────────────────────────────────────────────┤
│  standard / unspecified                                      │
│  常规开发、CRUD、API 实现                                     │
│  ─────────────────────────────────────────────────────────  │
│  codex (中等)                                                │
│  - 常规功能开发                                               │
│  - API 实现                                                   │
│  - 测试编写                                                   │
│  - 代码审查                                                   │
├─────────────────────────────────────────────────────────────┤
│  quick                                                       │
│  简单文件、快速原型、小修改                                    │
│  ─────────────────────────────────────────────────────────  │
│  trae (最快)                                                 │
│  - 单文件修改                                                 │
│  - 快速原型                                                   │
│  - 样板代码                                                   │
│  - 中文需求                                                   │
└─────────────────────────────────────────────────────────────┘
```

## 类别路由表

| 类别 | 任务类型 | 首选 Agent | 备选 |
|---|---|---|---|
| **ultrabrain** | 复杂架构、深度推理 | claude | codex |
| **deep** | 多文件重构、复杂逻辑 | claude | codex |
| **visual-engineering** | 前端 UI、CSS | trae | claude |
| **standard** | 常规开发、CRUD | codex | trae |
| **quick** | 单文件、小修改 | trae | codex |
| **writing** | 文档、注释 | trae | codex |
| **explore** | 代码搜索、调研 | codex | trae |

## Agent 特点对比

| 特性 | trae | codex | claude |
|---|---|---|---|
| **能力** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **速度** | ⚡⚡⚡ | ⚡⚡ | ⚡ |
| **中文优化** | ✅ | ❌ | ❌ |
| **复杂架构** | ❌ | ⚠️ | ✅ |
| **快速原型** | ✅ | ✅ | ⚠️ (overkill) |
| **成本** | 低 | 中 | 高 |

## 使用模式

### 模式 1：按能力选择单 agent

```json
// 复杂架构 → claude
sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  mode: "run",
  streamTo: "parent",
  task: "重构整个认证系统，支持 OAuth2、JWT、Session 三种模式"
})

// 常规开发 → codex
sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  mode: "run",
  streamTo: "parent",
  task: "实现用户 CRUD API"
})

// 快速原型 → trae
sessions_spawn({
  runtime: "acp",
  agentId: "trae",
  mode: "run",
  streamTo: "parent",
  task: "创建一个登录表单组件"
})
```

### 模式 2：并行多任务（按能力分配）

```json
// 创建全栈项目
sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  streamTo: "parent",
  task: "设计整体架构和数据模型"  // deep 任务
})

sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  streamTo: "parent",
  task: "实现后端 API"  // standard 任务
})

sessions_spawn({
  runtime: "acp",
  agentId: "trae",
  streamTo: "parent",
  task: "创建前端 UI 组件"  // visual-engineering + quick 任务
})

sessions_yield({ message: "等待所有 agent 完成" })
```

### 模式 3：瀑布式（先规划后执行）

```json
// Step 1: 规划（claude）
sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  streamTo: "parent",
  task: "分析需求，设计架构，输出实现计划"
})

// 等待完成后...
sessions_yield({})

// Step 2: 执行（根据任务复杂度分配）
// 简单任务 → trae
// 中等任务 → codex
// 复杂任务 → claude
```

### 模式 4：对比验证（同任务多 agent）

```json
// 让不同 agent 做同一件事，对比结果
sessions_spawn({
  runtime: "acp",
  agentId: "trae",
  streamTo: "parent",
  task: "重构 auth 模块"
})

sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  streamTo: "parent",
  task: "重构 auth 模块"
})

sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  streamTo: "parent",
  task: "重构 auth 模块"
})

sessions_yield({ message: "对比三个方案，选择最优" })
```

## 决策流程

```
用户请求
    │
    ▼
分析任务复杂度
    │
    ├── 单文件/小修改 ──────────────────► trae (quick)
    │
    ├── 常规功能/API ───────────────────► codex (standard)
    │
    ├── 架构设计/复杂重构 ──────────────► claude (deep)
    │
    └── 多模块项目 ─────────────────────► 并行分配
                                            │
                                            ├── 架构 → claude
                                            ├── 后端 → codex
                                            └── 前端 → trae
```

## 实战示例

### 示例 1：创建博客系统

```
需求：创建一个博客系统，前端 React，后端 Node.js，带测试

分析：
- 架构设计 → claude (deep)
- 后端 API → codex (standard)
- 前端 UI → trae (visual-engineering)
- 测试 → codex (standard)

执行：
sessions_spawn({ agentId: "claude", streamTo: "parent", task: "设计博客系统架构" })
sessions_spawn({ agentId: "codex", streamTo: "parent", task: "实现后端 API" })
sessions_spawn({ agentId: "trae", streamTo: "parent", task: "创建前端 React 组件" })
sessions_spawn({ agentId: "codex", streamTo: "parent", task: "编写测试" })
sessions_yield({})
```

### 示例 2：快速原型

```
需求：快速做一个登录页面

分析：quick 任务 → trae

执行：
sessions_spawn({
  agentId: "trae",
  streamTo: "parent",
  task: "创建登录页面，包含表单验证"
})
```

### 示例 3：重构遗留代码

```
需求：重构用户认证模块，支持多种登录方式

分析：deep 任务 → claude

执行：
sessions_spawn({
  agentId: "claude",
  streamTo: "parent",
  task: "重构认证模块，支持邮箱、手机、OAuth 登录"
})
```

## 注意事项

1. **不要用 trae 做复杂架构** - 能力不足，会出错
2. **不要用 claude 做简单任务** - 浪费资源，速度慢
3. **中文需求优先 trae** - 字节出品，中文优化
4. **并发控制** - 同时运行 2-4 个 agent 较合适
5. **权限** - 确保 `--approve-all` 或配置默认权限

## 错误处理

| 问题 | 原因 | 解决 |
|---|---|---|
| agent 输出质量差 | 能力不匹配 | 升级到更强 agent |
| 执行超时 | 任务太复杂 | 拆分任务或换 agent |
| 权限被拒 | 没有配置 | 加 `--approve-all` |
| spawn 失败 | agentId 错误 | 检查配置 |

## 配置参考

```json
// ~/.acpx/config.json
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
