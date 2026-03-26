---
name: acp-orchestrator
description: "Use when user requests multi-agent task execution, parallel coding, or task decomposition across agents. Triggers: '用多个agent', '并行处理', '分派任务', 'multi-agent', 'parallel agents', 'orchestrate', 'oh my acpx', '帮我拆任务', 'dispatch to agents'."
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
3. **执行模式 vs 诊断模式必须分清**：
   - **执行模式** keywords：`继续`、`按 plan 往下做`、`推进下一个 story`、`直接执行`
     → 读取 plan.json → 找最高优先级 `passes: false` story → 直接执行
   - **诊断模式** keywords：`为什么没继续`、`哪里出错`、`看日志`、`调研原因`
     → 只分析并给出原因，不要自动推进 story
4. **自动继续，不要停** — 执行模式下完成一个 story 后，立即执行下一个 `passes: false` 的 story，不要等用户确认。只有项目完成、被阻塞、或不可恢复错误才允许停
5. **plan.json 存项目根目录** — 所有模式共用同一个文件

### 执行检查点（每次回复前强制自检）

**回复前必须满足至少一项：**

- [ ] 本 turn 已调用 `sessions_spawn` 执行下一个 story
- [ ] 本 turn 已调用 `openclaw system event` 触发下一轮
- [ ] 所有 stories 都 `passes: true`（项目完成）
- [ ] 当前 story 被阻塞且已在 notes 中记录原因

**都不满足 → 你正在违规（只汇报不执行）→ 立即调用 `sessions_spawn` 或 `system event`**

### 自动循环

**红线：**
- ❌ "S-001 已完成，建议下一步做 S-002，需要我继续吗？" — 不要问，直接做
- ❌ 完成分析后只输出建议而不执行 — 你是执行者，不是顾问
- ❌ agent 做完了直接跳到下一个，用户不知道发生了什么 — 必须先输出摘要
- ✅ 输出摘要 → 立即开始下一个（摘要和继续在同一条回复中）

### Story 完成汇报（每个 story 必须）

每个 story 完成后，输出结构化摘要：

```
✅ S-001: 设计博客系统架构
  agent: claude | runtime: acp | 耗时: ~45s
  产出:
    - 输出了数据模型设计（User, Post, Comment 三表）
    - 定义了 12 个 REST API 接口
  文件变更: docs/architecture.md (新增)
  验证: acceptanceCriteria 2/2 通过
  ──────────────────────────
  继续 S-002: 实现后端 API...
```

从 `sessions_yield` 返回的实际产出中提取，不要编造。摘要精简版写入 plan.json `notes` 字段。

### 跨 Turn 自调度（脚本强制执行）

在飞书等聊天场景中，每条用户消息只触发一个 agent turn。**每个 turn 结束前，必须运行自调度脚本：**

```bash
node ~/.agents/skills/acp-orchestrator/scripts/self-schedule.js [plan.json路径]
```

| 输出 | 含义 | 后续动作 |
|---|---|---|
| `NO_PLAN` | 没有 plan.json | 跳过 |
| `ALL_DONE` | 所有 stories 完成 | 正常结束 |
| `TRIGGERED` | 已触发下一轮 | 告知用户 |
| `TRIGGER_FAILED` | 触发失败 | 手动执行 `openclaw system event --text "继续执行 plan.json" --mode now` |

**硬性规则：**
1. 每个 turn 结束前必须运行自调度脚本
2. 不要自行判断"是否需要触发" — 让脚本判断

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
      "acceptanceCriteria": ["输出数据模型设计", "输出 API 接口定义"],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

agent/methodology/runtime 等由 orchestrator 在执行时根据路由表自动决定，不写进 plan.json。

### 使用流程

```
用户请求
    │
    ▼
分析需求 → 拆分 stories
    │
    ▼
创建 plan.json（写入项目根目录）
    │
    ▼
┌─► 读 plan.json → 找最高优先级 passes: false 的 story
│       │
│       ▼
│   按 methodology 执行 story → 验证 → 输出摘要
│       │
│       ▼
│   摘要写入 notes + passes: true
│       │
│       ▼
│   还有 passes: false 的 stories？
│       │
└───── 是 ──┘
        │
        否 → 生成 retrospective → 项目完成
```

运行环境（OpenClaw Session / Claude Code / acpx CLI）详见 `references/usage-modes.md`。

## 执行方法论层（Superpowers）

> 三层架构：编排（plan.json）→ 方法论（superpowers）→ 执行（agent）

