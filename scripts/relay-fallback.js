#!/usr/bin/env node
/**
 * ACP relay fallback toolkit
 *
 * Modes:
 *   inspect:  node scripts/relay-fallback.js --stream-log <path>
 *   watch:    node scripts/relay-fallback.js --watch --stream-log <path> [--timeout 75] [--child-log <path>]
 *
 * inspect: one-shot diagnosis of a relay stream log.
 * watch:   monitors the stream log in real-time, triggers fallback after timeout.
 */
const fs = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function emitTelemetry(event, data) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...data
  };
  const logDir = path.join(process.env.HOME || '~', '.openclaw', 'telemetry');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'relay-fallback.ndjson'),
      JSON.stringify(entry) + '\n'
    );
  } catch {
    // telemetry is best-effort
  }
  return entry;
}

// ── stream log parser ────────────────────────────────────────────────────────

function parseStreamLog(filePath) {
  if (!fs.existsSync(filePath)) return { events: [], raw: '' };
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch {}
  }
  return { events, raw };
}

function diagnose(events) {
  const hasStart = events.some(e => e.kind === 'system_event' && /:start$/.test(String(e.contextKey || '')));
  const hasStall = events.some(e => e.kind === 'system_event' && /:stall$/.test(String(e.contextKey || '')));
  const hasDone = events.some(e => e.kind === 'system_event' && /:done$/.test(String(e.contextKey || '')));
  const hasError = events.some(e => e.kind === 'system_event' && /:error$/.test(String(e.contextKey || '')));
  const hasAssistantDelta = events.some(e => e.kind === 'assistant_delta');

  let diagnosis;
  if (hasStart && hasStall && !hasDone && !hasError && !hasAssistantDelta) {
    diagnosis = 'relay_stalled_without_terminal_event';
  } else if (hasDone) {
    diagnosis = 'relay_completed';
  } else if (hasError) {
    diagnosis = 'relay_error';
  } else if (hasStart && !hasStall && !hasDone) {
    diagnosis = 'relay_started_waiting';
  } else {
    diagnosis = 'unknown';
  }

  return { hasStart, hasStall, hasDone, hasError, hasAssistantDelta, diagnosis };
}

// ── child log recovery ───────────────────────────────────────────────────────

function recoverFromChildLog(childLogPath) {
  if (!childLogPath || !fs.existsSync(childLogPath)) return null;

  const { events } = parseStreamLog(childLogPath);

  // acpx child logs use JSON-RPC format (session/update with agent_message_chunk)
  // Also support older flat-event format for compatibility
  const assistantMessages = events.filter(e => {
    // JSON-RPC format: { method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk" } } }
    if (e.method === 'session/update') {
      const update = (e.params || {}).update || {};
      return update.sessionUpdate === 'agent_message_chunk';
    }
    // Flat-event format (relay logs)
    return e.kind === 'assistant_delta' || e.type === 'assistant' || e.role === 'assistant';
  });

  const hasEndTurn = events.some(e => {
    // JSON-RPC result with stopReason
    if (e.result && e.result.stopReason === 'end_turn') return true;
    // Flat-event format
    return e.stopReason === 'end_turn' || (e.data && e.data.stopReason === 'end_turn');
  });

  // extract text content from assistant events
  const textParts = [];
  for (const msg of assistantMessages) {
    // JSON-RPC format: params.update.content.text
    const update = (msg.params || {}).update || {};
    const content = update.content || {};
    if (content.text) { textParts.push(content.text); continue; }
    // Flat-event format
    if (msg.text) textParts.push(msg.text);
    else if (msg.content) textParts.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
    else if (msg.delta) textParts.push(typeof msg.delta === 'string' ? msg.delta : JSON.stringify(msg.delta));
  }

  return {
    found: assistantMessages.length > 0,
    messageCount: assistantMessages.length,
    hasEndTurn,
    text: textParts.join(''),
    childLogPath
  };
}

