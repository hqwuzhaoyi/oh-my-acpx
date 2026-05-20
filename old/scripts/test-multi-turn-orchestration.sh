#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Oh My ACPX — TODO 2: 多轮编排验证测试
# ═══════════════════════════════════════════════════════════════════════════════
#
# 验证目标：解决 T6 单 turn 限制，测试跨 turn 的瀑布式编排
#
# 三个方案：
#   A: 持久 session + 多次 agent turn（--session-id 复用）
#   B: session 历史恢复（sessions_history 上下文传递）
#   C: 自调度循环（agent 输出 NEXT_STEP 标记，外部脚本驱动）
#
# 前置条件：
#   - openclaw 运行中
#   - claude agent 可用
#
# 用法：
#   bash scripts/test-multi-turn-orchestration.sh             # 全部测试
#   bash scripts/test-multi-turn-orchestration.sh --test A    # 单方案
#   bash scripts/test-multi-turn-orchestration.sh --dry-run   # 只打印

set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────────────────────────
LOG_DIR="$HOME/.openclaw/workspace/oh-my-acpx/test-results"
TIMEOUT_SEC=180
MARKER="MULTI_TURN_$(date +%s)"
SESSION_ID="multi-turn-test-${MARKER}"

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
separator() { echo ""; echo "═══════════════════════════════════════════════════════════════"; }

run_agent() {
  local session_id="$1"
  local message="$2"
  local output_file="$3"
  local timeout="${4:-$TIMEOUT_SEC}"

  if $DRY_RUN; then
    log "[DRY-RUN] openclaw agent --agent claude --session-id $session_id --message \"$message\" --json --timeout $timeout > $output_file"
    echo '{"status":"dry-run"}' > "$output_file"
    return 0
  fi

  openclaw agent --agent claude \
    --session-id "$session_id" \
    --message "$message" \
    --json \
    --timeout "$timeout" \
    > "$output_file" 2>&1 || true
}

extract_payloads() {
  local file="$1"
  # 提取 JSON 部分（跳过插件加载日志）
  python3 -c "
import json, sys
try:
    # 读取文件，找到第一个 { 开始的 JSON
    with open('$file') as f:
        content = f.read()
    start = content.index('{')
    data = json.loads(content[start:])
    payloads = data.get('result', {}).get('payloads', [])
    for p in payloads:
        text = p.get('text', '')
        if text:
            print(text)
            print('---')
except Exception as e:
    print(f'PARSE_ERROR: {e}', file=sys.stderr)
" 2>/dev/null || echo "PARSE_FAILED"
}

check_payload_contains() {
  local file="$1"
  local keyword="$2"
  python3 -c "
import json, sys
try:
    with open('$file') as f:
        content = f.read()
    start = content.index('{')
    data = json.loads(content[start:])
    payloads = data.get('result', {}).get('payloads', [])
    all_text = ' '.join(p.get('text', '') for p in payloads)
    if '$keyword' in all_text:
        print('FOUND')
    else:
        print('NOT_FOUND')
except:
    print('PARSE_ERROR')
" 2>/dev/null
}

count_payloads() {
  local file="$1"
  python3 -c "
import json, sys
try:
    with open('$file') as f:
        content = f.read()
    start = content.index('{')
    data = json.loads(content[start:])
    payloads = data.get('result', {}).get('payloads', [])
    print(len(payloads))
except:
    print(0)
" 2>/dev/null
}

