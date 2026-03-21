#!/usr/bin/env node
/**
 * ACP relay fallback inspector
 *
 * Usage:
 *   node scripts/relay-fallback.js --stream-log <path>
 *
 * It prints whether parent relay saw start/stall/done/error and suggests fallback actions.
 */
const fs = require('fs');

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const streamLog = arg('--stream-log');
if (!streamLog) {
  console.error('Missing --stream-log <path>');
  process.exit(2);
}
if (!fs.existsSync(streamLog)) {
  console.error(`Stream log not found: ${streamLog}`);
  process.exit(3);
}

const lines = fs.readFileSync(streamLog, 'utf8').split('\n').filter(Boolean);
const events = [];
for (const line of lines) {
  try { events.push(JSON.parse(line)); } catch {}
}

const hasStart = events.some(e => e.kind === 'system_event' && /:start$/.test(String(e.contextKey || '')));
const hasStall = events.some(e => e.kind === 'system_event' && /:stall$/.test(String(e.contextKey || '')));
const hasDone = events.some(e => e.kind === 'system_event' && /:done$/.test(String(e.contextKey || '')));
const hasError = events.some(e => e.kind === 'system_event' && /:error$/.test(String(e.contextKey || '')));
const hasAssistantDelta = events.some(e => e.kind === 'assistant_delta');

console.log(JSON.stringify({
  streamLog,
  events: events.length,
  hasStart,
  hasStall,
  hasDone,
  hasError,
  hasAssistantDelta,
  diagnosis: (
    hasStart && hasStall && !hasDone && !hasError && !hasAssistantDelta
      ? 'relay_stalled_without_terminal_event'
      : hasDone
      ? 'relay_completed'
      : hasError
      ? 'relay_error'
      : 'unknown'
  ),
  nextSteps: [
    'If diagnosis=relay_stalled_without_terminal_event, query child session via sessions_history(childSessionKey).',
    'If child has assistant output, send summary back to parent manually.',
    'Also inspect ~/.acpx/sessions/*.stream.ndjson for stopReason:end_turn.'
  ]
}, null, 2));
