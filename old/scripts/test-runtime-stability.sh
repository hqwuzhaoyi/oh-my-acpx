#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Oh My ACPX — 运行时稳定性验证测试套件
# ═══════════════════════════════════════════════════════════════════════════════
#
# 前置条件：
#   - openclaw 运行中 (openclaw gateway 或 openclaw start)
#   - acpx 可用 (which acpx)
#   - 至少 claude agent 可用
#
# 用法：
#   bash scripts/test-runtime-stability.sh           # 运行全部测试
#   bash scripts/test-runtime-stability.sh --test 1  # 运行单个测试
#   bash scripts/test-runtime-stability.sh --dry-run # 只打印命令不执行

set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────────────────────────
OPENCLAW_AGENT_DIR="$HOME/.openclaw/agents/claude/sessions"
ACPX_SESSION_DIR="$HOME/.acpx/sessions"
SUBAGENT_RUNS="$HOME/.openclaw/subagents/runs.json"
TELEMETRY_DIR="$HOME/.openclaw/telemetry"
LOG_DIR="$HOME/.openclaw/workspace/oh-my-acpx/test-results"
TIMEOUT_SEC=120
MARKER_PREFIX="ACPX_TEST_$(date +%s)"

DRY_RUN=false
SINGLE_TEST=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --test) SINGLE_TEST="$2"; shift 2 ;;
    *) shift ;;
  esac
done

mkdir -p "$LOG_DIR"

# ── 工具函数 ──────────────────────────────────────────────────────────────────

log() { echo "[$(date +%H:%M:%S)] $*"; }
pass() { echo "  ✅ PASS: $*"; }
fail() { echo "  ❌ FAIL: $*"; }
info() { echo "  ℹ️  $*"; }

