import {
  buildRelayInspectReport,
  buildRelayWatchTerminalResult,
  buildRelayWatchTimeoutResult,
  evaluateRelayWatchStep,
  loadRelayInspectionContext
} from "../core/fallback";
import {
  DEFAULT_OMA_PLAN_PATH,
  inspectRecoveryPlanFile
} from "../core/recovery";

export type DiagnoseCommandArgs = {
  subcommand?: string;
  planPath?: string;
  streamLog?: string;
  childLog?: string;
  watch?: boolean;
  timeoutSec?: number;
};

export function runDiagnoseCommand(args: DiagnoseCommandArgs): number {
  if (!args.subcommand || (args.subcommand !== "relay" && args.subcommand !== "stall")) {
    console.error("Usage: oax diagnose relay --stream-log <path> [--child-log <path>] [--watch] [--timeout <sec>]");
    console.error("   or: oax diagnose stall [plan-path] [--timeout <sec>]");
    return 2;
  }

  if (args.subcommand === "stall") {
    const planPath = args.planPath ?? DEFAULT_OMA_PLAN_PATH;
    const timeoutSec = args.timeoutSec ?? 120;
    const inspection = inspectRecoveryPlanFile({
      planPath,
      timeout: timeoutSec,
      dryRun: true,
      now: Math.floor(Date.now() / 1000),
      defaultChatId: process.env.FEISHU_DEFAULT_CHAT_ID || ""
    });

    if (inspection.kind === "NO_PLAN") {
      console.log(JSON.stringify({ status: "NO_PLAN", planPath }, null, 2));
      return 1;
    }

    console.log(
      JSON.stringify(
        {
          planPath,
          timeoutSec,
          decision: inspection.decision
        },
        null,
        2
      )
    );

    return inspection.decision.kind === "STALLED_DRY" ? 1 : 0;
  }

  if (!args.streamLog) {
    console.error("Missing required flag: --stream-log <path>");
    return 2;
  }

  const context = loadRelayInspectionContext({
    streamLog: args.streamLog,
    childLogPath: args.childLog
  });
  const inspection = context.inspection;
  const childRecovery = context.childRecovery;

  if (args.watch) {
    const timeoutSec = args.timeoutSec ?? 75;
    const step = evaluateRelayWatchStep({
      inspection,
      elapsedMs: timeoutSec * 1000,
      timeoutMs: timeoutSec * 1000,
      lastCheckMs: 0
    });

    if (step.kind === "terminal") {
      console.log(JSON.stringify(buildRelayWatchTerminalResult({ inspection, elapsedMs: timeoutSec * 1000 }), null, 2));
      return 0;
    }

    const timeoutResult = buildRelayWatchTimeoutResult({
      inspection,
      elapsedMs: timeoutSec * 1000,
      childRecovery
    });

    console.log(JSON.stringify(timeoutResult, null, 2));
    return timeoutResult.status === "fallback_success" ? 0 : 1;
  }

  const report = buildRelayInspectReport({
    streamLog: args.streamLog,
    eventCount: context.parsed.events.length,
    inspection,
    childRecovery
  });

  console.log(
    JSON.stringify(
        {
          ...report,
          raw: context.parsed.raw
        },
        null,
        2
    )
  );

  return 0;
}
