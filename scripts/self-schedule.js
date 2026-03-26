#!/usr/bin/env node
/**
 * self-schedule.js — 自调度检查脚本
 *
 * 每个 agent turn 结束前运行。
 * 读取 plan.json，如果还有 passes:false 的 story，
 * 自动调用 openclaw system event 触发下一轮。
 *
 * 用法:
 *   node scripts/self-schedule.js [plan.json路径]
 *
 * 输出:
 *   NO_PLAN         — 没有 plan.json，跳过
 *   ALL_DONE        — 所有 stories 已完成
 *   TRIGGERED       — 已触发下一轮
 *   TRIGGER_FAILED  — 触发失败（需手动兜底）
 */

const fs = require('fs');
const { execSync } = require('child_process');

const planPath = process.argv[2] || 'plan.json';

// 1. 检查 plan.json 是否存在
if (!fs.existsSync(planPath)) {
  console.log('NO_PLAN');
  process.exit(0);
}

// 2. 读取并解析
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const pending = plan.stories.filter(s => !s.passes);

// 3. 全部完成
if (pending.length === 0) {
  console.log('ALL_DONE: 所有 stories 已完成');
  process.exit(0);
}

// 4. 还有待办 → 触发下一轮
const next = pending.sort((a, b) => a.priority - b.priority)[0];
console.log(`PENDING: ${pending.length} stories 待执行，下一个: ${next.id} - ${next.title}`);

const msg = [
  `继续执行 plan.json：下一个 story 是 ${next.id}: ${next.title}。`,
  '读取 plan.json，按 acp-orchestrator skill 的执行模式直接推进，不要只汇报。',
].join('');

try {
  execSync(`openclaw system event --text "${msg}" --mode now`, { stdio: 'inherit' });
  console.log('TRIGGERED: 已触发下一轮');
} catch (e) {
  console.error('TRIGGER_FAILED: ' + e.message);
  process.exit(1);
}
