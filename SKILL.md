---
name: acp-orchestrator
description: "Multi-agent task orchestration using OpenClaw ACP runtime. Automatically analyzes requirements, splits tasks, and dispatches to the best agent (trae/claude/codex/gemini). Use when: (1) user requests multi-step coding tasks, (2) complex requirements need parallel processing, (3) comparing outputs from different agents, (4) large projects need task decomposition. Triggers on '用多个agent', '并行处理', '分派任务', 'multi-agent', 'parallel agents', 'orchestrate', 'oh my acpx'."
---

# Oh My ACPX - Multi-Agent Orchestration

> 智能路由，按能力分层，高效并行。

## 核心原则

1. **混合运行时策略** — 规划/调研用 `subagent`（可见性稳定），编码用 `acp`（能力更强）
2. **能力匹配** — 复杂任务给强 agent，简单任务给快 agent
3. **并行优于串行** — 独立任务同时执行
4. **强制兜底** — ACP 任务 75s 无输出则自动走 child 结果回捞，绝不黑洞等待

## 运行时路由策略（关键）

根据任务类型自动选择最稳定的运行时：

| 任务类型 | 运行时 | 原因 |
|---|---|---|
| 规划/调研/汇总 (ultrabrain, deep, explore, writing) | `subagent` | 完成通告稳定可靠 |
| 编码/重构/修改 (standard, quick, visual-engineering) | `acp` + `streamTo:"parent"` | coding harness 能力更强 |

### 降级链路（ACP 失败时）

```
acp + streamTo:parent
    │ 75s 无 assistant delta
    ▼
child 结果回捞 (sessions_history / acpx stream log)
    │ 回捞失败
    ▼
direct acpx (acpx --approve-all --timeout 90 <agent> exec)
    │ 也失败
    ▼
subagent (降级：仅产出方案，不直接执行改动)
```

### ACP 兜底操作流程（内联执行，无需外部脚本）

当使用 `runtime: "acp"` 时，你必须按以下步骤处理 relay stall：

**Step 1: spawn 并 yield**
```json
// spawn 返回 streamLogPath 和 childSessionKey
const spawnResult = sessions_spawn({
  runtime: "acp", agentId: "<agent>", mode: "run",
  streamTo: "parent", task: "<task>"
})
sessions_yield({ message: "等待 agent 完成" })
```

**Step 2: 检查 yield 结果**
- 如果 `sessions_yield` 正常返回了 agent 输出 → 直接使用，流程结束
- 如果返回显示 stall / 无输出 / 超时 → 进入 Step 3

**Step 3: child 结果回捞**
读取 spawn 返回的 `streamLogPath`（位于 `~/.openclaw/agents/<agent>/sessions/<id>.acp-stream.jsonl`）：
- 检查是否有 `:done` 事件 → 如有，说明 relay 其实成功了，提取结果
- 如果只有 `:start` + `:stall` → child 可能已完成但 relay 断了
- 用 `sessions_history(childSessionKey)` 拉取 child session 的完整对话历史
- 如果拿到了 assistant 输出 → 使用它作为结果，告知用户"已通过兜底回捞获取结果"

**Step 4: direct acpx 降级**（Step 3 也无结果时）
```bash
acpx --approve-all --timeout 90 <agent> exec "<task>"
```

**Step 5: subagent 降级**（Step 4 也失败时）
```json
sessions_spawn({ runtime: "subagent", agentId: "<agent>", task: "<task>" })
```
注意：subagent 降级后可能只能产出方案，不直接执行代码改动。

### 诊断工具（可选，人工调试用）

如需独立诊断 relay 状态，可使用 scripts 目录下的工具：
```bash
# 一次性诊断
node scripts/relay-fallback.js --stream-log <path>
# 实时监控
node scripts/relay-fallback.js --watch --stream-log <path> --timeout 75
# 路由查询
node scripts/runtime-router.js --category <category>
```
这些脚本仅用于人工调试，orchestrator agent 不依赖它们。

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
│  standard / explore                                          │
│  常规开发、CRUD、代码理解、仓库探索                            │
│  ─────────────────────────────────────────────────────────  │
│  codex (稳健)                                                │
│  - 常规功能开发                                               │
│  - API 实现                                                   │
│  - 测试编写                                                   │
│  - 代码审查                                                   │
├─────────────────────────────────────────────────────────────┤
│  visual-engineering / writing                                │
│  前端 UI、文档整理、说明文写作                                │
│  ─────────────────────────────────────────────────────────  │
│  gemini (表达/视觉强)                                         │
│  - 前端页面与样式                                             │
│  - 文档润色与整理                                             │
│  - 资料归纳                                                   │
│  - 多模态辅助                                                 │
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
| **visual-engineering** | 前端 UI、CSS、交互稿 | gemini | trae |
| **standard** | 常规开发、CRUD | codex | trae |
| **quick** | 单文件、小修改 | trae | codex |
| **writing** | 文档、注释、说明文 | gemini | codex |
| **explore** | 代码搜索、调研 | codex | gemini |

## Agent 特点对比