function findChildLog(streamLogPath) {
  // try to find child session log from acpx sessions dir
  const acpxDir = path.join(process.env.HOME || '~', '.acpx', 'sessions');
  if (!fs.existsSync(acpxDir)) return null;

  // get the most recently modified .stream.ndjson file
  try {
    const files = fs.readdirSync(acpxDir)
      .filter(f => f.endsWith('.stream.ndjson'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(acpxDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0) return path.join(acpxDir, files[0].name);
  } catch {}
  return null;
}

// ── mode: inspect ────────────────────────────────────────────────────────────

function modeInspect(streamLog) {
  const { events } = parseStreamLog(streamLog);
  const d = diagnose(events);

  const childLogPath = arg('--child-log') || findChildLog(streamLog);
  const childRecovery = recoverFromChildLog(childLogPath);

  const result = {
    streamLog,
    events: events.length,
    ...d,
    childRecovery,
    nextSteps: []
  };

  if (d.diagnosis === 'relay_stalled_without_terminal_event') {
    result.nextSteps.push('Query child session via sessions_history(childSessionKey).');
    if (childRecovery && childRecovery.found) {
      result.nextSteps.push(`Child completed (${childRecovery.messageCount} messages, endTurn=${childRecovery.hasEndTurn}). Relay child output to parent.`);
    } else {
      result.nextSteps.push('Inspect ~/.acpx/sessions/*.stream.ndjson for stopReason:end_turn.');
    }
    emitTelemetry('relay_stall_detected', { streamLog, eventCount: events.length });
  } else if (d.diagnosis === 'relay_completed') {
    emitTelemetry('relay_completed', { streamLog, eventCount: events.length });
  }

  console.log(JSON.stringify(result, null, 2));
}

// ── mode: watch ──────────────────────────────────────────────────────────────

function modeWatch(streamLog, timeoutSec) {
  const startTime = Date.now();
  const timeoutMs = timeoutSec * 1000;
  let lastCheck = 0;
  let resolved = false;

  emitTelemetry('relay_watch_start', { streamLog, timeoutSec });

  console.error(`[relay-fallback] Watching ${streamLog} (timeout: ${timeoutSec}s)`);

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const { events } = parseStreamLog(streamLog);
    const d = diagnose(events);

    // completed or errored → done
    if (d.hasDone || d.hasError || d.hasAssistantDelta) {
      resolved = true;
      clearInterval(interval);
      const status = d.hasDone ? 'relay_completed' : d.hasError ? 'relay_error' : 'relay_got_delta';
      emitTelemetry(status, { streamLog, elapsedMs: elapsed });
      console.log(JSON.stringify({
        status,
        elapsedMs: elapsed,
        ...d
      }, null, 2));
      process.exit(0);
    }

    // timeout → attempt fallback
    if (elapsed >= timeoutMs) {
      clearInterval(interval);
      console.error(`[relay-fallback] Timeout after ${timeoutSec}s. Attempting child recovery...`);

      const childLogPath = arg('--child-log') || findChildLog(streamLog);
      const childRecovery = recoverFromChildLog(childLogPath);

      const status = (childRecovery && childRecovery.found)
        ? 'fallback_success'
        : 'fallback_no_child_result';

      emitTelemetry(status, {
        streamLog,
        childLogPath: childLogPath || 'not_found',
        childMessages: childRecovery ? childRecovery.messageCount : 0
      });

      const result = {
        status,
        elapsedMs: elapsed,
        relay: d,
        childRecovery,
        action: (childRecovery && childRecovery.found)
          ? 'Use childRecovery.text as the agent result. Relay to parent/user.'
          : 'No child result found. Try sessions_history(childSessionKey) or re-dispatch via direct acpx.'
      };

      console.log(JSON.stringify(result, null, 2));
      process.exit(childRecovery && childRecovery.found ? 0 : 1);
    }

    // progress tick every 15s
    if (elapsed - lastCheck >= 15000) {
      lastCheck = elapsed;
      console.error(`[relay-fallback] ${Math.round(elapsed / 1000)}s elapsed, ${events.length} events, diagnosis: ${d.diagnosis}`);
    }
  }, 2000);
}

// ── main ─────────────────────────────────────────────────────────────────────

const streamLog = arg('--stream-log');
if (!streamLog) {
  console.error('Usage:');
  console.error('  inspect: node scripts/relay-fallback.js --stream-log <path>');
  console.error('  watch:   node scripts/relay-fallback.js --watch --stream-log <path> [--timeout 75] [--child-log <path>]');
  process.exit(2);
}
if (!fs.existsSync(streamLog)) {
  console.error(`Stream log not found: ${streamLog}`);
  process.exit(3);
}

if (hasFlag('--watch')) {
  const timeout = parseInt(arg('--timeout') || '75', 10);
  modeWatch(streamLog, timeout);
} else {
  modeInspect(streamLog);
}
