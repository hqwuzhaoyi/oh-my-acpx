# ACP 兜底操作流程

当使用 `runtime: "acp"` 时，按以下步骤处理 relay stall：

## Step 1: spawn 并 yield

```json
const spawnResult = sessions_spawn({
  runtime: "acp", agentId: "<agent>", mode: "run",
  streamTo: "parent", parentUpdates: "notify", task: "<task>"
})
sessions_yield({ message: "等待 agent 完成" })
```

## Step 2: 检查 yield 结果

- 如果 `sessions_yield` 正常返回了 agent 输出 → 直接使用，流程结束
- 如果返回显示 stall / 无输出 / 超时 → 进入 Step 3

## Step 3: child 结果回捞

读取 spawn 返回的 `streamLogPath`（位于 `~/.openclaw/agents/<agent>/sessions/<id>.acp-stream.jsonl`）：
- 检查是否有 `:done` 事件 → 如有，说明 relay 其实成功了，提取结果
- 如果只有 `:start` + `:stall` → child 可能已完成但 relay 断了
- 用 `sessions_history(childSessionKey)` 拉取 child session 的完整对话历史
- 如果拿到了 assistant 输出 → 使用它作为结果，告知用户"已通过兜底回捞获取结果"

## Step 4: direct acpx 降级（Step 3 也无结果时）

```bash
acpx --approve-all --timeout 90 <agent> exec "<task>"
```

## Step 5: subagent 降级（Step 4 也失败时）

```json
sessions_spawn({ runtime: "subagent", agentId: "<agent>", task: "<task>" })
```

注意：subagent 降级后可能只能产出方案，不直接执行代码改动。

## 诊断工具（人工调试用）

```bash
# 一次性诊断
node scripts/relay-fallback.js --stream-log <path>
# 实时监控
node scripts/relay-fallback.js --watch --stream-log <path> --timeout 75
# 路由查询
node scripts/runtime-router.js --category <category>
```

这些脚本仅用于人工调试，orchestrator agent 不依赖它们。
