#!/usr/bin/env node
/**
 * Runtime router — decides runtime strategy for a given task category.
 *
 * Usage:
 *   node scripts/runtime-router.js --category <category> [--force-runtime <runtime>]
 *
 * Returns JSON with: { runtime, agentId, fallbackChain, streamTo, timeoutSec }
 */
const ROUTING_TABLE = {
  // ── planning / research → subagent (stable completion visibility) ──────
  ultrabrain:          { runtime: 'subagent', agentId: 'claude',  group: 'planning' },
  deep:                { runtime: 'subagent', agentId: 'claude',  group: 'planning' },
  explore:             { runtime: 'subagent', agentId: 'codex',   group: 'planning' },
  writing:             { runtime: 'subagent', agentId: 'trae',    group: 'planning' },

  // ── coding / execution → acp (stronger harness) ───────────────────────
  standard:            { runtime: 'acp',      agentId: 'codex',   group: 'coding' },
  quick:               { runtime: 'acp',      agentId: 'trae',    group: 'coding' },
  'visual-engineering':{ runtime: 'acp',      agentId: 'trae',    group: 'coding' },
};

// fallback chain: acp → direct acpx → subagent
const FALLBACK_CHAINS = {
  coding:   ['acp', 'direct_acpx', 'subagent'],
  planning: ['subagent'],  // subagent is already the most stable
};

const TIMEOUTS = {
  coding:   75,   // seconds before relay-fallback kicks in
  planning: 120,  // subagent gets more time (usually reliable)
};

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const category = arg('--category');
const forceRuntime = arg('--force-runtime');

if (!category) {
  console.error('Usage: node scripts/runtime-router.js --category <category>');
  console.error('Categories:', Object.keys(ROUTING_TABLE).join(', '));
  process.exit(2);
}

const route = ROUTING_TABLE[category];
if (!route) {
  console.error(`Unknown category: ${category}`);
  console.error('Available:', Object.keys(ROUTING_TABLE).join(', '));
  process.exit(2);
}

const result = {
  category,
  runtime: forceRuntime || route.runtime,
  agentId: route.agentId,
  group: route.group,
  streamTo: (forceRuntime || route.runtime) === 'acp' ? 'parent' : undefined,
  timeoutSec: TIMEOUTS[route.group],
  fallbackChain: FALLBACK_CHAINS[route.group],
  spawnParams: {}
};

// build spawn parameters
if (result.runtime === 'acp') {
  result.spawnParams = {
    runtime: 'acp',
    agentId: result.agentId,
    mode: 'run',
    streamTo: 'parent'
  };
} else if (result.runtime === 'subagent') {
  result.spawnParams = {
    runtime: 'subagent',
    agentId: result.agentId
  };
} else if (result.runtime === 'direct_acpx') {
  result.spawnParams = {
    command: `acpx --approve-all --timeout ${result.timeoutSec} ${result.agentId} exec`
  };
}

console.log(JSON.stringify(result, null, 2));
