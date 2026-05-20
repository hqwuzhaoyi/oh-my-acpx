import { FALLBACK_CHAINS, ROUTING_TABLE, TASK_CATEGORIES, TIMEOUTS } from './rules';
import type { RouteDecision, RuntimeType, SpawnParams, TaskCategory } from './types';

function buildSpawnParams(runtime: RuntimeType, agentId: string): SpawnParams {
  if (runtime === 'acp') {
    return {
      runtime,
      agentId,
      mode: 'run',
      streamTo: 'parent'
    };
  }

  if (runtime === 'subagent') {
    return {
      runtime,
      agentId
    };
  }

  return {
    runtime,
    agentId,
    mode: 'run'
  };
}

export function getRouteDecision(category: TaskCategory, forceRuntime?: RuntimeType): RouteDecision {
  const route = ROUTING_TABLE[category];
  if (!route) {
    throw new Error(`Unknown category: ${category}`);
  }

  const runtime = forceRuntime ?? route.runtime;

  return {
    category,
    runtime,
    agentId: route.agentId,
    group: route.group,
    streamTo: runtime === 'acp' ? 'parent' : undefined,
    timeoutSec: TIMEOUTS[route.group],
    fallbackChain: FALLBACK_CHAINS[route.group],
    spawnParams: buildSpawnParams(runtime, route.agentId)
  };
}

export { TASK_CATEGORIES };
export type { RouteDecision, RuntimeType, TaskCategory } from './types';
