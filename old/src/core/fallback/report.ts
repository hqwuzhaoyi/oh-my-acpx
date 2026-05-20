import type {
  ChildRecoveryResult,
  RelayInspectReport,
  RelayInspection,
  RelayInspectOutput,
  RelayWatchStepDecision,
  RelayWatchOutput,
  RelayWatchTerminalResult,
  RelayWatchTimeoutResult
} from './types';

export function buildRelayInspectReport(args: {
  streamLog: string;
  eventCount: number;
  inspection: RelayInspection;
  childRecovery: ChildRecoveryResult | null;
}): RelayInspectReport {
  const nextSteps: string[] = [];
  let telemetryEvent: string | undefined;

  if (args.inspection.diagnosis === 'relay_stalled_without_terminal_event') {
    nextSteps.push('Query child session via sessions_history(childSessionKey).');
    if (args.childRecovery && args.childRecovery.found) {
      nextSteps.push(
        `Child completed (${args.childRecovery.messageCount} messages, endTurn=${args.childRecovery.hasEndTurn}). Relay child output to parent.`
      );
    } else {
      nextSteps.push('Inspect ~/.acpx/sessions/*.stream.ndjson for stopReason:end_turn.');
    }
    telemetryEvent = 'relay_stall_detected';
  } else if (args.inspection.diagnosis === 'relay_completed') {
    telemetryEvent = 'relay_completed';
  }

  return {
    streamLog: args.streamLog,
    events: args.eventCount,
    ...args.inspection,
    childRecovery: args.childRecovery,
    nextSteps,
    telemetryEvent
  };
}

export function buildRelayWatchTerminalResult(args: {
  inspection: RelayInspection;
  elapsedMs: number;
}): RelayWatchTerminalResult {
  const status = args.inspection.hasDone
    ? 'relay_completed'
    : args.inspection.hasError
      ? 'relay_error'
      : 'relay_got_delta';

  return {
    status,
    elapsedMs: args.elapsedMs,
    ...args.inspection
  };
}

export function buildRelayWatchTimeoutResult(args: {
  inspection: RelayInspection;
  elapsedMs: number;
  childRecovery: ChildRecoveryResult | null;
}): RelayWatchTimeoutResult {
  const found = !!(args.childRecovery && args.childRecovery.found);

  return {
    status: found ? 'fallback_success' : 'fallback_no_child_result',
    elapsedMs: args.elapsedMs,
    relay: args.inspection,
    childRecovery: args.childRecovery,
    action: found
      ? 'Use childRecovery.text as the agent result. Relay to parent/user.'
      : 'No child result found. Try sessions_history(childSessionKey) or re-dispatch via direct acpx.',
    telemetryData: {
      childLogPath: args.childRecovery?.childLogPath || 'not_found',
      childMessages: args.childRecovery?.messageCount || 0
    }
  };
}

export function evaluateRelayWatchStep(args: {
  inspection: RelayInspection;
  elapsedMs: number;
  timeoutMs: number;
  lastCheckMs: number;
  tickIntervalMs?: number;
}): RelayWatchStepDecision {
  if (args.inspection.hasDone || args.inspection.hasError || args.inspection.hasAssistantDelta) {
    return { kind: 'terminal' };
  }

  if (args.elapsedMs >= args.timeoutMs) {
    return { kind: 'timeout' };
  }

  const tickIntervalMs = args.tickIntervalMs ?? 15000;
  if (args.elapsedMs - args.lastCheckMs >= tickIntervalMs) {
    return {
      kind: 'tick',
      nextLastCheckMs: args.elapsedMs
    };
  }

  return { kind: 'continue' };
}

export function buildRelayInspectOutput(args: {
  streamLog: string;
  eventCount: number;
  inspection: RelayInspection;
  childRecovery: ChildRecoveryResult | null;
}): RelayInspectOutput {
  return buildRelayInspectReport(args);
}

export function buildRelayWatchOutput(args: {
  inspection: RelayInspection;
  elapsedMs: number;
  childRecovery: ChildRecoveryResult | null;
  isTerminal: boolean;
}): RelayWatchOutput {
  if (args.isTerminal) {
    return buildRelayWatchTerminalResult({
      inspection: args.inspection,
      elapsedMs: args.elapsedMs
    });
  }

  return buildRelayWatchTimeoutResult({
    inspection: args.inspection,
    elapsedMs: args.elapsedMs,
    childRecovery: args.childRecovery
  });
}