get_status() {
  local file="$1"
  python3 -c "
import json, sys
try:
    with open('$file') as f:
        content = f.read()
    start = content.index('{')
    data = json.loads(content[start:])
    print(data.get('status', 'unknown'))
except:
    print('parse_error')
" 2>/dev/null
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST A: 持久 session + 多次 agent turn
# ═══════════════════════════════════════════════════════════════════════════════
#
# 假设：同一个 --session-id 发送多次 message，orchestrator 能看到之前的对话历史
# 验证：
#   Turn 1: 让 agent 用 subagent 规划，输出带 PLAN_MARKER 标记的计划
#   Turn 2: 发送 "Step 1 done, now execute Step 2"，检查 agent 是否引用了 Turn 1 的内容

test_A() {
  separator
  log "TEST A: 持久 session + 多次 agent turn"
  log "  验证：同一 session-id 跨 turn 保持上下文"
  separator

  local sid="persistent-session-${MARKER}"
  local out1="$LOG_DIR/todo2-A-turn1.json"
  local out2="$LOG_DIR/todo2-A-turn2.json"

  # ── Turn 1: 规划阶段 ──
  log "Turn 1: 发送规划任务..."
  run_agent "$sid" \
    "You are testing multi-turn orchestration. This is Turn 1.
Your task: Create a simple plan for building a TODO app.
Output your plan clearly, and end with the marker: PLAN_COMPLETE_${MARKER}
Do NOT use sessions_spawn or any ACP tools. Just output the plan as text." \
    "$out1" \
    120

  local status1
  status1=$(get_status "$out1")
  log "Turn 1 status: $status1"

  if [ "$status1" != "ok" ]; then
    fail "Turn 1 failed with status: $status1"
    return 1
  fi

  local plan_found
  plan_found=$(check_payload_contains "$out1" "PLAN_COMPLETE_${MARKER}")
  if [ "$plan_found" = "FOUND" ]; then
    pass "Turn 1: 规划输出包含 marker"
  else
    fail "Turn 1: 未找到 marker PLAN_COMPLETE_${MARKER}"
    info "Payloads:"
    extract_payloads "$out1" | head -20
  fi

  # ── Turn 2: 执行阶段（引用 Turn 1 上下文）──
  log "Turn 2: 发送执行指令（引用 Turn 1）..."
  run_agent "$sid" \
    "This is Turn 2 of the same session.
In Turn 1, you created a plan for a TODO app that ended with PLAN_COMPLETE_${MARKER}.
Now: Summarize what you planned in Turn 1, then say: STEP2_EXECUTED_${MARKER}
If you do NOT remember Turn 1, say: NO_CONTEXT_${MARKER}" \
    "$out2" \
    120

  local status2
  status2=$(get_status "$out2")
  log "Turn 2 status: $status2"

  if [ "$status2" != "ok" ]; then
    fail "Turn 2 failed with status: $status2"
    return 1
  fi

  # ── 判定 ──
  local context_preserved
  context_preserved=$(check_payload_contains "$out2" "STEP2_EXECUTED_${MARKER}")
  local no_context
  no_context=$(check_payload_contains "$out2" "NO_CONTEXT_${MARKER}")

  if [ "$context_preserved" = "FOUND" ]; then
    pass "Turn 2: agent 引用了 Turn 1 上下文，输出 STEP2_EXECUTED marker"
    pass "方案 A 验证通过：持久 session 支持跨 turn 上下文保持"
  elif [ "$no_context" = "FOUND" ]; then
    fail "Turn 2: agent 报告无法看到 Turn 1 上下文 (NO_CONTEXT)"
    info "持久 session 不保持跨 turn 历史"
  else
    info "Turn 2 输出未包含预期 marker，手动检查:"
    extract_payloads "$out2" | head -30
  fi

  info "输出文件: $out1, $out2"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST B: sessions_history 上下文恢复
# ═══════════════════════════════════════════════════════════════════════════════
#
# 验证：agent 在 Turn 2 中能否通过 sessions_history 拉取之前 session 的对话

test_B() {
  separator
  log "TEST B: sessions_history 上下文恢复"
  log "  验证：agent 可通过 sessions_history 获取之前 session 的内容"
  separator

  local sid_turn1="history-test-turn1-${MARKER}"
  local sid_turn2="history-test-turn2-${MARKER}"
  local out1="$LOG_DIR/todo2-B-turn1.json"
  local out2="$LOG_DIR/todo2-B-turn2.json"

  # ── Turn 1: 在第一个 session 中生成内容 ──
  log "Turn 1: 在 session [$sid_turn1] 中生成内容..."
  run_agent "$sid_turn1" \
    "You are testing session history recovery.
Output this exact text: 'The secret code is SESSHIST_${MARKER}. The plan has 3 steps: setup database, create API, build UI.'
Do NOT use any tools. Just output the text directly." \
    "$out1" \
    120

  local status1
  status1=$(get_status "$out1")
  log "Turn 1 status: $status1"

  if [ "$status1" != "ok" ]; then
    fail "Turn 1 failed"
    return 1
  fi

  pass "Turn 1: 内容已写入 session $sid_turn1"

  # ── Turn 2: 在新 session 中用 sessions_history 恢复 ──
  log "Turn 2: 在新 session [$sid_turn2] 中尝试恢复 Turn 1 内容..."
  run_agent "$sid_turn2" \
    "You are testing session history recovery.
Use the sessions_history tool to read the conversation history from session key: '$sid_turn1'.
After reading, extract the secret code (starts with SESSHIST_) and the 3 plan steps.
Output format:
RECOVERED_CODE: <the code>
RECOVERED_STEPS: <the 3 steps>
RECOVERY_STATUS: SUCCESS or FAILURE
If sessions_history is not available or returns nothing, output:
RECOVERY_STATUS: TOOL_UNAVAILABLE" \
    "$out2" \
    120

  local status2
  status2=$(get_status "$out2")
  log "Turn 2 status: $status2"

  # ── 判定 ──
  local recovery_success
  recovery_success=$(check_payload_contains "$out2" "SESSHIST_${MARKER}")
  local tool_unavailable
  tool_unavailable=$(check_payload_contains "$out2" "TOOL_UNAVAILABLE")

  if [ "$recovery_success" = "FOUND" ]; then
    pass "sessions_history 成功恢复了 Turn 1 的内容"
    pass "方案 B 验证通过：跨 session 上下文恢复可行"
  elif [ "$tool_unavailable" = "FOUND" ]; then
    fail "sessions_history 工具不可用或返回空"
    info "需要检查 agent 的 tool allow list"
  else
    info "未能明确判定，手动检查 Turn 2 输出:"
    extract_payloads "$out2" | head -30
  fi

  info "输出文件: $out1, $out2"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST C: 自调度循环（NEXT_STEP 驱动）
# ═══════════════════════════════════════════════════════════════════════════════
#
# 验证：外部脚本检测 agent 输出的 NEXT_STEP 标记，自动触发下一个 turn
# 这是最接近生产环境的方案：orchestrator 单 turn 做不完所有步骤时，
# 输出 NEXT_STEP 让外部循环驱动

test_C() {
  separator
  log "TEST C: 自调度循环（NEXT_STEP 驱动）"
  log "  验证：外部循环根据 agent 输出的 NEXT_STEP 标记驱动多轮执行"
  separator

  local sid="self-schedule-${MARKER}"
  local max_turns=4
  local turn=0
  local completed=false

  # 初始 message
  local message="You are an orchestrator testing multi-turn self-scheduling.
You need to complete 3 steps IN ORDER, one step per turn:
  Step 1: Output 'STEP1_DONE_${MARKER}: I analyzed the requirements'
  Step 2: Output 'STEP2_DONE_${MARKER}: I designed the architecture'
  Step 3: Output 'STEP3_DONE_${MARKER}: I implemented the solution'

RULES:
- Complete ONLY ONE step per turn
- After each step (except the last), output: NEXT_STEP: <description of next step>
- After the final step (Step 3), output: ALL_DONE_${MARKER}
- Do NOT use any tools. Just output text.
Now execute Step 1."

  while [ $turn -lt $max_turns ] && [ "$completed" = "false" ]; do
    turn=$((turn + 1))
    local outfile="$LOG_DIR/todo2-C-turn${turn}.json"

    log "Turn $turn: 发送消息..."
    run_agent "$sid" "$message" "$outfile" 120

    local status
    status=$(get_status "$outfile")
    log "Turn $turn status: $status"

    if [ "$status" != "ok" ]; then
      fail "Turn $turn failed with status: $status"
      break
    fi

    # 检查 ALL_DONE
    local all_done
    all_done=$(check_payload_contains "$outfile" "ALL_DONE_${MARKER}")
    if [ "$all_done" = "FOUND" ]; then
      completed=true
      pass "Turn $turn: agent 输出 ALL_DONE，全部步骤完成"
      break
    fi

    # 检查 NEXT_STEP
    local next_step
    next_step=$(check_payload_contains "$outfile" "NEXT_STEP")
    if [ "$next_step" = "FOUND" ]; then
      info "Turn $turn: 检测到 NEXT_STEP，准备触发下一轮..."

      # 检查当前步骤是否完成
      local step_marker="STEP${turn}_DONE_${MARKER}"
      local step_done
      step_done=$(check_payload_contains "$outfile" "$step_marker")
      if [ "$step_done" = "FOUND" ]; then
        pass "Turn $turn: Step $turn 完成"
      else
        info "Turn $turn: 未找到 $step_marker，但有 NEXT_STEP"
      fi

      # 构造下一轮 message
      message="Continue. You are in Turn $((turn + 1)). Execute the next step as described in your NEXT_STEP output.
Remember the rules: one step per turn, output STEP<N>_DONE marker, then NEXT_STEP or ALL_DONE."
    else
      fail "Turn $turn: 既无 ALL_DONE 也无 NEXT_STEP"
      info "输出:"
      extract_payloads "$outfile" | head -20
      break
    fi
  done

  # ── 总结 ──
  separator
  log "TEST C 总结"
  if [ "$completed" = "true" ]; then
    pass "方案 C 验证通过：自调度循环在 $turn 轮内完成了 3 步瀑布任务"

    # 验证每步的 marker 是否都存在
    local all_steps_found=true
    for step in 1 2 3; do
      local found=false
      for t in $(seq 1 $turn); do
        local f="$LOG_DIR/todo2-C-turn${t}.json"
        if [ -f "$f" ]; then
          local check
          check=$(check_payload_contains "$f" "STEP${step}_DONE_${MARKER}")
          if [ "$check" = "FOUND" ]; then
            found=true
            break
          fi
        fi
      done
      if [ "$found" = "true" ]; then
        pass "  Step $step marker found"
      else
        fail "  Step $step marker NOT found"
        all_steps_found=false
      fi
    done

    if [ "$all_steps_found" = "true" ]; then
      pass "所有 3 个步骤 marker 均已验证"
    fi
  else
    fail "方案 C 未能在 $max_turns 轮内完成"
  fi

  info "输出文件: $LOG_DIR/todo2-C-turn*.json"
}

# ═══════════════════════════════════════════════════════════════════════════════
# 主流程
# ═══════════════════════════════════════════════════════════════════════════════

main() {
  separator
  log "Oh My ACPX — TODO 2: 多轮编排验证"
  log "Marker: $MARKER"
  log "Timeout: ${TIMEOUT_SEC}s"
  log "Mode: $(if $DRY_RUN; then echo 'DRY-RUN'; else echo 'LIVE'; fi)"
  separator

  local start_time
  start_time=$(date +%s)

  if [ -z "$SINGLE_TEST" ] || [ "$SINGLE_TEST" = "A" ]; then
    test_A
  fi

  if [ -z "$SINGLE_TEST" ] || [ "$SINGLE_TEST" = "B" ]; then
    test_B
  fi

  if [ -z "$SINGLE_TEST" ] || [ "$SINGLE_TEST" = "C" ]; then
    test_C
  fi

  local end_time
  end_time=$(date +%s)
  local duration=$((end_time - start_time))

  separator
  log "全部测试完成，耗时 ${duration}s"
  log "结果目录: $LOG_DIR/todo2-*"
  separator
}

main "$@"
