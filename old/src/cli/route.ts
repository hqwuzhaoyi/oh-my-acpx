import { getRouteDecision, TASK_CATEGORIES, type RuntimeType, type TaskCategory } from '../core/router';

type RouteArgs = {
  category?: string;
  forceRuntime?: string;
};

export function runRouteCommand(args: RouteArgs): number {
  if (!args.category) {
    console.error(`Usage: oax route --category <category> [--force-runtime <runtime>]`);
    console.error(`Categories: ${TASK_CATEGORIES.join(', ')}`);
    return 2;
  }

  const decision = getRouteDecision(args.category as TaskCategory, args.forceRuntime as RuntimeType | undefined);
  console.log(JSON.stringify(decision, null, 2));
  return 0;
}
