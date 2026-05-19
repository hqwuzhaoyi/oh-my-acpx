export type RelayEvent = {
  kind?: string;
  contextKey?: string;
  [key: string]: unknown;
};

export type RelayLogParseResult = {
  events: RelayEvent[];
  raw: string;
};

export type RelayDiagnosis =
  | 'relay_stalled_without_terminal_event'
  | 'relay_completed'
  | 'relay_error'
  | 'relay_started_waiting'
  | 'unknown';

export type RelayInspection = {
  hasStart: boolean;
  hasStall: boolean;
  hasDone: boolean;
  hasError: boolean;
  hasAssistantDelta: boolean;
  diagnosis: RelayDiagnosis;
};

export type ChildRecoveryResult = {
  found: boolean;
  messageCount: number;
  hasEndTurn: boolean;
  text: string;
  childLogPath?: string;
};

export type RelayInspectionContext = {
  streamLog: string;
  parsed: RelayLogParseResult;
  inspection: RelayInspection;
  childLogPath: string | null;
  childRecovery: ChildRecoveryResult | null;
};

export type RelayInspectReport = RelayInspection & {
  streamLog: string;
  events: number;
  childRecovery: ChildRecoveryResult | null;
  nextSteps: string[];
  telemetryEvent?: string;
};

export type RelayWatchTerminalResult = RelayInspection & {
  status: 'relay_completed' | 'relay_error' | 'relay_got_delta';
  elapsedMs: number;
};

export type RelayWatchTimeoutResult = {
  status: 'fallback_success' | 'fallback_no_child_result';
  elapsedMs: number;
  relay: RelayInspection;
  childRecovery: ChildRecoveryResult | null;
  action: string;
  telemetryData: {
    childLogPath: string;
    childMessages: number;
  };
};

export type RelayInspectOutput = RelayInspectReport;

export type RelayWatchOutput =
  | RelayWatchTerminalResult
  | RelayWatchTimeoutResult;

export type RelayWatchStepDecision =
  | {
      kind: 'terminal';
    }
  | {
      kind: 'timeout';
    }
  | {
      kind: 'tick';
      nextLastCheckMs: number;
    }
  | {
      kind: 'continue';
    };

export type RelayFallbackCliOptions = {
  streamLog?: string;
  childLogPath?: string;
  watch: boolean;
  timeoutSec: number;
};
