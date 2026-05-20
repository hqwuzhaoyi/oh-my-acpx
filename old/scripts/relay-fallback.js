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

let appendRelayFallbackTelemetry;
let buildRelayInspectOutput;
let buildRelayInspectReport;
let buildRelayWatchOutput;
let buildRelayWatchTerminalResult;
let buildRelayWatchTimeoutResult;
let evaluateRelayWatchStep;
let loadRelayInspectionContext;
let parseRelayFallbackArgs;

try {
  ({
    buildRelayInspectReport,
    buildRelayInspectOutput,
    buildRelayWatchOutput,
    buildRelayWatchTerminalResult,
    buildRelayWatchTimeoutResult,
    evaluateRelayWatchStep,
    loadRelayInspectionContext,
    parseRelayFallbackArgs,
  } = require('../dist/src/core/fallback'));
  ({ appendRelayFallbackTelemetry } = require('../dist/src/integrations/telemetry/ndjson'));
} catch {
  console.error('Missing compiled fallback/telemetry module. Run `npm run build` first.');
  process.exit(2);
}

// ── stream log parser ────────────────────────────────────────────────────────

// ── child log recovery ───────────────────────────────────────────────────────

// ── mode: inspect ────────────────────────────────────────────────────────────

function modeInspect(streamLog, options) {
  const context = loadRelayInspectionContext({
    streamLog,
    childLogPath: options.childLogPath
  });

  const result = buildRelayInspectOutput({
    streamLog,
    eventCount: context.parsed.events.length,
    inspection: context.inspection,
    childRecovery: context.childRecovery
  });

  if (result.telemetryEvent) {
    try {
      appendRelayFallbackTelemetry(result.telemetryEvent, { streamLog, eventCount: context.parsed.events.length });
    } catch {
      // telemetry is best-effort
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

// ── mode: watch ──────────────────────────────────────────────────────────────

function modeWatch(streamLog, timeoutSec, options) {
  const startTime = Date.now();
  const timeoutMs = timeoutSec * 1000;
  let lastCheck = 0;
  let resolved = false;

  try {
    appendRelayFallbackTelemetry('relay_watch_start', { streamLog, timeoutSec });
  } catch {
    // telemetry is best-effort
  }

  console.error(`[relay-fallback] Watching ${streamLog} (timeout: ${timeoutSec}s)`);

  const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const context = loadRelayInspectionContext({
      streamLog,
      childLogPath: options.childLogPath
    });
    const d = context.inspection;
    const step = evaluateRelayWatchStep({
      inspection: d,
      elapsedMs: elapsed,
      timeoutMs,
      lastCheckMs: lastCheck
    });

    if (step.kind === 'terminal') {
      resolved = true;
      clearInterval(interval);
      const result = buildRelayWatchOutput({
        inspection: d,
        elapsedMs: elapsed,
        childRecovery: context.childRecovery,
        isTerminal: true
      });
      try {
        appendRelayFallbackTelemetry(result.status, { streamLog, elapsedMs: elapsed });
      } catch {
        // telemetry is best-effort
      }
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    if (step.kind === 'timeout') {
      clearInterval(interval);
      console.error(`[relay-fallback] Timeout after ${timeoutSec}s. Attempting child recovery...`);

      const result = buildRelayWatchOutput({
        inspection: d,
        elapsedMs: elapsed,
        childRecovery: context.childRecovery,
        isTerminal: false
      });

      try {
        appendRelayFallbackTelemetry(result.status, {
          streamLog,
          ...result.telemetryData
        });
      } catch {
        // telemetry is best-effort
      }

      console.log(JSON.stringify(result, null, 2));
      process.exit(result.childRecovery && result.childRecovery.found ? 0 : 1);
    }

    if (step.kind === 'tick') {
      lastCheck = step.nextLastCheckMs;
      console.error(`[relay-fallback] ${Math.round(elapsed / 1000)}s elapsed, ${context.parsed.events.length} events, diagnosis: ${d.diagnosis}`);
    }
  }, 2000);
}

// ── main ─────────────────────────────────────────────────────────────────────

const options = parseRelayFallbackArgs(process.argv.slice(2));
const streamLog = options.streamLog;
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

if (options.watch) {
  modeWatch(streamLog, options.timeoutSec, options);
} else {
  modeInspect(streamLog, options);
}
