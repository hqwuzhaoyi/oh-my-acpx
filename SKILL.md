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
6. **按动作分段输出** — 每完成一个工具调用或逻辑步骤就输出，每段必须有新信息，禁止重复改写

## 输出分段规则（Output Segmentation）

> **问题：** Agent 要么一次输出2000+字导致消息发送失败，要么把同一内容重复3遍。

### 核心规则

**按动作分段，不按长度：**
- ✅ 每完成一个工具调用就输出进度
- ✅ 每发现重要信息就报告
- ❌ 不要把所有工作做完再一次性输出
- ❌ 不要把同一内容改写多遍

**每段必须有新信息：**
- ✅ "Checking plan.json... found S-003B needs work"
- ✅ "Reading DirectPurchaseForm... identified 3 missing fields"
- ❌ "S-003B needs work" → "Previously did S-003B" → "To clarify: S-003B status"（重复3次）

**长度限制：**
- 简单回答：50-200字，1段
- 复杂任务：100-300字/段，多段
- 硬性上限：500字/段

### 自检清单（输出前必问）

1. "这段有新信息吗？" — 没有 → 不要输出
2. "我刚完成了一个动作吗？" — 是 → 可以输出
3. "我在重复之前说过的话吗？" — 是 → 停止，继续工作

### 好坏对比

**❌ 坏例子1：一次性输出2000字**
```
[读文件 + 分析 + 修改 + 验证 + 总结] → 输出一大段
结果：消息发送失败，打印到日志
```

**❌ 坏例子2：重复改写**
```
用户："有安排agent吗？"
段1："有，做了S-003A和旧版S-003B，新版还没做"
段2："也就是说，agent处理过，但新方案还没派"
段3："更准确地说，旧方案做了，新方案plan改了"
结果：同一信息说3遍，浪费时间
```

**✅ 好例子1：简单问题直接回答**
```
用户："有安排agent吗？"
输出："是的，已安排过。S-003A完成，S-003B做了旧方案。新方案plan已更新，需要我按新拆法执行吗？"
```

**✅ 好例子2：复杂任务分段报告**
```
输出1："Checking auth flow... found issue in token validation"
[tool: read auth.js]
输出2："Token expiry check missing. Fixing now..."
[tool: edit auth.js]
输出3："Fixed. Running tests..."
[tool: npm test]
输出4："Tests pass. Bug resolved."
```

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

agent/methodology/runtime 等由 orchestrator 在执行时根据路由表自动决定，不写进 plan.json。运行环境（OpenClaw Session / Claude Code / acpx CLI）详见 `references/usage-modes.md`。

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

### 完成验证与结构化评估

每个 story 标记 `passes: true` 之前，必须通过两层验证：

**第一层：客观验证（所有 story）** — 运行测试/构建命令，检查 acceptanceCriteria 全部满足。❌ agent 说"已完成"不算，✅ 看到绿灯才能进入第二层。

**第二层：结构化评估（编码类/设计类）** — spawn 独立 evaluator agent（不能是执行该 story 的同一个 agent），按维度 1-5 打分：

| Story 类型 | 评估维度 |
|---|---|
| 功能实现 | 正确性(40%) + 代码质量(30%) + 边界处理(20%) + 可维护性(10%) |
| 架构设计 | 合理性(35%) + 可扩展性(25%) + 简洁性(25%) + 风险识别(15%) |
| Bug 修复 | 根因准确(40%) + 修复完整性(30%) + 回归风险(20%) + 测试覆盖(10%) |
| 重构 | 行为保持(40%) + 结构改善(30%) + 测试覆盖(20%) + 简洁性(10%) |

**evaluator spawn 指令必须包含反宽松提示：**
> "你的职责是找问题，不是夸奖。如果你觉得'还行'，大概率应该打 3 不是 4。宁可严格导致返工，也不要放过有问题的代码。"