snapshot_sessions() {
  # 快照当前 session 文件列表，用于 diff 新增的
  ls "$OPENCLAW_AGENT_DIR"/*.acp-stream.jsonl 2>/dev/null | sort > /tmp/acpx-sessions-before.txt || true
  ls "$ACPX_SESSION_DIR"/*.stream.ndjson 2>/dev/null | sort > /tmp/acpx-child-sessions-before.txt || true
}

new_sessions() {
  ls "$OPENCLAW_AGENT_DIR"/*.acp-stream.jsonl 2>/dev/null | sort > /tmp/acpx-sessions-after.txt || true
  comm -13 /tmp/acpx-sessions-before.txt /tmp/acpx-sessions-after.txt
}

new_child_sessions() {
  ls "$ACPX_SESSION_DIR"/*.stream.ndjson 2>/dev/null | sort > /tmp/acpx-child-sessions-after.txt || true
  comm -13 /tmp/acpx-child-sessions-before.txt /tmp/acpx-child-sessions-after.txt
}

check_stream_log() {
  local log_file="$1"
  node scripts/relay-fallback.js --stream-log "$log_file" 2>/dev/null
}

wait_for_subagent_result() {
  local marker="$1"
  local max_wait="$2"
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    if grep -q "$marker" "$SUBAGENT_RUNS" 2>/dev/null; then
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo -n "."
  done
  echo ""
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1: subagent 完成可见性（基线）
# ═══════════════════════════════════════════════════════════════════════════════
test_1_subagent_visibility() {
  log "TEST 1: subagent 完成可见性验证"
  log "  目的：确认 runtime=subagent 的完成通告路径稳定"
  log "  方法：openclaw agent 发送消息，触发 subagent spawn，检查 runs.json"

  local MARKER="${MARKER_PREFIX}_SUBAGENT_VIS"

  if $DRY_RUN; then
    info "DRY RUN: openclaw agent --agent claude --message '请用 subagent 回复: $MARKER' --json --timeout $TIMEOUT_SEC"
    return
  fi

  # 记录 runs.json 修改时间
  local before_mtime=$(stat -f %m "$SUBAGENT_RUNS" 2>/dev/null || echo 0)

  openclaw agent \
    --agent claude \
    --message "Use sessions_spawn with runtime: subagent to spawn a subagent. The subagent task: Reply exactly with the text $MARKER and nothing else." \
    --json --timeout $TIMEOUT_SEC \
    > "$LOG_DIR/test1-output.json" 2>&1 || true

  # 检查结果
  sleep 5  # 等 subagent 结束

  if grep -q "$MARKER" "$SUBAGENT_RUNS" 2>/dev/null; then
    pass "subagent frozenResultText 包含 marker"
    # 提取 outcome
    local status=$(python3 -c "
import json
runs = json.load(open('$SUBAGENT_RUNS'))
for r in runs.get('runs',{}).values():
    if '$MARKER' in r.get('frozenResultText',''):
        print(r['outcome']['status'])
        break
" 2>/dev/null)
    info "outcome.status = $status"
  else
    fail "subagent runs.json 中未找到 marker"
    info "检查 $LOG_DIR/test1-output.json"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 2: ACP relay 可见性
# ═══════════════════════════════════════════════════════════════════════════════
test_2_acp_relay_visibility() {
  log "TEST 2: ACP relay 可见性验证"
  log "  目的：确认 runtime=acp + streamTo:parent 的 relay 事件链"
  log "  方法：openclaw agent 触发 ACP spawn，检查 .acp-stream.jsonl 日志"

  local MARKER="${MARKER_PREFIX}_ACP_RELAY"

  if $DRY_RUN; then
    info "DRY RUN: openclaw agent --agent claude --message '请用 ACP runtime spawn 一个 claude agent 回复: $MARKER' --json --timeout $TIMEOUT_SEC"
    return
  fi

  snapshot_sessions

  openclaw agent \
    --agent claude \
    --message "Use sessions_spawn with runtime: acp, agentId: claude, mode: run, streamTo: parent. The task: Reply exactly with the text $MARKER and nothing else." \
    --json --timeout $TIMEOUT_SEC \
    > "$LOG_DIR/test2-output.json" 2>&1 || true

  sleep 10  # 等 relay 事件

  # 检查新产生的 acp-stream.jsonl
  local new_logs=$(new_sessions)
  if [ -z "$new_logs" ]; then
    fail "没有新的 .acp-stream.jsonl 产生"
    return
  fi

  for logfile in $new_logs; do
    info "分析 relay log: $logfile"
    local diagnosis=$(check_stream_log "$logfile")
    echo "$diagnosis" > "$LOG_DIR/test2-relay-diagnosis.json"
    echo "$diagnosis" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'  events: {d[\"events\"]}')
print(f'  hasStart: {d[\"hasStart\"]}')
print(f'  hasStall: {d[\"hasStall\"]}')
print(f'  hasDone: {d[\"hasDone\"]}')
print(f'  hasAssistantDelta: {d[\"hasAssistantDelta\"]}')
print(f'  diagnosis: {d[\"diagnosis\"]}')
" 2>/dev/null

    local diag=$(echo "$diagnosis" | python3 -c "import json,sys; print(json.load(sys.stdin)['diagnosis'])" 2>/dev/null)
    case "$diag" in
      relay_completed)
        pass "relay 正常完成（:done 事件存在）" ;;
      relay_stalled_without_terminal_event)
        fail "relay stall（只有 :start + :stall，无 :done）— 需要兜底" ;;
      *)
        info "diagnosis = $diag" ;;
    esac
  done

  # 检查 child 侧是否完成
  local new_child=$(new_child_sessions)
  if [ -n "$new_child" ]; then
    for clog in $new_child; do
      if grep -q "end_turn" "$clog" 2>/dev/null; then
        info "child 侧已完成 (end_turn in $clog)"
      fi
      if grep -q "$MARKER" "$clog" 2>/dev/null; then
        pass "child 侧输出包含 marker（执行链路正常）"
      fi
    done
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 3: direct acpx 可用性
# ═══════════════════════════════════════════════════════════════════════════════
test_3_direct_acpx() {
  log "TEST 3: direct acpx 可用性验证"
  log "  目的：确认 acpx 直接执行链路正常"
  log "  方法：acpx --approve-all claude exec <task>"

  local MARKER="${MARKER_PREFIX}_DIRECT_ACPX"

  if $DRY_RUN; then
    info "DRY RUN: acpx --approve-all --timeout 90 claude exec 'Reply exactly: $MARKER'"
    return
  fi

  local output
  output=$(acpx --approve-all --timeout 90 --format text claude exec "Reply exactly: $MARKER" 2>&1) || true

  echo "$output" > "$LOG_DIR/test3-output.txt"

  if echo "$output" | grep -q "$MARKER"; then
    pass "direct acpx 输出包含 marker"
  else
    fail "direct acpx 输出未包含 marker"
    info "输出: $(echo "$output" | head -5)"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4: 兜底回捞验证（模拟 stall 场景）
# ═══════════════════════════════════════════════════════════════════════════════
test_4_fallback_recovery() {
  log "TEST 4: 兜底回捞验证"
  log "  目的：验证当 relay stall 时，能从 child session 回捞结果"
  log "  方法：找到最近的 stall 日志，用 relay-fallback.js inspect 分析"

  if $DRY_RUN; then
    info "DRY RUN: node scripts/relay-fallback.js --stream-log <latest-acp-stream.jsonl>"
    return
  fi

  # 找最近的 acp-stream.jsonl
  local latest=$(ls -t "$OPENCLAW_AGENT_DIR"/*.acp-stream.jsonl 2>/dev/null | head -1)
  if [ -z "$latest" ]; then
    info "没有 .acp-stream.jsonl 文件，跳过"
    return
  fi

  info "分析最近的 relay log: $latest"
  local result
  result=$(node scripts/relay-fallback.js --stream-log "$latest" 2>/dev/null)
  echo "$result" > "$LOG_DIR/test4-fallback-diagnosis.json"

  local diag=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin)['diagnosis'])" 2>/dev/null)
  info "diagnosis: $diag"

  # 检查 child recovery
  local child_found=$(echo "$result" | python3 -c "
import json, sys
d = json.load(sys.stdin)
cr = d.get('childRecovery')
if cr and cr.get('found'):
    print(f'found={cr[\"found\"]} messages={cr[\"messageCount\"]} endTurn={cr[\"hasEndTurn\"]}')
else:
    print('no_child_result')
" 2>/dev/null)

  if echo "$child_found" | grep -q "found=True"; then
    pass "child 结果回捞成功: $child_found"
  else
    info "child 回捞结果: $child_found"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 5: runtime-router 路由验证
# ═══════════════════════════════════════════════════════════════════════════════
test_5_routing_rules() {
  log "TEST 5: 路由规则验证"
  log "  目的：确认 runtime-router 输出符合混合策略"

  local all_pass=true

  # 规划类 → subagent
  for cat in ultrabrain deep explore writing; do
    local rt=$(node scripts/runtime-router.js --category "$cat" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['runtime'])" 2>/dev/null)
    if [ "$rt" = "subagent" ]; then
      pass "$cat → subagent"
    else
      fail "$cat 应该是 subagent，实际是 $rt"
      all_pass=false
    fi
  done

  # 编码类 → acp
  for cat in standard quick visual-engineering; do
    local rt=$(node scripts/runtime-router.js --category "$cat" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['runtime'])" 2>/dev/null)
    if [ "$rt" = "acp" ]; then
      pass "$cat → acp"
    else
      fail "$cat 应该是 acp，实际是 $rt"
      all_pass=false
    fi
  done

  $all_pass && pass "所有路由规则正确"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6: 混合策略端到端（规划 subagent + 编码 acp）
# ═══════════════════════════════════════════════════════════════════════════════
test_6_hybrid_e2e() {
  log "TEST 6: 混合策略端到端验证"
  log "  目的：模拟真实工作流——先 subagent 规划，再 acp 编码"
  log "  方法：发消息要求 orchestrator 执行混合策略"

  local MARKER="${MARKER_PREFIX}_HYBRID_E2E"

  if $DRY_RUN; then
    info "DRY RUN: openclaw agent --agent claude --message '混合策略测试...' --json --timeout 180"
    return
  fi

  snapshot_sessions

  openclaw agent \
    --agent claude \
    --message "Execute a two-step hybrid workflow:
Step 1 (planning): Use sessions_spawn with runtime:subagent, agentId:claude. Task: 'Analyze and output a plan with marker: ${MARKER}_PLAN'
Step 2 (after step 1 completes): Use sessions_spawn with runtime:acp, agentId:claude, mode:run, streamTo:parent. Task: 'Reply with marker: ${MARKER}_CODE'
Execute both steps sequentially. Report results." \
    --json --timeout 180 \
    > "$LOG_DIR/test6-output.json" 2>&1 || true

  sleep 15

  # 检查 subagent 部分
  if grep -q "${MARKER}_PLAN" "$SUBAGENT_RUNS" 2>/dev/null; then
    pass "Step 1 (subagent planning): marker found in runs.json"
  else
    fail "Step 1 (subagent planning): marker not found"
  fi

  # 检查 ACP 部分
  local new_logs=$(new_sessions)
  if [ -n "$new_logs" ]; then
    info "Step 2 (acp coding): 新 relay log 产生"
    for logfile in $new_logs; do
      local diag=$(check_stream_log "$logfile" | python3 -c "import json,sys; print(json.load(sys.stdin)['diagnosis'])" 2>/dev/null)
      info "  relay diagnosis: $diag"
    done
  else
    info "Step 2 (acp coding): 没有新 relay log（可能 agent 选择了其他方式）"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# 运行
# ═══════════════════════════════════════════════════════════════════════════════
log "═══════════════════════════════════════════════════"
log " Oh My ACPX 运行时稳定性测试"
log " Marker prefix: $MARKER_PREFIX"
log " Results: $LOG_DIR/"
log "═══════════════════════════════════════════════════"
echo ""

TESTS=(test_1_subagent_visibility test_2_acp_relay_visibility test_3_direct_acpx test_4_fallback_recovery test_5_routing_rules test_6_hybrid_e2e)

if [ -n "$SINGLE_TEST" ]; then
  idx=$((SINGLE_TEST - 1))
  if [ $idx -ge 0 ] && [ $idx -lt ${#TESTS[@]} ]; then
    ${TESTS[$idx]}
  else
    log "无效测试编号: $SINGLE_TEST (可选: 1-${#TESTS[@]})"
    exit 1
  fi
else
  for t in "${TESTS[@]}"; do
    echo ""
    $t
  done
fi

echo ""
log "═══════════════════════════════════════════════════"
log " 测试完成。结果保存在 $LOG_DIR/"
log "═══════════════════════════════════════════════════"
