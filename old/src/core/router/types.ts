export type RuntimeType = 'acp' | 'subagent' | 'direct_acpx';

export type TaskCategory =
  | 'ultrabrain'
  | 'deep'
  | 'explore'
  | 'writing'
  | 'standard'
  | 'quick'
  | 'visual-engineering';

export type RouteGroup = 'planning' | 'coding';

export type FallbackRuntime = 'acp' | 'direct_acpx' | 'subagent';

export type RouteConfig = {
  runtime: RuntimeType;
  agentId: string;
  group: RouteGroup;
};

export type SpawnParams = {
  runtime: RuntimeType;
  agentId: string;
  mode?: 'run';
  streamTo?: 'parent';
};

export type RouteDecision = {
  category: TaskCategory;
  runtime: RuntimeType;
  agentId: string;
  group: RouteGroup;
  streamTo?: 'parent';
  timeoutSec: number;
  fallbackChain: FallbackRuntime[];
  spawnParams: SpawnParams;
};