**评估结果处理：**
- 加权总分 >= 3.0 → PASS → 标记 passes: true
- 加权总分 < 3.0 → FAIL → 将评估反馈注入下一轮 task，重新 spawn 实现 agent 修复
- 修复后重新评估，最多 2 轮（第 3 轮强制 PASS，在 notes 中记录遗留问题）
- 文档类 story 跳过第二层评估

### 迭代精炼（高风险 story 专用）

> 灵感来源：Generator-Evaluator 迭代模式。普通 story 单次执行即可，高风险 story 通过多轮 generate→evaluate 循环显著提升质量。

#### 何时启用

在 plan.json story 中添加 `"iterative": true`（满足任一条件即标记）：

| 条件 | 示例 |
|---|---|
| 核心架构决策，影响后续所有 story | 数据模型设计、认证架构 |
| 用户明确要求高质量 | "这个要做好"、"仔细设计" |
| 涉及 3+ 文件的复杂变更 | 大规模重构 |
| 之前同类 story 评估不通过 | 第二次尝试 |

#### 迭代流程

1. 按正常方法论 spawn 实现 agent
2. spawn evaluator 做结构化评估（见上节）
3. 总分 >= 4.0 → 完成 | 3.0-4.0 → 再迭代一轮 | < 3.0 → 再迭代
4. 最多 3 轮（ACP 超时和成本约束）
5. 第 2 轮分数没有提升 → 停止，接受当前结果
6. 每轮评估反馈必须具体：不是"做得更好"，而是"第 47 行缺少 timeout case"

#### plan.json 扩展字段（可选，向后兼容）

```json
{
  "iterative": true,
  "iterationCount": 0,
  "lastScore": null
}
```

### 验收契约协商（编码类 story 推荐）

> 问题：orchestrator 写的 acceptanceCriteria 可能太模糊，实现 agent 按自己理解做完后才发现偏差。

#### 流程（在正式实现前，轻量级确认）

```
sessions_spawn({
  agentId: "<agent>",
  task: "在开始实现之前，先确认你对以下 story 的理解：
    Story: {title}
    acceptanceCriteria: {criteria}

    请回答：
    1. 你打算怎么实现？（1-2 句话）
    2. acceptanceCriteria 是否有遗漏或模糊？如有，列出补充建议
    3. 预计涉及哪些文件？
    4. 有什么风险或依赖？

    只回答以上问题，不要开始写代码。"
})
```

orchestrator 审查回复：理解正确 → 更新 criteria（如有补充）→ spawn 正式实现；理解偏差 → 修正后重新确认（最多 1 轮）。

#### 跳过条件

- quick 类 story（文档、注释）
- acceptanceCriteria 已含文件路径或函数签名
- 同一 agent 刚完成了相关 story，已有上下文

### 自适应复杂度（Adaptive Complexity）

> 原则：harness 复杂度应匹配任务难度。简单任务加太多流程是浪费，复杂任务流程不够会出质量问题。

| 等级 | 判断标准 | 执行流程 |
|---|---|---|
| **L1 简单** | 单文件改动、文档、配置、注释 | 直接执行 → 客观验证 → 完成 |
| **L2 常规** | 标准 CRUD、常规功能、测试编写 | 方法论执行 → 客观验证 → 结构化评估 → 完成 |
| **L3 复杂** | 多文件变更、架构决策、复杂重构 | 契约协商 → 方法论执行 → 结构化评估 → 完成 |
| **L4 关键** | 核心架构、高风险、用户明确要求高质量 | 契约协商 → 迭代精炼（最多 3 轮）→ 完成 |

**判断规则：**
- 文档/注释/配置 → L1
- acceptanceCriteria <= 2 条且不涉及多文件 → L1
- 标准功能实现 → L2
- acceptanceCriteria >= 4 条或涉及 3+ 文件 → L3
- `"iterative": true` 或核心架构 → L4
- 不确定时默认 L2

复杂度等级也影响 agent 选择：L1 → trae/codex，L2 → codex，L3 → codex/claude，L4 → claude。

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

### Stall 检测与自动恢复

