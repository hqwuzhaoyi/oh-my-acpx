# Oh My ACPX — Research TODO

基于[运行时稳定性调研报告](runtime-stability-research-report-2026-03-22.md)和测试结果，以下是三个最有价值的研究方向。

---

## TODO 1: ACP Relay Stall 根因定位与最小复现

**优先级**: P0
**状态**: 待启动
**关联**: 上游 #49782, #46795, #45205

### 背景

测试发现 relay stall 是**间歇性**的——T2（ACP relay 可见性）通过了（`:done` 事件正常），但历史日志 `f1aa6c5b` 确认了 stall（只有 `:start` + `:stall`）。这说明问题不是"总坏"，而是在特定条件下触发。

### 研究目标

1. **最小复现脚本**：找到稳定触发 relay stall 的条件组合
2. **事件级追踪**：在 OpenClaw gateway → acpx plugin → acpx CLI → agent 链路上打点，定位事件丢失的具体环节
3. **变量隔离**：逐一排查以下因素对 stall 的影响
   - agent 类型（claude vs codex vs trae）
   - 任务复杂度（简单回复 vs 复杂推理）
   - 并发数（单任务 vs 多任务并行）
   - acpx 版本（0.3.1 vs 更早版本）
   - 网络/进程时序（gateway 负载、进程启动顺序）

### 方法

```bash
# 批量 A/B 测试脚本（跑 20 轮，统计 stall 率）
for i in $(seq 1 20); do
  openclaw agent --agent claude \
    --message "sessions_spawn runtime:acp agentId:claude streamTo:parent task:'Reply: TEST_$i'" \
    --json --timeout 120 > "test-results/relay-ab-$i.json" 2>&1
  sleep 5
done

# 分析 stall 率
ls ~/.openclaw/agents/claude/sessions/*.acp-stream.jsonl | while read f; do
  node scripts/relay-fallback.js --stream-log "$f" 2>/dev/null | python3 -c "
    import json,sys; d=json.load(sys.stdin); print(d['diagnosis'])"
done | sort | uniq -c
```

### 交付物

- [ ] 最小复现脚本 `scripts/test-relay-stall-repro.sh`
- [ ] Stall 率统计报告（N=20+，按变量分组）
- [ ] 事件追踪图：标注"事件在哪个环节丢失"
- [ ] 如果定位到 acpx plugin 层：提交上游 PR 或 workaround

---

## TODO 2: 多轮编排（解决 T6 单 turn 限制）

**优先级**: P1
**状态**: 待启动
**关联**: T6 测试结果

### 背景

T6 测试显示：在单次 `openclaw agent` turn 中，先 subagent 规划再 acp 编码的两步流程——Step 1 成功但 Step 2 未执行，因为 `sessions_yield` 等待 + 第二次 spawn 超出了单 turn 时间窗口。

这是生产环境的真实限制：瀑布模式（先规划后执行）需要跨 turn 状态传递。

### 研究目标

1. **持久 session 编排**：利用 `mode: "session"` 而非 `mode: "run"`，保持 orchestrator session 存活跨越多 turn
2. **session 恢复**：验证 `sessions_history` + `session/load` 能否在新 turn 中恢复上下文
3. **自驱动循环**：探索 orchestrator 自己给自己发消息触发下一步（类似 cron/scheduled agent turn）

### 方法

```bash
# 方案 A: 持久 session + 多次 agent turn
openclaw agent --agent claude --session-id orchestrator-001 \
  --message "Step 1: 用 subagent 规划，完成后告诉我" --json

# 等 Step 1 完成后
openclaw agent --agent claude --session-id orchestrator-001 \
  --message "Step 1 已完成，现在执行 Step 2: 用 acp 编码" --json

# 方案 B: agent 自调度（探索性）
# 在 SKILL.md 中指导 agent: 如果当前 turn 无法完成所有步骤，
# 输出 "NEXT_STEP: <描述>"，由外部 cron/hook 触发下一个 turn
```

### 交付物

- [ ] 多轮编排 POC 脚本 `scripts/test-multi-turn-orchestration.sh`
- [ ] 对比：持久 session vs 多次独立 turn vs 自调度
- [ ] 更新 SKILL.md 支持跨 turn 状态传递
- [ ] 更新 examples/waterfall-task.md 为可实际执行的多轮示例

---

## TODO 3: sessions_history 回捞路径的端到端验证

**优先级**: P1
**状态**: 待启动
**关联**: SKILL.md 兜底流程 Step 3

### 背景

SKILL.md 的兜底流程 Step 3 指导 agent 用 `sessions_history(childSessionKey)` 从 child session 回捞结果。但这条路径**从未被端到端验证过**——我们只验证了：
- `relay-fallback.js` 能从 acpx 的 `.stream.ndjson` 文件中恢复文本（T4 通过）
- `sessions_history` API 本身存在且可调用

缺失的验证：orchestrator agent 在实际对话中，当 relay stall 发生时，能否成功调用 `sessions_history`、解析返回值、并将结果呈现给用户。

### 研究目标

1. **API 可用性**：`sessions_history(childSessionKey)` 在 relay stall 场景下是否返回完整 assistant 输出
2. **childSessionKey 传递**：验证 `sessions_spawn` 返回的 `childSessionKey` 格式，以及它在 yield 超时后是否仍可用
3. **agent 执行能力**：orchestrator agent 是否有权限调用 `sessions_history`（工具是否在 allow list 中）
4. **结果质量**：回捞的内容是否包含 agent 的完整输出（不只是最后一条消息）

### 方法

```bash
# Step 1: 制造一个 stall 场景（用长任务增加 stall 概率）
openclaw agent --agent claude \
  --message "Use sessions_spawn with runtime:acp, agentId:claude, streamTo:parent.
Task: Write a 500-word essay about ACP protocol design.
After yield, if the result shows stall or no output:
1. Print the childSessionKey from spawn result
2. Call sessions_history(childSessionKey)
3. Print the recovered assistant text
4. Label it as FALLBACK_RECOVERY" \
  --json --timeout 180

# Step 2: 检查 agent 是否执行了回捞
grep -l "FALLBACK_RECOVERY" test-results/*.json

# Step 3: 对比 sessions_history 返回内容 vs acpx stream log
```

### 交付物

- [ ] 端到端验证脚本 `scripts/test-sessions-history-recovery.sh`
- [ ] sessions_history API 返回格式文档
- [ ] 如果 API 不可用或返回不完整：提出替代方案并更新 SKILL.md
- [ ] 验证报告：stall 场景下的回捞成功率
