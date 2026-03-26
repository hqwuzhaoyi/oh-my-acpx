# 使用模式

## 目录

- [模式 0：默认 ACP（推荐）](#模式-0默认-acp推荐)
- [模式 1：按能力选择单 agent](#模式-1按能力选择单-agent)
- [模式 2：并行多任务](#模式-2并行多任务)
- [模式 3：瀑布式多轮编排](#模式-3瀑布式多轮编排)
- [模式 4：对比验证](#模式-4对比验证)
- [三种运行环境](#三种运行环境)

---

## 模式 0：默认 ACP（推荐）

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

## 模式 1：按能力选择单 agent

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

## 模式 2：并行多任务（按能力分配）

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

## 模式 3：瀑布式（多轮编排）

> 单 turn 无法完成"规划 + 等待 + 执行"的完整流程。
> 必须使用**多 turn 编排**：持久 session 或自调度循环。

**方式 A：持久 session（推荐）**

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

## 模式 4：对比验证（同任务多 agent）

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

---

## 三种运行环境

### 环境 A：OpenClaw Session（推荐）

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

### 环境 B：Claude Code 内联

在 Claude Code / Gemini CLI 会话中，SKILL.md 指导 agent 自己管理 plan.json：

1. 收到用户需求后，先分析并创建 `plan.json`
2. 用 `Agent` tool 或 `Bash` 分派子任务给对应 agent
3. 每完成一个 story，读 plan.json → 更新状态 → 找下一个
4. 所有 stories 完成后，更新顶层 status 为 `"completed"`

### 环境 C：acpx CLI 循环（类 Ralph）

外部 bash 脚本驱动，适合无人值守：

```bash
MAX_ITERATIONS=10
for i in $(seq 1 $MAX_ITERATIONS); do
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

  acpx --approve-all --timeout 120 "$AGENT" exec "$TASK"

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
