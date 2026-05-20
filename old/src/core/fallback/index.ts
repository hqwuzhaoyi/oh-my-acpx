import { diagnoseRelayEvents } from './diagnosis';
import { parseRelayFallbackArgs } from './options';
import { findLatestAcpxChildLog, parseRelayLogFile, parseRelayLogText, recoverChildLogFile, recoverChildLogText, resolveRelayChildLogPath } from './relay-log';
import {
  buildRelayInspectOutput,
  buildRelayInspectReport,
  buildRelayWatchOutput,
  buildRelayWatchTerminalResult,
  buildRelayWatchTimeoutResult,
  evaluateRelayWatchStep
} from './report';
import type { RelayEvent } from './types';

export function inspectRelayLogFile(filePath: string) {
  const parsed = parseRelayLogFile(filePath);
  return {
    ...parsed,
    inspection: diagnoseRelayEvents(parsed.events)
  };
}

export function inspectRelayLogText(raw: string) {
  const parsed = parseRelayLogText(raw);
  return {
    ...parsed,
    inspection: diagnoseRelayEvents(parsed.events)
  };
}

export function parseStreamLogText(raw: string): RelayEvent[] {
  return parseRelayLogText(raw).events;
}

export function loadRelayInspectionContext(args: {
  streamLog: string;
  childLogPath?: string;
  homeDir?: string;
}) {
  const parsed = parseRelayLogFile(args.streamLog);
  const inspection = diagnoseRelayEvents(parsed.events);
  const childLogPath = resolveRelayChildLogPath({
    childLogPath: args.childLogPath,
    homeDir: args.homeDir
  });
  const childRecovery = recoverChildLogFile(childLogPath);

  return {
    streamLog: args.streamLog,
    parsed,
    inspection,
    childLogPath,
    childRecovery
  };
}

export {
  buildRelayInspectReport,
  buildRelayInspectOutput,
  buildRelayWatchOutput,
  buildRelayWatchTerminalResult,
  buildRelayWatchTimeoutResult,
  evaluateRelayWatchStep,
  diagnoseRelayEvents,
  findLatestAcpxChildLog,
  parseRelayFallbackArgs,
  parseRelayLogFile,
  parseRelayLogText,
  recoverChildLogFile,
  recoverChildLogText,
  resolveRelayChildLogPath
};
export type {
  ChildRecoveryResult,
  RelayDiagnosis,
  RelayEvent,
  RelayFallbackCliOptions,
  RelayInspectionContext,
  RelayInspectReport,
  RelayInspectOutput,
  RelayInspection,
  RelayLogParseResult,
  RelayWatchOutput,
  RelayWatchStepDecision,
  RelayWatchTerminalResult,
  RelayWatchTimeoutResult
} from './types';
