---
name: acp-orchestrator
description: "Multi-agent task orchestration using OpenClaw ACP runtime. Automatically analyzes requirements, splits tasks, and dispatches to the best agent (trae/claude/codex/gemini). Use when: (1) user requests multi-step coding tasks, (2) complex requirements need parallel processing, (3) comparing outputs from different agents, (4) large projects need task decomposition. Triggers on '用多个agent', '并行处理', '分派任务', 'multi-agent', 'parallel agents', 'orchestrate', 'oh my acpx'."
---

# Oh My ACPX - Multi-Agent Orchestration

> 智能路由，按能力分层，高效并行。

## 核心原则

1. **Plan-Driven** — 先建 plan.json 再动手，持续追踪直到完成
2. **默认 ACP** — 所有任务默认用 `acp` + `streamTo:"parent"`，只有 ACP 失败时才降级到 `subagent`
3. **能力匹配** — 复杂任务给强 agent，简单任务给快 agent
4. **并行优于串行** — 独立任务同时执行
5. **强制兜底** — ACP 任务 75s 无输出则自动走 child 结果回捞，绝不黑洞等待

## 任务追踪（Plan-Driven）

> 任务开始时先建 plan，持续追踪直到完成。类似 [Ralph](https://github.com/snarktank/ralph) 的 prd.json 模式。

### 核心规则

1. **先建 plan 再动手** — 分析完需求后，第一步是创建 `plan.json`，不是直接 spawn agent
2. **每完成一个 story 就更新** — 把该 story 标记为 `passes: true`，并在必要时补充 `notes`
3. **执行模式 vs 诊断模式必须分清** — 先判断用户当前要你做的是继续执行，还是排障分析：
   - **执行模式**（继续推进）关键词：`继续`、`按 plan 往下做`、`推进下一个 story`、`直接执行`、`不要汇报`
     - 行为：读取 `plan.json` → 找最高优先级 `passes: false` story → 直接执行
   - **诊断模式**（排障/解释）关键词：`为什么没继续`、`哪里出错`、`看日志`、`调研原因`
     - 行为：只分析日志/plan 状态并给出原因，**不要自动推进 story**
4. **自动继续，不要停** — 仅在**执行模式**下生效：完成一个 story 后，立即读 plan.json 找下一个 `passes: false` 的 story 并执行，**不要等用户确认**。只有以下情况才允许停下来问用户：
   - 所有 stories 都已 `passes: true`（项目完成）
   - 当前 story 被阻塞且无法自行解决（如缺少外部输入）
   - 遇到不可恢复的错误
5. **plan.json 存项目根目录** — 所有模式共用同一个文件

### 自动循环（关键）

**这是和普通 agent 最大的区别：你必须像 Ralph 一样自驱循环，不是做完一步就停。**

```
完成 story N
    │
    ▼
更新 plan.json（passes: true）
    │
    ▼
读 plan.json → 还有 passes: false 的 story？
    │
    ├── 有 → 立即开始下一个（不要输出"建议下一步做 X"然后等用户说继续）
    │
    └── 没有 → 项目完成，汇报最终结果
```

**红线：以下行为是错误的，必须避免：**
- ❌ "S-001 已完成，建议下一步做 S-002，需要我继续吗？" — 不要问，直接做
- ❌ "下一步最合理的动作是..." 然后停下 — 不要停，直接执行
- ❌ 完成分析后只输出建议而不执行 — 你是执行者，不是顾问
- ✅ "S-001 completed. 继续 S-002..." 然后立即开始执行

### 跨 Turn 自调度（飞书/聊天场景必读）

**问题：** 在飞书等聊天场景中，每条用户消息只触发一个 agent turn。如果一个 story 耗尽了当前 turn 的时间/token，agent 会被迫停下，无法自动继续下一个 story。

**解决方案：在执行模式下，如果本 turn 没能继续 spawn 下一个 `passes: false` story，就必须在 turn 结束前用 `system event` 给自己发一条消息触发下一轮。**

```bash
# 在当前 turn 结束前执行：
openclaw system event --text "继续执行 plan.json：读取项目根目录的 plan.json，找最高优先级 passes:false 的 story，按 acp-orchestrator skill 继续执行。" --mode now
```

**硬性规则：**

1. 每完成一个 story 后，先更新 plan.json
2. 检查是否还有 `passes: false` 的 stories
3. 如果没有 → 项目完成，不需要触发
4. 如果有，且本 turn 已经直接开始执行下一个 story → 不需要触发
5. 如果有，但本 turn **没有**开始执行下一个 story（无论原因是快超时、token 不足、review 太长、还是回复用户汇报） → **必须在回复用户前调用 `system event`**

**这不是建议，是必须执行的收尾动作。**

```
执行模式下，当前 turn 即将结束
    │
    ▼
还有 passes: false 的 stories？
    │
    ├── 没有 → 回复用户："所有 stories 完成"
    │
    └── 有
         │
         ├── 本 turn 已直接开始下一个 story → 正常继续，不触发
         │
         └── 本 turn 未开始下一个 story
              │
              ├── 必须 exec: openclaw system event --text "继续 plan.json" --mode now
              └── 然后才能回复用户："已触发下一轮继续执行"
```

**红线：**
- ❌ 还有 `passes: false`，但只是汇报状态，不触发下一轮
- ❌ 说"我会继续"，但没执行 `system event`
- ❌ 执行模式下把自己退化成诊断模式，只读 plan 不推进
- ✅ 如果没法在本 turn 继续做，就先触发下一轮，再回复

### plan.json 结构

```json
{
  "project": "博客系统",
  "branchName": "feat/blog-system",
  "description": "创建博客系统，前端 React，后端 Node.js",
  "stories": [
    {
      "id": "S-001",
      "title": "设计博客系统架构",
      "acceptanceCriteria": [
        "输出数据模型设计",
        "输出 API 接口定义"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    },
    {
      "id": "S-002",
      "title": "实现后端 API",
      "acceptanceCriteria": [
        "CRUD 接口可用",
        "测试通过"
      ],
      "priority": 2,
      "passes": false,
      "notes": ""
    }
  ]
}
```

**核心字段（和 Ralph 一致）：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `project` | string | 项目名 |
| `branchName` | string | 工作分支 |
| `description` | string | 需求描述 |
| `stories[].id` | string | Story 标识 |
| `stories[].title` | string | 一句话描述 |
| `stories[].acceptanceCriteria` | string[] | 可验证的完成标准 |
| `stories[].priority` | number | 执行顺序，小数优先 |
| `stories[].passes` | boolean | `false` = 未完成，`true` = 已完成 |
| `stories[].notes` | string | 执行备注 |

**agent/methodology/runtime 等由 orchestrator 在执行时根据路由表自动决定，不写进 plan.json。**

### 使用流程

```
用户请求
    │
    ▼
分析需求 → 拆分 stories → 分配 agent/category/runtime/methodology
    │
    ▼
创建 plan.json（写入项目根目录）
    │
    ▼
┌─► 读 plan.json → 找最高优先级 passes: false 的 story
│       │
│       ▼
│   按 methodology 执行 story（注入方法论要求）
│       │
│       ▼
│   验证 acceptanceCriteria
│       │
│       ├── 失败 → 记录 notes，考虑升级 agent
│       │
│       └── 通过 → 编码类 story？
│                   │
│                   ├── 是 → spawn reviewer → review 通过？
│                   │                           ├── 是 → passes: true
│                   │                           └── 否 → 修复 → 重新验证+review
│                   │
│                   └── 否 → passes: true
│       │
│       ▼
│   还有 passes: false 的 stories？
│       │
└───── 是 ──┘
        │
        否 → 生成 retrospective → 项目完成
```

### 三种模式

#### 模式 A：OpenClaw Session（推荐）

在 OpenClaw 平台内，用 `sessions_spawn` / `sessions_yield` 编排，plan.json 做跨 turn 持久记忆：

```bash
SID="plan-$(date +%s)"

# Turn 1: 分析需求，创建 plan.json
openclaw agent --agent claude --session-id "$SID" \
  --message "分析以下需求，创建 plan.json：<需求描述>。
按能力路由表分配 agent，按运行时路由策略选 runtime。
完成后输出 PLAN_CREATED。" \
  --json --timeout 120

# Turn 2+: 逐个执行 story
openclaw agent --agent claude --session-id "$SID" \
  --message "读取 plan.json，找最高优先级 pending story，
用 sessions_spawn 执行，完成后更新 plan.json。
全部完成输出 ALL_DONE，否则输出 NEXT_STORY。" \
  --json --timeout 300
```

#### 模式 B：Claude Code 内联

在 Claude Code / Gemini CLI 会话中，SKILL.md 指导 agent 自己管理 plan.json：

1. 收到用户需求后，先分析并创建 `plan.json`
2. 用 `Agent` tool 或 `Bash` 分派子任务给对应 agent
3. 每完成一个 story，读 plan.json → 更新状态 → 找下一个
4. 所有 stories 完成后，更新顶层 status 为 `"completed"`

#### 模式 C：acpx CLI 循环（类 Ralph）

外部 bash 脚本驱动，适合无人值守：

```bash
MAX_ITERATIONS=10
for i in $(seq 1 $MAX_ITERATIONS); do
  # 读 plan.json，找下一个 pending story
  NEXT=$(node -e "
    const p = require('./plan.json');
    const s = p.stories.filter(s => !s.passes)
      .sort((a,b) => a.priority - b.priority)[0];
    if (s) console.log(JSON.stringify(s));
    else console.log('DONE');
  ")
  [ "$NEXT" = "DONE" ] && echo "All stories completed" && break

  AGENT=$(echo "$NEXT" | jq -r '.agent')
  TASK=$(echo "$NEXT" | jq -r '.title + ": " + .description')
  SID=$(echo "$NEXT" | jq -r '.id')

  # 执行
  acpx --approve-all --timeout 120 "$AGENT" exec "$TASK"

  # 更新 plan.json（用 node 或 jq）
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('plan.json'));
    const s = p.stories.find(s => s.id === '$SID');
    s.passes = true;
    if (p.stories.every(s => s.passes)) console.log('ALL_COMPLETE');
    fs.writeFileSync('plan.json', JSON.stringify(p, null, 2));
  "
done
```

## 执行方法论层（Superpowers）

> 三层架构：编排（plan.json）→ 方法论（superpowers）→ 执行（agent）

每个 story 执行前，orchestrator 必须根据 story 类型选择正确的方法论，并**在 spawn 指令中明确要求 agent 遵循该方法论**。不是可选的建议，是强制执行的流程。

### 方法论路由表

| Story 类型 | methodology 值 | 方法论流程 | 说明 |
|---|---|---|---|
| 需求分析/架构设计 | `brainstorming → writing-plans` | 先 brainstorming 探索需求和方案，再 writing-plans 拆实施步骤 | 用于 `explore` / `deep` 类 story |
| 功能实现/编码 | `tdd` | RED→GREEN→REFACTOR 循环：先写测试，看它失败，再写最小实现 | 用于 `standard` / `quick` 类 story |
| Bug 修复 | `systematic-debugging → tdd` | 先 systematic-debugging 定位根因，再 TDD 修复 | 用于修复类 story |
| 重构 | `tdd` | 先补齐测试覆盖现有行为，再重构，保持绿灯 | 用于重构类 story |
| 文档/写作 | `none` | 直接执行 | 用于 `writing` 类 story |
| 任何 story 完成时 | `verification-before-completion` | 跑验证命令确认输出，再标 completed | **所有 story 完成前必须执行** |

### 三层架构流程

```
用户需求
    │
    ▼
┌─────────────────────────────┐
│  Layer 1: 编排 (plan.json)    │
│  创建 plan → 拆 stories       │
│  每个 story 标注 methodology   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Layer 2: 方法论 (superpowers) │
│  根据 methodology 字段选择：   │
│  - brainstorming              │
│  - writing-plans              │
│  - tdd                        │
│  - systematic-debugging       │
│  - verification               │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Layer 3: 执行 (agent)        │
│  按能力路由表分配 agent        │
│  按运行时路由策略选 runtime    │
└─────────────────────────────┘
```

### 在 spawn 指令中注入方法论

orchestrator 在 spawn agent 时，**必须在 task 描述中包含方法论要求**。不要期望 agent 自己知道要用什么方法论。

**示例：编码类 story（TDD）**
```
sessions_spawn({
  agentId: "codex",
  task: "实现用户 CRUD API。

**方法论要求：TDD（test-driven development）**
1. 先写失败测试（RED）
2. 写最小代码让测试通过（GREEN）
3. 重构（REFACTOR）
4. 完成前运行所有测试确认通过

不要跳过测试直接写实现。"
})
```

**示例：设计类 story（brainstorming → writing-plans）**
```
sessions_spawn({
  agentId: "claude",
  task: "设计博客系统架构。

**方法论要求：brainstorming → writing-plans**
1. 先探索需求边界和约束
2. 提出 2-3 种方案，推荐一种
3. 形成设计文档
4. 拆成可执行的实施计划

不要直接开始写代码。"
})
```

**示例：Bug 修复 story（systematic-debugging → TDD）**
```
sessions_spawn({
  agentId: "claude",
  task: "修复登录超时问题。

**方法论要求：systematic-debugging → TDD**
1. 先用 systematic-debugging 定位根因（不要猜，先收集证据）
2. 定位后，写一个能复现 bug 的失败测试
3. 最小修复让测试通过
4. 确认所有现有测试仍然通过"
})
```

### 完成验证（所有 story 必须）

**每个 story 标记 `completed` 之前，必须执行 verification-before-completion：**

1. 运行相关测试/构建命令，确认输出
2. 检查 acceptanceCriteria 是否全部满足
3. 只有验证通过才能更新 plan.json `passes: true`

```
story 执行完毕
    │
    ▼
运行验证命令（测试/构建/lint）
    │
    ├── 通过 → 检查 acceptanceCriteria → 全部满足 → passes: true
    │
    └── 失败 → 修复 → 重新验证（不要跳过直接标完成）
```

**红线：**
- ❌ agent 说"已完成"就直接标 passes: true — 必须有验证证据
- ❌ 跳过测试直接标完成 — 即使 agent 说"我已经手动验证了"
- ✅ 运行命令 → 看到绿灯 → 再标 passes: true

### Code Review（编码类 story 必须）

**每个编码类 story（methodology 含 `tdd`）验证通过后，必须 spawn 一个 reviewer agent 做 code review，通过后才能标 `passes: true`。**

```
story 验证通过
    │
    ▼
spawn reviewer agent（用 codex 或 claude）
    │
    ▼
review 结果？
    ├── 通过 → passes: true
    └── 不通过 → 原 agent 修复 → 重新验证 → 重新 review
```

**spawn review 指令模板：**
```
sessions_spawn({
  agentId: "codex",
  runtime: "subagent",
  task: "Review 以下代码变更（story S-002: 实现后端 API）。

检查：
1. 代码是否符合项目现有风格和约定
2. 是否有明显 bug、安全漏洞、性能问题
3. 测试覆盖是否充分
4. 命名和结构是否清晰

如果有问题，列出具体文件和行号，说明问题和建议修复方式。
如果没有问题，输出 REVIEW_PASSED。"
})
```

**规则：**
- 设计类（brainstorming）、文档类（none）story 跳过 code review
- reviewer agent 不能是执行该 story 的同一个 agent 实例（避免自己审自己）
- review 不通过最多重试 2 次，仍不通过则标 `"failed"` 并记录 notes

### 项目复盘（所有 stories 完成后自动执行）

**当 plan.json 所有 stories 都 `passes: true` 后，自动生成复盘追加到 plan.json。**

orchestrator 在标记项目 `status: "completed"` 之前，必须写入 `retrospective` 字段：

```json
{
  "status": "completed",
  "retrospective": {
    "timestamp": "2026-03-25T12:00:00Z",
    "summary": "博客系统开发完成，共 4 个 stories，全部通过",
    "metrics": {
      "totalStories": 4,
      "completedOnFirstTry": 3,
      "requiredReviewFixes": 1,
      "failedStories": 0
    },
    "lessons": [
      "S-002 的 API 设计在 review 时发现缺少分页，说明 brainstorming 阶段应更细致",
      "codex 处理前端组件效果良好，无需升级到 claude"
    ]
  }
}
```

**复盘内容：**
1. 执行摘要（完成率、重试次数）
2. 各 story 的 agent 选择是否合适
3. 方法论是否生效（TDD 是否真的提前发现了问题）
4. 下次可改进的点

## 运行时路由策略（关键）

根据任务类型自动选择最稳定的运行时：

| 任务类型 | 运行时 | 原因 |
|---|---|---|
| 所有任务（默认） | `acp` + `streamTo:"parent"` | 能力更强，默认首选 |
| ACP 失败时降级 | `subagent` | 兜底，可见性稳定但能力受限 |

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
│  文档、注释、简单文案修改                                      │
│  ─────────────────────────────────────────────────────────  │
│  trae (最快)                                                 │
│  - 文档与注释                                                 │
│  - 中文文案                                                   │
│  - 样板代码                                                   │
│  - 简单配置修改                                                │
└─────────────────────────────────────────────────────────────┘
```

## 类别路由表

| 类别 | 任务类型 | 首选 Agent | 备选 |
|---|---|---|---|
| **ultrabrain** | 复杂架构、深度推理 | claude | codex |
| **deep** | 多文件重构、复杂逻辑 | claude | codex |
| **visual-engineering** | 前端 UI、CSS、交互稿 | gemini | codex |
| **standard** | 常规开发、CRUD、前端实现 | codex | claude |
| **quick** | 文档、注释、简单文案 | trae | gemini |
| **writing** | 文档、注释、说明文 | gemini | codex |
| **explore** | 代码搜索、调研 | codex | gemini |

## Agent 特点对比

| 特性 | trae | codex | gemini | claude |
|---|---|---|---|---|
| **能力** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **速度** | ⚡⚡⚡ | ⚡⚡ | ⚡⚡ | ⚡ |
| **中文优化** | ✅ | ❌ | ✅ | ❌ |
| **复杂架构** | ❌ | ⚠️ | ⚠️ | ✅ |
| **前端实现** | ❌ | ✅ | ⚠️ | ✅ |
| **文档/注释** | ✅ | ⚠️ | ✅✅ | ✅ |
| **成本** | 低 | 中 | 中 | 高 |

## 使用模式

### 模式 0：默认 ACP（推荐）

```json
// 所有任务默认用 acp，不区分规划/编码
sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  mode: "run",
  streamTo: "parent",
  task: "分析需求，设计架构，输出实现计划"
})
sessions_yield({})

