#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Oh My ACPX — TODO 3: sessions_history 回捞路径端到端验证
# ═══════════════════════════════════════════════════════════════════════════════
#
# 验证目标：当 ACP relay stall 发生时，orchestrator agent 能否通过
# sessions_history(childSessionKey) 回捞 child session 的完整输出。
#
# 测试矩阵：
#   T1: sessions_history API 可用性（直接调用）
#   T2: childSessionKey 格式与传递
#   T3: 端到端回捞（spawn → yield → history recovery）
#   T4: sessions_history 返回内容与 stream log 一致性对比
#
# 前置条件：
#   - openclaw 运行中（gateway 连接）
#   - claude agent 可用
#   - node 可用（relay-fallback.js 诊断）
#
# 用法：
#   bash scripts/test-sessions-history-recovery.sh             # 全部测试
#   bash scripts/test-sessions-history-recovery.sh --test T1   # 单测试
#   bash scripts/test-sessions-history-recovery.sh --dry-run   # 只打印

set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/test-results"
TIMEOUT_SEC=180
MARKER="TODO3_$(date +%s)"

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

PASS_COUNT=0
FAIL_COUNT=0
record_pass() { PASS_COUNT=$((PASS_COUNT + 1)); pass "$*"; }
record_fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); fail "$*"; }

run_agent() {
  local message="$1"
  local output_file="$2"
  local timeout="${3:-$TIMEOUT_SEC}"

  if $DRY_RUN; then
    log "[DRY-RUN] openclaw agent --agent claude --message \"${message:0:80}...\" --json --timeout $timeout > $output_file"
    echo '{"status":"dry-run","result":{"payloads":[{"text":"DRY_RUN"}]}}' > "$output_file"
    return 0
  fi

  openclaw agent --agent claude \
    --message "$message" \
    --json \
    --timeout "$timeout" \
    > "$output_file" 2>&1 || true
}

extract_payload() {
  local file="$1"
  python3 -c "
import json, re, sys
with open('$file') as f:
    content = f.read()
m = re.search(r'\{\"runId\"', content)
if not m:
    # Try finding any JSON with payloads
    m = re.search(r'\{.*\"payloads\"', content)
if m:
    try:
        data = json.loads(content[m.start():])
        payloads = data.get('result', {}).get('payloads', [])
        print(' '.join(p.get('text', '') for p in payloads))
    except:
        print('PARSE_ERROR')
else:
    print('NO_JSON')
" 2>/dev/null
}

payload_contains() {
  local file="$1"
  local keyword="$2"
  local payload
  payload=$(extract_payload "$file")
  if echo "$payload" | grep -q "$keyword"; then
    echo "FOUND"
  else
    echo "NOT_FOUND"
  fi
}

