import type { FallbackRuntime, RouteConfig, RouteGroup, TaskCategory } from './types';

export const ROUTING_TABLE: Record<TaskCategory, RouteConfig> = {
  ultrabrain: { runtime: 'subagent', agentId: 'claude', group: 'planning' },
  deep: { runtime: 'subagent', agentId: 'claude', group: 'planning' },
  explore: { runtime: 'subagent', agentId: 'codex', group: 'planning' },
  writing: { runtime: 'subagent', agentId: 'trae', group: 'planning' },
  standard: { runtime: 'acp', agentId: 'codex', group: 'coding' },
  quick: { runtime: 'acp', agentId: 'trae', group: 'coding' },
  'visual-engineering': { runtime: 'acp', agentId: 'trae', group: 'coding' }
};

export const FALLBACK_CHAINS: Record<RouteGroup, FallbackRuntime[]> = {
  coding: ['acp', 'direct_acpx', 'subagent'],
  planning: ['subagent']
};

export const TIMEOUTS: Record<RouteGroup, number> = {
  coding: 75,
  planning: 120
};

export const TASK_CATEGORIES = Object.keys(ROUTING_TABLE) as TaskCategory[];
