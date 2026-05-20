import { getRouteDecision, TASK_CATEGORIES, type TaskCategory } from '../core/router';
import { inspectPlan, type PlanStatus } from '../core/scheduler';

function getStoryCategory(rawValue: unknown): TaskCategory {
  if (typeof rawValue === 'string' && TASK_CATEGORIES.includes(rawValue as TaskCategory)) {
    return rawValue as TaskCategory;
  }

  return 'standard';
}

export function buildRunPlanReport(result: PlanStatus) {
  if (result.kind !== 'PENDING') {
    return result;
  }

  const category = getStoryCategory(result.nextStory.category);
  const route = getRouteDecision(category);

  return {
    ...result,
    route,
    suggestedAction: {
      kind: 'route_and_spawn',
      summary: `Next story ${result.nextStory.id} should route to ${route.agentId} via ${route.runtime}.`,
      category
    }
  };
}

export function runPlanCommand(planPath?: string): number {
  const resolvedPlanPath = planPath ?? '.oma/plans/plan.json';
  const result = inspectPlan(resolvedPlanPath);
  console.log(JSON.stringify(buildRunPlanReport(result), null, 2));
  return result.kind === 'NO_PLAN' ? 1 : 0;
}
