#!/usr/bin/env node
/**
 * stall-detector.js — ACP Session Stall 检测 + 自动恢复
 *
 * 检测 plan.json 是否长时间无进展（stall），如果是则触发恢复动作：
 * 1. 发送 openclaw system event 继续执行
 * 2. 汇报 stall 状态
 *
 * 用法:
 *   node scripts/stall-detector.js <plan.json路径> [--timeout 120] [--dry-run]
 *
 * 参数:
 *   --timeout <seconds>  无进展超时阈值（默认 120 秒）
 *   --dry-run            只检测不触发恢复
 *   --watch              持续监控模式（每 60s 检查一次）
 *
 * 输出:
 *   HEALTHY        — plan.json 有最近进展，无需干预
 *   STALLED        — 超时无进展，已触发恢复
 *   STALLED_DRY    — 超时无进展（dry-run，未触发）
 *   ALL_DONE       — 所有 stories 完成
 *   NO_PLAN        — plan.json 不存在
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// 解析参数
const args = process.argv.slice(2);
const planPath = args.find(a => !a.startsWith('--')) || 'plan.json';
const timeout = parseInt(args[args.indexOf('--timeout') + 1]) || 120;
const dryRun = args.includes('--dry-run');
const watchMode = args.includes('--watch');

// 状态文件路径（和 plan.json 同目录）
const stateDir = path.dirname(path.resolve(planPath));
const statePath = path.join(stateDir, '.stall-detector-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { lastSeenHash: '', lastProgressAt: 0, recoveryCount: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function hashPlan(plan) {
  // 用 passes 状态 + notes 的哈希来检测变化
  return plan.stories.map(s => `${s.id}:${s.passes}:${(s.notes || '').length}`).join('|');
}

function check() {
  // 1. 检查 plan.json 是否存在
  if (!fs.existsSync(planPath)) {
    console.log('NO_PLAN');
    return 'NO_PLAN';
  }

  // 2. 读取 plan
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const pending = plan.stories.filter(s => !s.passes);

  // 3. 全部完成
  if (pending.length === 0) {
    console.log('ALL_DONE: 所有 stories 已完成');
    return 'ALL_DONE';
  }

  // 4. 检查进展
  const state = loadState();
  const currentHash = hashPlan(plan);
  const now = Math.floor(Date.now() / 1000);

  if (currentHash !== state.lastSeenHash) {
    // 有变化 → 更新状态
    state.lastSeenHash = currentHash;
    state.lastProgressAt = now;
    state.recoveryCount = 0;
    saveState(state);
    console.log(`HEALTHY: plan.json 有变化，${pending.length} stories 待执行`);
    return 'HEALTHY';
  }

  // 无变化 → 检查超时
  const elapsed = now - (state.lastProgressAt || now);

  if (elapsed < timeout) {
    console.log(`HEALTHY: 无变化 ${elapsed}s（阈值 ${timeout}s），${pending.length} stories 待执行`);
    // 首次记录
    if (!state.lastProgressAt) {
      state.lastProgressAt = now;
      state.lastSeenHash = currentHash;
      saveState(state);
    }
    return 'HEALTHY';
  }

  // 超时 → stall!
  const next = pending.sort((a, b) => a.priority - b.priority)[0];
  console.log(`STALLED: ${elapsed}s 无进展（阈值 ${timeout}s）`);
  console.log(`  下一个: ${next.id} - ${next.title}`);
  console.log(`  已恢复次数: ${state.recoveryCount}`);

  if (dryRun) {
    console.log('STALLED_DRY: dry-run 模式，未触发恢复');
    return 'STALLED_DRY';
  }

  // 最多自动恢复 3 次，避免死循环
  if (state.recoveryCount >= 3) {
    console.log('STALLED_MAX: 已达最大恢复次数（3），需人工干预');
    return 'STALLED_MAX';
  }

  // 触发恢复
  const msg = [
    `plan.json 检测到 stall（${elapsed}s 无进展）。`,
    `下一个 story: ${next.id}: ${next.title}。`,
    `请用 sessions_spawn 执行（注意：system event 没有 channel context，`,
    `必须用 mode:"run" 且不带 thread:true，否则会报错）。`,
    `如果上一个 ACP session 已 dead/stalled，请重新 spawn。`,
    `不要只汇报状态，直接执行。`,
  ].join(' ');

  try {
    execSync(`openclaw system event --text "${msg}" --mode now`, { stdio: 'inherit' });
    state.recoveryCount++;
    state.lastProgressAt = now; // 重置计时
    saveState(state);
    console.log(`STALLED: 已触发恢复（第 ${state.recoveryCount} 次）`);
    return 'STALLED';
  } catch (e) {
    console.error('RECOVERY_FAILED: ' + e.message);
    return 'RECOVERY_FAILED';
  }
}

// 执行
if (watchMode) {
  console.log(`监控模式：每 60s 检查 ${planPath}，超时阈值 ${timeout}s`);
  check();
  setInterval(check, 60000);
} else {
  check();
}