| 特性 | trae | codex | gemini | claude |
|---|---|---|---|---|
| **能力** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **速度** | ⚡⚡⚡ | ⚡⚡ | ⚡⚡ | ⚡ |
| **中文优化** | ✅ | ❌ | ✅ | ❌ |
| **复杂架构** | ❌ | ⚠️ | ⚠️ | ✅ |
| **快速原型** | ✅ | ✅ | ✅ | ⚠️ (overkill) |
| **文档整理/UI 表达** | ⚠️ | ✅ | ✅✅ | ✅ |
| **成本** | 低 | 中 | 中 | 高 |

## 使用模式

### 模式 0：混合路由（推荐默认）

```json
// 规划阶段 → subagent（完成通告稳定）
sessions_spawn({
  runtime: "subagent",
  agentId: "claude",
  task: "分析需求，设计架构，输出实现计划"
})
sessions_yield({})

// 编码阶段 → acp（能力更强）+ 兜底
sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  mode: "run",
  streamTo: "parent",
  task: "实现后端 API"
})
// 并行启动 relay watch：
// node scripts/relay-fallback.js --watch --stream-log <streamLogPath> --timeout 75
```

### 模式 1：按能力选择单 agent

```json
// 复杂架构 → claude（subagent 运行时，稳定可见）
sessions_spawn({
  runtime: "subagent",
  agentId: "claude",
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

### 模式 3：瀑布式（多轮编排）

> ⚠️ 单 turn 无法完成"规划 + 等待 + 执行"的完整流程（T6 验证）。
> 必须使用**多 turn 编排**：持久 session 或自调度循环。

**方式 A：持久 session（推荐）**

使用相同的 `--session-id`，在多个 turn 之间保持上下文：

```bash
SID="waterfall-$(date +%s)"

# Turn 1: 规划
openclaw agent --agent claude --session-id "$SID" \
  --message "分析需求，设计架构，输出实现计划。完成后输出 PLAN_COMPLETE。" \
  --json --timeout 120

# Turn 2: 执行（agent 已知 Turn 1 的规划内容）
openclaw agent --agent claude --session-id "$SID" \
  --message "规划已完成。用 sessions_spawn 分派子任务：
复杂 → claude (acp), 中等 → codex (acp), 简单 → trae (acp)。
并行 spawn，然后 sessions_yield 等待。" \
  --json --timeout 300
```

**方式 B：自调度循环（全自动）**

Agent 每 turn 只做一步，输出 `NEXT_STEP:` 标记，外部脚本自动触发下一轮：

```bash
SID="waterfall-auto-$(date +%s)"
MSG="你是编排器。瀑布任务：Step 1 规划 → Step 2 分派编码 → Step 3 汇总。
每 turn 只做一步，完成后输出 NEXT_STEP: <下一步>。全部完成后输出 ALL_DONE。
现在执行 Step 1。"

for turn in $(seq 1 5); do
  OUT=$(openclaw agent --agent claude --session-id "$SID" \
    --message "$MSG" --json --timeout 180)
  echo "$OUT" | grep -q "ALL_DONE" && echo "Done in $turn turns" && break
  echo "$OUT" | grep -q "NEXT_STEP" && MSG="继续执行 NEXT_STEP。" || break
done
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

1. **规划类用 subagent，编码类用 acp** — 混合策略是当前最稳定方案
2. **ACP relay stall 时走兜底** — 按 Step 2→3→4→5 逐级降级，绝不黑洞等待
3. **不要用 trae 做复杂架构** - 能力不足，会出错
4. **不要用 claude 做简单任务** - 浪费资源，速度慢
5. **中文需求优先 trae / gemini** - 前者适合快改，后者适合文档与 UI 表达
6. **Gemini 适合写和看，不适合扛主架构** - 更适合 visual-engineering、writing、轻调研
7. **并发控制** - 同时运行 2-4 个 agent 较合适
8. **权限** - 确保 `--approve-all` 或配置默认权限
9. **降级不恐慌** — relay stall 是可见性问题，不是执行问题，child 通常已完成

## 错误处理

| 问题 | 原因 | 解决 |
|---|---|---|
| ACP relay 只有 start+stall | 父级可见性链路断裂 | 按兜底流程 Step 3: sessions_history(childSessionKey) 回捞 |
| agent 输出质量差 | 能力不匹配 | 升级到更强 agent |
| 执行超时 | 任务太复杂 | 拆分任务或换 agent |
| 权限被拒 | 没有配置 | 加 `--approve-all` |
| spawn 失败 | agentId 错误 | 检查配置 |
| relay fallback 也无结果 | child 也失败 | 按兜底流程 Step 4→5 逐级降级 |

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
    },
    "gemini": {
      "command": "gemini --experimental-acp"
    }
  }
}
```

### Gemini CLI 兼容性

- 对较新的 Gemini CLI，`acpx` 内置映射通常可直接使用 `gemini --acp`
- 对旧版 Gemini CLI（例如本机 `0.22.x`），ACP 参数可能仍是 `--experimental-acp`
- 如果 `acpx gemini ...` 报 `Unknown argument: acp`，在 `~/.acpx/config.json` 中覆盖：`"gemini": { "command": "gemini --experimental-acp" }`
- 如果 Gemini 已在本机完成交互登录，ACP 子进程通常可直接复用登录态；不一定需要额外 API key
