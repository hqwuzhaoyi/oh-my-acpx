# Waterfall Task Example — 多轮编排

## 需求
重构遗留的用户认证系统，支持多种登录方式

## 分析
- 复杂重构，需要先规划后执行
- 单 turn 无法完成"规划 + 等待 + 执行"的完整流程（T6 验证结论）
- 需要跨 turn 编排

> **瀑布模式：** 先规划 → 后执行（跨 turn）

## 已验证的方案

### 方案 A：持久 session（推荐）

通过 `--session-id` 复用同一 session，agent 自动保持跨 turn 上下文。

```bash
SESSION_ID="waterfall-auth-refactor-$(date +%s)"

# ── Turn 1：规划阶段 ──
openclaw agent --agent claude --session-id "$SESSION_ID" \
  --message "分析现有认证系统，设计重构方案，支持：
1) 邮箱密码 2) 手机验证码 3) OAuth (微信/Google/GitHub)。
输出详细的实现计划，列出每个子任务及推荐的 agent。
完成后输出 PLAN_COMPLETE。" \
  --json --timeout 120

# ── Turn 2：执行阶段（agent 已知 Turn 1 的规划内容）──
openclaw agent --agent claude --session-id "$SESSION_ID" \
  --message "规划已完成。现在执行：
用 sessions_spawn 将子任务分派到合适的 agent：
- 核心认证逻辑 → claude (acp)
- OAuth 集成 → codex (acp)
- 手机验证码 → trae (acp)
- 前端登录页 → trae (acp)
并行 spawn 所有任务，然后 sessions_yield 等待完成。" \
  --json --timeout 300
```

**优点**：最简单，agent 天然保持上下文
**适用**：阶段之间需要人工确认或中间检查的场景

### 方案 C：自调度循环

Agent 在每个 turn 中输出 `NEXT_STEP` 标记，外部脚本自动驱动下一轮。

```bash
SESSION_ID="waterfall-auto-$(date +%s)"
MAX_TURNS=5

MESSAGE="你是编排器。需要完成以下瀑布式任务：
Step 1: 用 subagent 规划认证系统重构方案
Step 2: 根据规划，用 acp 分派编码子任务给不同 agent
Step 3: 汇总所有子任务结果，输出完成报告

规则：
- 每个 turn 只完成一个 Step
- 完成当前 Step 后输出 NEXT_STEP: <下一步描述>
- 所有 Step 完成后输出 ALL_DONE
现在执行 Step 1。"

for turn in $(seq 1 $MAX_TURNS); do
  OUTPUT=$(openclaw agent --agent claude --session-id "$SESSION_ID" \
    --message "$MESSAGE" --json --timeout 180)

  echo "Turn $turn: $(echo "$OUTPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("summary",""))')"

  # 检查是否完成
  if echo "$OUTPUT" | grep -q "ALL_DONE"; then
    echo "全部完成！共 $turn 轮"
    break
  fi

  # 检查 NEXT_STEP 并构造下一轮 message
  if echo "$OUTPUT" | grep -q "NEXT_STEP"; then
    MESSAGE="继续。执行你上一轮输出的 NEXT_STEP。"
  else
    echo "Turn $turn 异常：既无 ALL_DONE 也无 NEXT_STEP"
    break
  fi
done
```

**优点**：全自动，无需人工干预
**适用**：CI/CD 或批处理场景

## ⚠️ 不可行的方案

### 方案 B：sessions_history 跨 session 恢复

```bash
# ❌ 已验证失败：agent 在标准 turn 中无法调用 sessions_history
# sessions_history 工具不在 agent 的可用工具列表中
```

## 预期结果
- 完整的重构方案（Turn 1 / Step 1）
- 并行分派的编码子任务（Turn 2 / Step 2）
- 复杂任务由 claude 处理，简单任务由 trae 快速完成

## 验证结果（2026-03-22）

| 方案 | 结果 | 耗时 | 说明 |
|------|------|------|------|
| A: 持久 session | ✅ PASS | ~49s | `--session-id` 跨 turn 上下文完整保持 |
| B: sessions_history | ❌ FAIL | — | 工具不在 agent allow list |
| C: 自调度循环 | ✅ PASS | ~39s | NEXT_STEP 标记成功驱动 3 轮执行 |
