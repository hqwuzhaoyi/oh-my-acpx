#!/usr/bin/env node
/**
 * stall-detector.js — ACP Session Stall 检测 + 自动恢复
 *
 * 检测 plan 文件是否长时间无进展（stall），如果是则触发恢复动作：
 * 1. 发送 openclaw system event 继续执行
 * 2. 汇报 stall 状态
 *
 * 用法:
 *   node scripts/stall-detector.js <plan路径> [--timeout 120] [--dry-run]
 *
 * 参数:
 *   --timeout <seconds>  无进展超时阈值（默认 120 秒）
 *   --dry-run            只检测不触发恢复
 *   --watch              持续监控模式（每 60s 检查一次）
 *
 * 输出:
 *   HEALTHY        — plan 文件有最近进展，无需干预
 *   STALLED        — 超时无进展，已触发恢复
 *   STALLED_DRY    — 超时无进展（dry-run，未触发）
 *   ALL_DONE       — 所有 stories 完成
 *   NO_PLAN        — plan 文件不存在
 *   RELAY_SENT     — 检测到已完成但未 relay 的 session，已补发通知
 */

const fs = require('fs');
const path = require('path');

let DEFAULT_OMA_PLAN_PATH;
let buildRecoveryActionOutcome;
let buildCompletionRelayMessage;
let buildRecoveryEventMessage;
let buildRecoveryInspectionOutput;
let classifyRelaySessionsToProcess;
let getRecoveryStatePath;
let inspectRecoveryPlanFile;
let loadRecoveryState;
let parseStallDetectorArgs;
let runOpenClawSystemEvent;
let scanCompletedRelaySessionsFromAgentsDir;
let saveRecoveryState;
let sendFeishuTextFromEnv;

try {
  ({
    DEFAULT_OMA_PLAN_PATH,
    buildRecoveryActionOutcome,
    buildCompletionRelayMessage,
    buildRecoveryEventMessage,
    buildRecoveryInspectionOutput,
    classifyRelaySessionsToProcess,
    getRecoveryStatePath,
    inspectRecoveryPlanFile,
    loadRecoveryState,
    parseStallDetectorArgs,
    scanCompletedRelaySessionsFromAgentsDir,
    saveRecoveryState
  } = require('../dist/src/core/recovery'));
  ({
    sendFeishuTextFromEnv
  } = require('../dist/src/integrations/notifications/feishu'));
  ({
    runOpenClawSystemEvent
  } = require('../dist/src/integrations/openclaw/system-event'));
} catch {
  console.error('Missing compiled recovery/notification/system-event module. Run `npm run build` first.');
  process.exit(2);
}

// 解析参数
const options = parseStallDetectorArgs(process.argv.slice(2), DEFAULT_OMA_PLAN_PATH);
const planPath = options.planPath;
const timeout = options.timeoutSec;
const dryRun = options.dryRun;
const watchMode = options.watch;

// 状态文件路径（和 plan 文件同目录）
const statePath = getRecoveryStatePath(planPath);

// --- Completion-relay 检测 ---
const OPENCLAW_AGENTS_DIR = path.join(require('os').homedir(), '.openclaw', 'agents');
const RELAY_MAX_AGE_MS = 30 * 60 * 1000; // 只补发最近 30 分钟内完成的 session

/**
 * 检查已完成但未 relay 的 session，主动补发飞书通知
 */
async function checkCompletionRelay() {
  const state = loadRecoveryState(statePath);
  const completed = scanCompletedRelaySessionsFromAgentsDir(OPENCLAW_AGENTS_DIR);
  const now = Date.now();
  const classification = classifyRelaySessionsToProcess({
    completed,
    relayedSessionIds: state.relayedSessions || [],
    now,
    maxAgeMs: RELAY_MAX_AGE_MS
  });
  let sent = 0;

  for (const session of classification.toNotify) {
    const msg = buildCompletionRelayMessage(session);

    if (dryRun) {
      console.log(`RELAY_DRY: 检测到未 relay 的完成 session ${session.sessionId}`);
      console.log(`  agent: ${session.agentId}, chat: ${session.chatId}`);
      console.log(`  摘要: ${session.summary?.slice(0, 100)}...`);
    } else {
      try {
        await sendFeishuTextFromEnv({
          chatId: session.chatId,
          message: msg,
          rootId: ''
        }, process.env);
        console.log(`RELAY_SENT: 补发完成通知 → ${session.chatId} (session: ${session.sessionId})`);
        sent++;
      } catch (e) {
        console.error(`RELAY_FAILED: session ${session.sessionId}: ${e.message}`);
      }
    }
  }

  // 持久化已处理的 session 列表（保留最近 100 条，避免无限增长）
  state.relayedSessions = classification.updatedRelayedSessionIds;
  saveRecoveryState(statePath, state);
  return sent;
}

async function check() {
  // 0. 检查 completion-relay（在 stall 检测之前）
  await checkCompletionRelay();
  const inspection = inspectRecoveryPlanFile({
    planPath,
    timeout,
    dryRun,
    now: Math.floor(Date.now() / 1000),
    defaultChatId: process.env.FEISHU_DEFAULT_CHAT_ID || ''
  });
  const output = buildRecoveryInspectionOutput({
    inspection,
    timeout
  });
  for (const line of output.lines) {
    console.log(line);
  }

  if (output.kind === 'NO_PLAN') return 'NO_PLAN';
  if (output.kind === 'ALL_DONE') return 'ALL_DONE';
  if (output.kind === 'HEALTHY') {
    if (output.nextState) saveRecoveryState(statePath, output.nextState);
    return 'HEALTHY';
  }
  if (output.kind === 'STALLED_DRY') return 'STALLED_DRY';
  if (output.kind === 'STALLED_MAX') return 'STALLED_MAX';

  try {
    const state = output.state;
    const decision = output.decision;
    const now = Math.floor(Date.now() / 1000);
    // 直接发飞书通知 + 尝试 openclaw 恢复
    await sendFeishuTextFromEnv({
      chatId: decision.chatId,
      message: decision.notifyMessage,
      rootId: ''
    }, process.env);
    console.log('✓ 飞书通知已发送到', decision.chatId);

    // 尝试 openclaw system event 恢复（不阻塞，失败也没关系）
    try {
      const agentMsg = buildRecoveryEventMessage({
        elapsed: decision.elapsed,
        nextStory: decision.nextStory
      });
      const eventResult = runOpenClawSystemEvent(agentMsg, { stdio: 'pipe', timeoutMs: 15000 });
      if (eventResult.status !== 0) {
        throw new Error(eventResult.stderr || eventResult.stdout || `openclaw exited with status ${eventResult.status}`);
      }
      console.log('✓ openclaw 恢复已触发');
    } catch (_) {
      console.log('⚠ openclaw 恢复失败，仅飞书通知');
    }

    const outcome = buildRecoveryActionOutcome({
      state,
      now,
      succeeded: true
    });
    saveRecoveryState(statePath, outcome.nextState);
    console.log(outcome.summary);
    return 'STALLED';
  } catch (e) {
    const outcome = buildRecoveryActionOutcome({
      state,
      now,
      succeeded: false
    });
    saveRecoveryState(statePath, outcome.nextState);
    console.error('RECOVERY_FAILED: ' + e.message);
    return 'RECOVERY_FAILED';
  }
}

// 执行
if (watchMode) {
  console.log(`监控模式：每 60s 检查 ${planPath}，超时阈值 ${timeout}s`);
  void check();
  setInterval(() => {
    void check();
  }, 60000);
} else {
  void check();
}