// 编码也用 acp
sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  mode: "run",
  streamTo: "parent",
  task: "实现后端 API"
})
// ACP 失败时按降级链路处理
```

### 模式 1：按能力选择单 agent

```json
// 复杂架构 → claude（默认 acp）
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

// 快速文档 → trae
sessions_spawn({
  runtime: "acp",
  agentId: "trae",
  mode: "run",
  streamTo: "parent",
  task: "补充 API 接口文档和代码注释"
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
  agentId: "codex",
  streamTo: "parent",
  task: "创建前端 UI 组件"  // standard 任务
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
复杂 → claude (acp), 中等 → codex (acp), 文档 → trae (acp)。
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
  agentId: "codex",
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
    ├── 文档/注释/小改 ──────────────────► trae (quick)
    │
    ├── 常规功能/API/前端 ────────────────► codex (standard)
    │
    ├── 架构设计/复杂重构 ──────────────► claude (deep)
    │
    └── 多模块项目 ─────────────────────► 并行分配
                                            │
                                            ├── 架构 → claude
                                            ├── 后端/前端 → codex
                                            └── 文档 → trae
```

## 实战示例

### 示例 1：创建博客系统

```
需求：创建一个博客系统，前端 React，后端 Node.js，带测试

Step 1: 创建 plan.json
{
  "project": "博客系统",
  "branchName": "feat/blog-system",
  "description": "创建博客系统，前端 React，后端 Node.js，带测试",
  "stories": [
    { "id": "S-001", "title": "设计架构", "acceptanceCriteria": ["输出数据模型", "输出 API 定义"], "priority": 1, "passes": false },
    { "id": "S-002", "title": "实现后端 API", "acceptanceCriteria": ["CRUD 可用", "测试通过"], "priority": 2, "passes": false },
    { "id": "S-003", "title": "创建前端组件", "acceptanceCriteria": ["页面可渲染", "测试通过"], "priority": 2, "passes": false },
    { "id": "S-004", "title": "编写集成测试", "acceptanceCriteria": ["端到端测试通过"], "priority": 3, "passes": false }
  ]
}

Step 2: 按 priority + methodology 执行
- S-001: brainstorming → writing-plans（先探索方案再拆步骤）
- S-002 + S-003: TDD 并行执行（先写测试再实现）
- S-004: TDD（补充集成测试）
- 每个 story 完成前: verification-before-completion

Step 3: 每完成一个 story，验证 → 更新 plan.json status
```

### 示例 2：快速文档

```
需求：补充 API 文档

分析：quick 任务 → trae

执行：
sessions_spawn({
  agentId: "trae",
  streamTo: "parent",
  task: "补充 API 接口文档和代码注释"
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

1. **先建 plan.json 再 spawn** — 没有 plan 不允许开始执行
2. **每个 story 必须标注 methodology** — spawn 指令中必须包含方法论要求，不要让 agent 自己决定用不用 TDD
3. **编码类 story 必须 TDD** — 先写测试再实现，没有例外
4. **每个 story 完成前必须验证** — 运行测试/构建确认通过，再标 `passes: true`
5. **每完成一个 story 立即更新 plan.json** — 不要攒着批量更新
6. **完成 story 后自动继续下一个** — 不要停下来问用户"需要继续吗"，直接执行下一个 `passes: false` 的 story。只有全部完成或被阻塞时才停
7. **默认用 acp，失败才降级 subagent** — 不要预判哪些任务该用 subagent
8. **ACP relay stall 时走兜底** — 按 Step 2→3→4→5 逐级降级，绝不黑洞等待
9. **不要用 trae 做编码实现** - trae 只用于文档、注释、简单文案，前端/后端实现用 codex
10. **不要用 claude 做简单任务** - 浪费资源，速度慢
11. **中文文档优先 trae / gemini** - trae 适合文档注释，gemini 适合 UI 表达和资料归纳
12. **Gemini 适合写和看，不适合扛主架构** - 更适合 visual-engineering、writing、轻调研
13. **并发控制** - 同时运行 2-4 个 agent 较合适
14. **权限** - 确保 `--approve-all` 或配置默认权限
15. **降级不恐慌** — relay stall 是可见性问题，不是执行问题，child 通常已完成

## 错误处理

| 问题 | 原因 | 解决 |
|---|---|---|
| ACP relay 只有 start+stall | 父级可见性链路断裂 | 按兜底流程 Step 3: sessions_history(childSessionKey) 回捞 |
| agent 输出质量差 | 能力不匹配 | 升级到更强 agent |
| 执行超时 | 任务太复杂 | 拆分任务或换 agent |
| 权限被拒 | 没有配置 | 加 `--approve-all` |
| spawn 失败 | agentId 错误 | 检查配置 |
| relay fallback 也无结果 | child 也失败 | 按兜底流程 Step 4→5 逐级降级 |
| agent 跳过 TDD 直接写代码 | spawn 指令中方法论要求不够明确 | 在 task 描述中加粗方法论要求，用"**必须**"而非"建议" |
| story 缺少 methodology 字段 | 创建 plan.json 时遗漏 | 按方法论路由表补全，编码类默认 `tdd`，设计类默认 `brainstorming → writing-plans` |
| agent 说"已完成"但没跑测试 | 未执行 verification | 不标 `passes: true`，要求 agent 先运行验证命令并输出结果 |

## 配置参考

### openclaw.json（关键，否则 sessions_spawn 无法找到 ACP agent）

```json
// ~/.openclaw/openclaw.json
{
  // 1. acp.allowedAgents 控制 sessions_spawn 能调用哪些 ACP agent
  //    注意：这和 agents.list 是两套独立系统，sessions_spawn 只看这里
  "acp": {
    "defaultAgent": "codex",
    "allowedAgents": ["claude", "codex", "trae", "gemini"]
  },

  // 2. acpx permissionMode 必须设为 approve-all
  //    默认值是 approve-reads，会导致 ACP agent 执行写/执行操作时被拒
  "plugins": {
    "entries": {
      "acpx": {
        "enabled": true,
        "config": {
          "permissionMode": "approve-all"
        }
      }
    }
  },

  // 3. agents.list 中注册持久化 ACP agent（可选，减少冷启动延迟）
  "agents": {
    "list": [
      { "id": "claude", "runtime": { "type": "acp", "acp": { "agent": "claude", "backend": "acpx", "mode": "persistent" } } },
      { "id": "codex",  "runtime": { "type": "acp", "acp": { "agent": "codex",  "backend": "acpx", "mode": "persistent" } } },
      { "id": "trae",   "runtime": { "type": "acp", "acp": { "agent": "trae",   "backend": "acpx", "mode": "persistent" } } },
      { "id": "gemini", "runtime": { "type": "acp", "acp": { "agent": "gemini", "backend": "acpx", "mode": "persistent" } } }
    ]
  }
}
```

**常见问题：sessions_spawn 只看到 `main`，看不到其他 agent**
- 原因：`acp.allowedAgents` 未配置，或未重启 OpenClaw
- 修复：加上 `acp.allowedAgents` 并重启：`pkill -f openclaw && openclaw serve --daemon`

**常见问题：ACP agent 执行时报 Permission denied**
- 原因：`permissionMode` 默认是 `approve-reads`，写/执行操作被拒
- 修复：设置 `plugins.entries.acpx.config.permissionMode: "approve-all"`

### ~/.acpx/config.json

```json
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