每个 story 执行前，orchestrator 根据 story 类型选择方法论，并在 spawn 指令中明确要求 agent 遵循。

### 方法论路由表

| Story 类型 | methodology | 流程 |
|---|---|---|
| 需求分析/架构设计 | `brainstorming → writing-plans` | 先探索方案再拆步骤 |
| 功能实现/编码 | `tdd` | RED→GREEN→REFACTOR |
| Bug 修复 | `systematic-debugging → tdd` | 先定位根因再 TDD 修复 |
| 重构 | `tdd` | 先补测试再重构 |
| 文档/写作 | `none` | 直接执行 |
| 任何 story 完成时 | `verification-before-completion` | 跑验证确认输出 |

### 在 spawn 中注入方法论

**必须在 task 描述中包含方法论要求**，不要期望 agent 自己知道。

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

更多示例（设计类、Bug 修复类）见 `references/examples.md`。

### 完成验证（所有 story 必须）

每个 story 标记 `passes: true` 之前：
1. 运行测试/构建命令，确认通过
2. 检查 acceptanceCriteria 是否全部满足
3. 只有验证通过才能更新 plan.json

❌ agent 说"已完成"就直接标 passes: true — 必须有验证证据
✅ 运行命令 → 看到绿灯 → 再标 passes: true

### Code Review（编码类 story 必须）

编码类 story 验证通过后，spawn reviewer agent 做 code review：
- reviewer 不能是执行该 story 的同一个 agent（避免自己审自己）
- 不通过 → 修复 → 重新验证 → 重新 review（最多 2 次）
- 设计类、文档类 story 跳过 review

### 项目复盘

所有 stories 完成后，写入 `retrospective` 字段：执行摘要、agent 选择是否合适、方法论效果、改进点。

## 运行时路由策略

| 任务类型 | 运行时 | 原因 |
|---|---|---|
| 所有任务（默认） | `acp` + `streamTo:"parent"` | 能力更强 |
| ACP 失败时降级 | `subagent` | 兜底 |

### 降级链路

```
acp + streamTo:parent → 75s 无输出 → child 结果回捞 → direct acpx → subagent
```

完整 5 步兜底流程见 `references/acp-fallback.md`。降级不恐慌 — relay stall 是可见性问题，child 通常已完成。

## Agent 路由

按类别自动选 agent。详细能力分层和对比见 `references/agent-routing.md`。

| 类别 | 首选 | 备选 |
|---|---|---|
| ultrabrain / deep | claude | codex |
| standard / explore | codex | claude / gemini |
| visual-engineering / writing | gemini | codex |
| quick | trae | gemini |

## 使用模式

默认用 ACP（模式 0）：`sessions_spawn({ runtime: "acp", streamTo: "parent", ... })`。

| 模式 | 用途 |
|---|---|
| 0: 默认 ACP | 所有任务 |
| 1: 按能力选 agent | 单 agent 按类别路由 |
| 2: 并行多任务 | 独立任务同时 spawn |
| 3: 瀑布式 | 持久 session 或自调度 |
| 4: 对比验证 | 同任务多 agent 对比 |

完整代码示例见 `references/usage-modes.md`。

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

## 注意事项

1. **先建 plan.json 再 spawn** — 没有 plan 不允许开始执行
2. **编码类 story 必须 TDD + 验证** — 先写测试再实现，验证通过再标完成
3. **完成 story 后自动继续** — 不要停下来问用户，直接执行下一个
4. **默认 acp，失败才降级 subagent** — 不要预判
5. **trae 只做文档/注释** — 编码实现用 codex
6. **每个 turn 结束前运行自调度脚本** — 确保不会停在半路

## 配置与排错

`openclaw.json` 必须配置 `acp.allowedAgents` 和 `permissionMode: "approve-all"`，否则 sessions_spawn 无法找到 ACP agent。
完整配置模板和常见错误排查见 `references/config.md`。

## 实战示例

见 `references/examples.md`（plan.json 完整生命周期示例）和 `examples/` 目录。

## References

| 文件 | 内容 |
|---|---|
| `references/usage-modes.md` | 5 种使用模式代码示例 + 3 种运行环境 |
| `references/agent-routing.md` | Agent 能力分层、类别路由表、特点对比 |
| `references/acp-fallback.md` | ACP relay stall 5 步兜底流程 |
| `references/config.md` | openclaw.json / acpx 配置模板 + 错误排查 |
| `references/examples.md` | 实战示例 + spawn 方法论注入示例 |
