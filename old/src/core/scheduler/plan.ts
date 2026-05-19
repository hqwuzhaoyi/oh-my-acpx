import fs from 'node:fs';
import type { NextStorySelection, PlanFile, PlanStatus, PlanStory, SelfScheduleOutput } from './types';

export function readPlanFile(planPath: string): PlanFile | null {
  if (!fs.existsSync(planPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(planPath, 'utf8')) as PlanFile;
}

export function getPendingStories(plan: PlanFile): PlanStory[] {
  return plan.stories.filter((story) => !story.passes);
}

export function getNextStory(plan: PlanFile): PlanStory | null {
  const pending = getPendingStories(plan);
  if (pending.length === 0) {
    return null;
  }

  return [...pending].sort((left, right) => (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER))[0];
}

export function buildSelfScheduleMessage(nextStory: PlanStory): string {
  return [
    `继续执行 .oma/plans/plan.json：下一个 story 是 ${nextStory.id}: ${nextStory.title}。`,
    '读取 .oma/plans/plan.json，按 acp-orchestrator skill 的执行模式直接推进，不要只汇报。'
  ].join('');
}

export function inspectPlan(planPath: string): PlanStatus {
  const plan = readPlanFile(planPath);
  if (!plan) {
    return { kind: 'NO_PLAN', status: 'NO_PLAN', planPath };
  }

  const nextStory = getNextStory(plan);
  if (!nextStory) {
    return { kind: 'ALL_DONE', status: 'ALL_DONE', planPath, totalStories: plan.stories.length };
  }

  const pendingStories = getPendingStories(plan);

  return {
    kind: 'PENDING',
    status: 'PENDING',
    planPath,
    pendingCount: pendingStories.length,
    nextStory,
    message: buildSelfScheduleMessage(nextStory)
  };
}

export function selectNextStory(plan: PlanFile): NextStorySelection {
  const nextStory = getNextStory(plan);

  if (!nextStory) {
    return {
      kind: 'ALL_DONE',
      status: 'ALL_DONE',
      totalStories: plan.stories.length
    };
  }

  return {
    kind: 'PENDING',
    status: 'PENDING',
    nextStory
  };
}

export function buildSelfScheduleOutput(status: PlanStatus): SelfScheduleOutput {
  if (status.kind === 'NO_PLAN') {
    return {
      kind: 'NO_PLAN',
      exitCode: 0,
      lines: ['NO_PLAN']
    };
  }

  if (status.kind === 'ALL_DONE') {
    return {
      kind: 'ALL_DONE',
      exitCode: 0,
      lines: ['ALL_DONE: 所有 stories 已完成']
    };
  }

  return {
    kind: 'PENDING',
    exitCode: 0,
    lines: [`PENDING: ${status.pendingCount} stories 待执行，下一个: ${status.nextStory.id} - ${status.nextStory.title}`],
    message: status.message
  };
}