ACP session 可能 stall（60s+ 无输出）但不会自动结束。orchestrator 需要主动检测并恢复。

**检测方式：运行 stall-detector 脚本**

```bash
# 单次检查（plan.json 超过 120s 无变化则触发恢复）
node ~/.agents/skills/acp-orchestrator/scripts/stall-detector.js /path/to/plan.json

# 持续监控（每 60s 检查，适合长时间任务）
node ~/.agents/skills/acp-orchestrator/scripts/stall-detector.js /path/to/plan.json --watch

# 自定义超时阈值
node ~/.agents/skills/acp-orchestrator/scripts/stall-detector.js /path/to/plan.json --timeout 180
```

| 输出 | 含义 |
|---|---|
| `HEALTHY` | plan.json 有进展，无需干预 |
| `STALLED` | 超时无进展，已触发 system event 恢复 |
| `STALLED_MAX` | 已恢复 3 次仍无进展，需人工干预 |
| `ALL_DONE` | 所有 stories 完成 |

**自动恢复逻辑：**
- 检测 plan.json 的 `passes` 和 `notes` 是否有变化
- 超过阈值无变化 → 发送 `openclaw system event` 要求继续执行
- 最多自动恢复 3 次，避免死循环

**system event 触发的 spawn 限制：**
通过 `system event` 触发的 turn 没有飞书 channel context，spawn 时**不能**用 `thread:true` 或 `mode:"session"`，否则会报错。必须用：
```json
sessions_spawn({ runtime: "acp", agentId: "<agent>", mode: "run", streamTo: "parent", task: "..." })
```

## Feishu 场景限制（重要）

> Feishu group chat 有平台限制，不支持 ACP thread 绑定。违反这些规则会导致 agent 陷入无限轮询死循环，不发任何消息。

### 禁止事项

- ❌ `thread: true` — Feishu group chat 不支持，报错 "Thread bindings are unavailable for feishu"
- ❌ `mode: "session"` — 需要 thread 绑定，同样不支持
- ❌ 无限轮询等待 ACP 结果 — ACP session 卡住时会导致每分钟轮询 plan.json 但永远不发消息

### 必须这样 spawn

```json
sessions_spawn({
  runtime: "acp",
  agentId: "<agent>",
  mode: "run",
  thread: false,
  streamTo: "parent",
  task: "..."
})
```

### 超时兜底（必须执行）

ACP session spawn 后，**不要无限等待**。必须有明确的超时兜底：

```
1. spawn ACP session（timeoutSeconds 建议 300-600）
2. 等待结果，最多等 75s
3. 75s 无输出 → 主动读取 child session history 获取结果
4. 读不到结果 → 直接告知用户"分析进行中，稍后回复"并结束本 turn
5. 绝不进入轮询循环
```

**红线：**
- ❌ spawn 后每隔1分钟轮询 plan.json 等变化 — 这是死循环
- ❌ `dispatch complete (replies=0)` 后什么都不发 — 必须给用户一个状态更新
- ✅ 超时后主动读 sessions_history 拿结果
- ✅ 拿不到结果就告知用户当前状态，结束 turn

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

## Agent 路由

1. **先建 plan.json 再 spawn** — 没有 plan 不允许开始执行
2. **编码类 story 必须 TDD + 验证** — 先写测试再实现，验证通过再标完成
3. **完成 story 后自动继续** — 不要停下来问用户，直接执行下一个
4. **默认 acp，失败才降级 subagent** — 不要预判
5. **trae 只做文档/注释** — 编码实现用 codex
6. **每个 turn 结束前运行自调度脚本** — 确保不会停在半路
7. **评估与实现必须分离** — 实现 agent 不能评估自己的产出：
   - 客观验证（跑测试）：实现 agent 自己可以做
   - 结构化评估（打分）：必须 spawn 不同 agent
   - acceptanceCriteria 判断：orchestrator 独立判断，不问实现 agent "你觉得满足了吗"
   - 实现 agent 声称"所有 criteria 已满足"时，orchestrator 必须独立验证，不能直接采信

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
