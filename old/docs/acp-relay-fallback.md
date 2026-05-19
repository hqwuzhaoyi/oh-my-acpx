# ACP Relay Fallback (streamTo=parent stall)

When `sessions_spawn({ runtime: "acp", streamTo: "parent" })` shows only:

- `Started <agent> session ...`
- `<agent> has produced no output for 60s ...`

but the child actually completes, use this fallback.

## 推荐：Watch 模式（自动兜底）

在 spawn 后立即启动 watch，自动处理超时：

```bash
node scripts/relay-fallback.js --watch --stream-log <streamLogPath> --timeout 75
```

Watch 模式会：
1. 每 2s 检查 stream log 状态
2. 每 15s 输出进度信息
3. 如果收到 `done` / `assistant_delta` → 正常结束
4. 如果超时 → 自动从 child session log 回捞结果
5. 输出 `fallback_success`（有结果）或 `fallback_no_child_result`（需进一步降级）

### 返回值

```json
{
  "status": "fallback_success",
  "childRecovery": {
    "found": true,
    "messageCount": 5,
    "hasEndTurn": true,
    "text": "..."
  },
  "action": "Use childRecovery.text as the agent result. Relay to parent/user."
}
```

## 一次性诊断模式

```bash
node scripts/relay-fallback.js --stream-log <streamLogPath>
```

If output says `diagnosis: relay_stalled_without_terminal_event`, continue with manual recovery.

## 手动 child 结果回捞

Use the returned `childSessionKey`:

- `sessions_history(childSessionKey)`
- aggregate latest assistant messages
- return to parent session

## 验证 child 完成（可选）

```bash
grep -R "\"stopReason\":\"end_turn\"" ~/.acpx/sessions/*.stream.ndjson | tail -5
```

## 降级链路

```
acp + streamTo:parent (relay-fallback --watch)
    ↓ fallback_no_child_result
direct acpx: acpx --approve-all --timeout 90 <agent> exec "<task>"
    ↓ 也失败
subagent: sessions_spawn({ runtime: "subagent" })（仅产出方案）
```

## 结构化遥测

所有 fallback 事件自动写入 `~/.openclaw/telemetry/relay-fallback.ndjson`：

| 事件 | 含义 |
|---|---|
| `relay_watch_start` | watch 模式启动 |
| `relay_completed` | relay 正常完成 |
| `relay_stall_detected` | 检测到 relay stall |
| `fallback_success` | 从 child 成功回捞结果 |
| `fallback_no_child_result` | child 也没有结果，需进一步降级 |

## 上游跟踪

- #46795 ACP sessions_spawn streamTo=parent stalls
- #45205 ACP child run completes, but parent relay receives no progress/completion
- #37869 accepted but never closes loop
- #40693 ACP sessions never trigger auto-announce
- #49782 RFC: ACP completion relay unified approach
- OpenClaw 2026.2.25: ACP/client final-message delivery fix (已发布)
- Claude Code v2.1.81: background agent task polling race fix (已发布)

---

## 关键认知

- 这是**可见性链路问题**，不是执行链路问题
- Child 通常已成功完成，只是 parent 没收到通知
- 混合策略（subagent 规划 + acp 编码 + 强制兜底）是当前最务实方案