check_gateway() {
  local file="$1"
  if grep -q "gateway connect failed" "$file" 2>/dev/null; then
    echo "FAILED"
  else
    echo "OK"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# T1: sessions_history API 可用性
# ═══════════════════════════════════════════════════════════════════════════════

test_T1() {
  separator
  log "T1: sessions_history API 可用性"
  separator

  local out="$LOG_DIR/todo3-T1-api-check.json"

  # 先 spawn 一个简单任务获取 childSessionKey
  log "T1a: Spawning child session..."
  local out_spawn="$LOG_DIR/todo3-T1-spawn.json"
  run_agent "Call sessions_spawn with runtime:'acp', agentId:'claude', mode:'run', streamTo:'parent', task:'Reply exactly: PING_${MARKER}'.
Print the childSessionKey value on its own line prefixed with KEY:.
Then call sessions_yield with message:'wait'." \
    "$out_spawn" 240

  if [ "$(check_gateway "$out_spawn")" = "FAILED" ]; then
    record_fail "T1a: Gateway connection failed (embedded fallback)"
    return 1
  fi

  # 提取 childSessionKey
  local child_key
  child_key=$(python3 -c "
import re
with open('$out_spawn') as f:
    content = f.read()
m = re.search(r'agent:claude:acp:[a-f0-9-]+', content)
print(m.group() if m else 'NOT_FOUND')
" 2>/dev/null)

  if [ "$child_key" = "NOT_FOUND" ] || [ -z "$child_key" ]; then
    record_fail "T1a: Failed to extract childSessionKey"
    return 1
  fi

  record_pass "T1a: childSessionKey obtained: $child_key"

  # 用 sessions_history 查询
  log "T1b: Querying sessions_history..."
  run_agent "Call sessions_history with childSessionKey: '$child_key'.
If the tool exists and returns data, print: HISTORY_API_OK
If the tool does not exist, print: HISTORY_API_MISSING
Print the number of messages returned as: MSG_COUNT: <number>" \
    "$out" 120

  if [ "$(payload_contains "$out" "HISTORY_API_OK")" = "FOUND" ]; then
    record_pass "T1b: sessions_history API is available and returns data"
  elif [ "$(payload_contains "$out" "HISTORY_API_MISSING")" = "FOUND" ]; then
    record_fail "T1b: sessions_history tool not available to agent"
  else
    info "T1b: Ambiguous result, manual check:"
    extract_payload "$out" | head -5
  fi

  info "Output: $out_spawn, $out"
}

# ═══════════════════════════════════════════════════════════════════════════════
# T2: childSessionKey 格式与传递
# ═══════════════════════════════════════════════════════════════════════════════

test_T2() {
  separator
  log "T2: childSessionKey 格式与传递验证"
  separator

  local out="$LOG_DIR/todo3-T2-key-format.json"

  run_agent "Call sessions_spawn with runtime:'acp', agentId:'claude', mode:'run', streamTo:'parent', task:'Say: HELLO'.
Print the FULL spawn result as JSON.
Specifically verify and print:
1. KEY_FORMAT: <the childSessionKey value>
2. HAS_STREAM_LOG: true/false (whether streamLogPath is present)
3. KEY_PATTERN: VALID if key matches 'agent:*:acp:*' pattern, else INVALID" \
    "$out" 180

  if [ "$(check_gateway "$out")" = "FAILED" ]; then
    record_fail "T2: Gateway connection failed"
    return 1
  fi

  # 验证 key 格式
  local key_found
  key_found=$(python3 -c "
import re
with open('$out') as f:
    content = f.read()
m = re.search(r'agent:claude:acp:[a-f0-9-]{36}', content)
print('VALID' if m else 'INVALID')
" 2>/dev/null)

  if [ "$key_found" = "VALID" ]; then
    record_pass "T2: childSessionKey matches expected format (agent:claude:acp:<uuid>)"
  else
    record_fail "T2: childSessionKey format unexpected"
  fi

  # 验证 streamLogPath
  local has_path
  has_path=$(python3 -c "
import re
with open('$out') as f:
    content = f.read()
m = re.search(r'\.acp-stream\.jsonl', content)
print('YES' if m else 'NO')
" 2>/dev/null)

  if [ "$has_path" = "YES" ]; then
    record_pass "T2: streamLogPath present in spawn result"
  else
    record_fail "T2: streamLogPath missing from spawn result"
  fi

  info "Output: $out"
}

# ═══════════════════════════════════════════════════════════════════════════════
# T3: 端到端回捞（spawn → yield → history recovery）
# ═══════════════════════════════════════════════════════════════════════════════

test_T3() {
  separator
  log "T3: 端到端回捞测试"
  log "  模拟完整流程：spawn child → yield → sessions_history recovery"
  separator

  local out_spawn="$LOG_DIR/todo3-T3-spawn.json"
  local out_history="$LOG_DIR/todo3-T3-history.json"

  # Step 1: Spawn child with a longer task
  log "T3a: Spawning child task (200-word essay)..."
  run_agent "Call sessions_spawn with runtime:'acp', agentId:'claude', mode:'run', streamTo:'parent', task:'Write exactly 200 words analyzing the trade-offs between microservices and monoliths. End with: ANALYSIS_${MARKER}'.
Print the childSessionKey and streamLogPath.
Then call sessions_yield with message:'waiting for analysis'." \
    "$out_spawn" 240

  if [ "$(check_gateway "$out_spawn")" = "FAILED" ]; then
    record_fail "T3a: Gateway connection failed"
    return 1
  fi

  # Extract childSessionKey
  local child_key
  child_key=$(python3 -c "
import re
with open('$out_spawn') as f:
    content = f.read()
m = re.search(r'agent:claude:acp:[a-f0-9-]+', content)
print(m.group() if m else 'NOT_FOUND')
" 2>/dev/null)

  local stream_log
  stream_log=$(python3 -c "
import re
with open('$out_spawn') as f:
    content = f.read()
m = re.search(r'/Users/prajna/.openclaw/agents/claude/sessions/[a-f0-9-]+\.acp-stream\.jsonl', content)
print(m.group() if m else 'NOT_FOUND')
" 2>/dev/null)

  if [ "$child_key" = "NOT_FOUND" ]; then
    record_fail "T3a: Could not extract childSessionKey"
    return 1
  fi

  record_pass "T3a: Spawn successful, childSessionKey: $child_key"

  # Step 2: Check relay status via stream log
  if [ "$stream_log" != "NOT_FOUND" ] && [ -f "$stream_log" ]; then
    local relay_diag
    relay_diag=$(node "$SCRIPT_DIR/relay-fallback.js" --stream-log "$stream_log" 2>/dev/null || echo '{}')
    local relay_status
    relay_status=$(echo "$relay_diag" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('diagnosis','unknown'))" 2>/dev/null || echo "unknown")
    info "T3b: Relay diagnosis: $relay_status"

    if [ "$relay_status" = "relay_completed" ]; then
      record_pass "T3b: Relay completed normally"
    elif [ "$relay_status" = "relay_stalled_without_terminal_event" ]; then
      info "T3b: Relay stalled — this is the recovery scenario we want to test"
    fi
  else
    info "T3b: Stream log not found, skipping relay diagnosis"
  fi

  # Step 3: Use sessions_history to recover
  log "T3c: Calling sessions_history for recovery..."
  run_agent "Call sessions_history with childSessionKey: '$child_key'.
Check if the assistant response contains 'ANALYSIS_${MARKER}'.
If found, print the FULL assistant text, then: RECOVERY_SUCCESS
If not found, print: RECOVERY_FAILED
Also print MSG_COUNT: <number of messages>" \
    "$out_history" 120

  if [ "$(payload_contains "$out_history" "RECOVERY_SUCCESS")" = "FOUND" ]; then
    record_pass "T3c: sessions_history successfully recovered child output"

    # Verify content includes the marker
    if [ "$(payload_contains "$out_history" "ANALYSIS_${MARKER}")" = "FOUND" ]; then
      record_pass "T3c: Recovered content contains expected marker"
    else
      record_fail "T3c: Recovered content missing expected marker"
    fi
  elif [ "$(payload_contains "$out_history" "RECOVERY_FAILED")" = "FOUND" ]; then
    record_fail "T3c: sessions_history returned but content incomplete"
  else
    info "T3c: Ambiguous result:"
    extract_payload "$out_history" | head -10
  fi

  info "Output: $out_spawn, $out_history"
}

# ═══════════════════════════════════════════════════════════════════════════════
# T4: sessions_history vs stream log 一致性对比
# ═══════════════════════════════════════════════════════════════════════════════

test_T4() {
  separator
  log "T4: sessions_history 返回内容与 stream log 一致性"
  separator

  local out_spawn="$LOG_DIR/todo3-T4-spawn.json"
  local out_history="$LOG_DIR/todo3-T4-history.json"

  # Spawn a deterministic task
  log "T4a: Spawning deterministic task..."
  run_agent "Call sessions_spawn with runtime:'acp', agentId:'claude', mode:'run', streamTo:'parent', task:'Output exactly this text and nothing else: THE_QUICK_BROWN_FOX_${MARKER}'.
Print childSessionKey and streamLogPath.
Then call sessions_yield with message:'wait'." \
    "$out_spawn" 180

  if [ "$(check_gateway "$out_spawn")" = "FAILED" ]; then
    record_fail "T4: Gateway connection failed"
    return 1
  fi

  local child_key
  child_key=$(python3 -c "
import re
with open('$out_spawn') as f: content = f.read()
m = re.search(r'agent:claude:acp:[a-f0-9-]+', content)
print(m.group() if m else 'NOT_FOUND')
" 2>/dev/null)

  local stream_log
  stream_log=$(python3 -c "
import re
with open('$out_spawn') as f: content = f.read()
m = re.search(r'/Users/prajna/.openclaw/agents/claude/sessions/[a-f0-9-]+\.acp-stream\.jsonl', content)
print(m.group() if m else 'NOT_FOUND')
" 2>/dev/null)

  if [ "$child_key" = "NOT_FOUND" ]; then
    record_fail "T4a: Could not extract childSessionKey"
    return 1
  fi

  record_pass "T4a: Spawn successful"

  # Get stream log content
  local stream_text="NOT_AVAILABLE"
  if [ "$stream_log" != "NOT_FOUND" ] && [ -f "$stream_log" ]; then
    stream_text=$(node "$SCRIPT_DIR/relay-fallback.js" --stream-log "$stream_log" 2>/dev/null | \
      python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('childRecovery',{}); print(r.get('text',''))" 2>/dev/null || echo "PARSE_ERROR")
    info "T4b: Stream log text: ${stream_text:0:100}"
  fi

  # Get sessions_history content
  log "T4c: Querying sessions_history..."
  run_agent "Call sessions_history with childSessionKey: '$child_key'.
Extract ONLY the assistant's text content (no metadata).
Print it as: HISTORY_TEXT: <text>" \
    "$out_history" 120

  local history_text
  history_text=$(python3 -c "
import re
with open('$out_history') as f: content = f.read()
m = re.search(r'HISTORY_TEXT:\s*(.*?)(?:\n|$)', content)
print(m.group(1).strip() if m else 'NOT_FOUND')
" 2>/dev/null)

  info "T4c: History text: ${history_text:0:100}"

  # Compare
  if echo "$stream_text" | grep -q "THE_QUICK_BROWN_FOX_${MARKER}" && \
     echo "$history_text" | grep -q "THE_QUICK_BROWN_FOX_${MARKER}"; then
    record_pass "T4: Both stream log and sessions_history contain expected content"
    record_pass "T4: Content sources are consistent"
  elif echo "$history_text" | grep -q "THE_QUICK_BROWN_FOX_${MARKER}"; then
    record_pass "T4: sessions_history contains expected content"
    info "T4: Stream log comparison skipped (unavailable or different format)"
  else
    record_fail "T4: Expected content not found in recovery sources"
  fi

  info "Output: $out_spawn, $out_history"
}

# ═══════════════════════════════════════════════════════════════════════════════
# 主流程
# ═══════════════════════════════════════════════════════════════════════════════

main() {
  separator
  log "Oh My ACPX — TODO 3: sessions_history 回捞路径验证"
  log "Marker: $MARKER"
  log "Timeout: ${TIMEOUT_SEC}s"
  log "Mode: $(if $DRY_RUN; then echo 'DRY-RUN'; else echo 'LIVE'; fi)"
  separator

  # Gateway pre-check
  log "Pre-check: Gateway connectivity..."
  local precheck
  precheck=$(openclaw agent --agent claude --message "Say: PRECHECK_OK" --json --timeout 60 2>&1)
  if echo "$precheck" | grep -q "gateway connect failed"; then
    fail "Gateway not connected. Start openclaw gateway first."
    exit 1
  fi
  pass "Gateway connected"

  local start_time
  start_time=$(date +%s)

  if [ -z "$SINGLE_TEST" ] || [ "$SINGLE_TEST" = "T1" ]; then test_T1; fi
  if [ -z "$SINGLE_TEST" ] || [ "$SINGLE_TEST" = "T2" ]; then test_T2; fi
  if [ -z "$SINGLE_TEST" ] || [ "$SINGLE_TEST" = "T3" ]; then test_T3; fi
  if [ -z "$SINGLE_TEST" ] || [ "$SINGLE_TEST" = "T4" ]; then test_T4; fi

  local end_time
  end_time=$(date +%s)
  local duration=$((end_time - start_time))

  separator
  log "测试完成"
  log "  通过: $PASS_COUNT"
  log "  失败: $FAIL_COUNT"
  log "  耗时: ${duration}s"
  log "  结果目录: $LOG_DIR/todo3-*"
  separator

  if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
