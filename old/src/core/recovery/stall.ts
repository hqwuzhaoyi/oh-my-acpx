import fs from "node:fs";
import path from "node:path";

import type {
  CompletedRelaySession,
  RecoveryActionOutcome,
  RecoveryDecision,
  RecoveryEventMessageInput,
  RecoveryInspectionOutput,
  RecoveryPlanInspection,
  RecoveryPlanFile,
  RecoveryPlanStory,
  RecoveryState
} from "./types";

export const DEFAULT_OMA_PLAN_PATH = ".oma/plans/plan.json";

export function getRecoveryStatePath(planPath: string): string {
  return path.join(path.dirname(path.resolve(planPath)), ".stall-detector-state.json");
}

export function loadRecoveryState(statePath: string): RecoveryState {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as RecoveryState;
  } catch {
    return {
      lastSeenHash: "",
      lastProgressAt: 0,
      recoveryCount: 0,
      relayedSessions: []
    };
  }
}

export function saveRecoveryState(statePath: string, state: RecoveryState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function hashRecoveryPlan(plan: { stories: Array<{ id: string; passes: boolean; notes?: string }> }): string {
  return plan.stories.map((story) => `${story.id}:${story.passes}:${(story.notes || "").length}`).join("|");
}

export function getPendingRecoveryStories(plan: RecoveryPlanFile): RecoveryPlanStory[] {
  return plan.stories.filter((story) => !story.passes);
}

export function getNextRecoveryStory(plan: RecoveryPlanFile): RecoveryPlanStory | null {
  const pending = getPendingRecoveryStories(plan);
  if (pending.length === 0) {
    return null;
  }

  return [...pending].sort((left, right) => (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER))[0];
}

export function inspectRecoveryProgress({
  plan,
  state,
  now,
  timeout,
  dryRun,
  defaultChatId = ""
}: {
  plan: RecoveryPlanFile;
  state: RecoveryState;
  now: number;
  timeout: number;
  dryRun: boolean;
  defaultChatId?: string;
}): RecoveryDecision {
  const pending = getPendingRecoveryStories(plan);
  if (pending.length === 0) {
    return { kind: "ALL_DONE", pendingCount: 0 };
  }

  const nextStory = getNextRecoveryStory(plan);
  if (!nextStory) {
    return { kind: "ALL_DONE", pendingCount: 0 };
  }

  const currentHash = hashRecoveryPlan(plan);
  if (currentHash !== state.lastSeenHash) {
    return {
      kind: "HEALTHY_CHANGED",
      pendingCount: pending.length,
      nextStory,
      nextState: {
        ...state,
        lastSeenHash: currentHash,
        lastProgressAt: now,
        recoveryCount: 0
      }
    };
  }

  const elapsed = now - (state.lastProgressAt || now);
  if (elapsed < timeout) {
    const nextState =
      state.lastProgressAt === 0
        ? {
            ...state,
            lastSeenHash: currentHash,
            lastProgressAt: now
          }
        : undefined;

    return {
      kind: "HEALTHY_WAITING",
      pendingCount: pending.length,
      nextStory,
      elapsed,
      nextState
    };
  }

  if (dryRun) {
    return {
      kind: "STALLED_DRY",
      pendingCount: pending.length,
      nextStory,
      elapsed,
      recoveryCount: state.recoveryCount
    };
  }

  if (state.recoveryCount >= 3) {
    return {
      kind: "STALLED_MAX",
      pendingCount: pending.length,
      nextStory,
      elapsed,
      recoveryCount: state.recoveryCount
    };
  }

  const chatId = plan.channel?.chat_id || defaultChatId;

  return {
    kind: "STALLED_READY",
    pendingCount: pending.length,
    nextStory,
    elapsed,
    recoveryCount: state.recoveryCount,
    chatId,
    recoveryMessage: [
      `plan 在 ${elapsed}s 内无进展，当前卡在 ${nextStory.id}: ${nextStory.title}。`,
      `请执行以下操作：`,
      `1. 诊断卡住原因（检查 ACP session 状态，是否 dead/stalled）`,
      `2. 恢复执行：用 sessions_spawn({ runtime:"acp", agentId:"${nextStory.agent || "claude"}", mode:"run", streamTo:"parent", task:"${nextStory.title}" }) 重新执行`,
      `3. 完成后用 feishu_im_user_message 发送飞书消息到群组 ${chatId}，用简洁的中文告诉用户当前进展和结果`,
      `注意：你现在没有 channel context，必须用 mode:"run" 且不带 thread:true。`
    ].join("\n"),
    notifyMessage: `📋 ${nextStory.title}\n任务已卡住 ${elapsed}s，正在自动恢复（第 ${state.recoveryCount + 1} 次）\n如果连续失败会通知你手动处理`
  };
}

export function inspectRecoveryPlanFile(args: {
  planPath: string;
  timeout: number;
  dryRun: boolean;
  now: number;
  defaultChatId?: string;
}): RecoveryPlanInspection {
  const statePath = getRecoveryStatePath(args.planPath);
  const state = loadRecoveryState(statePath);

  if (!fs.existsSync(args.planPath)) {
    return {
      kind: "NO_PLAN",
      planPath: args.planPath,
      statePath,
      state
    };
  }

  const plan = JSON.parse(fs.readFileSync(args.planPath, "utf8")) as RecoveryPlanFile;
  const decision = inspectRecoveryProgress({
    plan,
    state,
    now: args.now,
    timeout: args.timeout,
    dryRun: args.dryRun,
    defaultChatId: args.defaultChatId
  });

  return {
    kind: "DECISION",
    planPath: args.planPath,
    statePath,
    plan,
    state,
    timeout: args.timeout,
    dryRun: args.dryRun,
    decision
  };
}

export function parseCompletedRelaySession(args: {
  sessionId: string;
  raw: string;
  fallbackAgentId: string;
}): CompletedRelaySession | null {
  const lines = args.raw.split("\n").filter(Boolean);
  let doneEvent: Record<string, any> | null = null;
  let lastProgress: Record<string, any> | null = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, any>;
      if (entry.kind !== "system_event") {
        continue;
      }

      const ctx = String(entry.contextKey || "");
      if (ctx.endsWith(":done")) {
        doneEvent = entry;
      } else if (ctx.endsWith(":progress")) {
        lastProgress = entry;
      }
    } catch {
      // ignore malformed lines
    }
  }

  if (!doneEvent) {
    return null;
  }

  const parentKey = String(doneEvent.parentSessionKey || "");
  const chatId = parentKey.split(":").pop() || "";
  if (!chatId.startsWith("oc_")) {
    return null;
  }

  return {
    sessionId: args.sessionId,
    agentId: String(doneEvent.agentId || args.fallbackAgentId),
    runId: doneEvent.runId ? String(doneEvent.runId) : undefined,
    summary: lastProgress ? String(lastProgress.text || "") : String(doneEvent.text || ""),
    chatId,
    doneAt: Number(doneEvent.epochMs || new Date(String(doneEvent.ts || 0)).getTime())
  };
}

export function classifyRelaySessionsToProcess(args: {
  completed: CompletedRelaySession[];
  relayedSessionIds: string[];
  now: number;
  maxAgeMs: number;
}): {
  toNotify: CompletedRelaySession[];
  updatedRelayedSessionIds: string[];
} {
  const relayed = new Set(args.relayedSessionIds);
  const toNotify: CompletedRelaySession[] = [];

  for (const session of args.completed) {
    if (relayed.has(session.sessionId)) {
      continue;
    }

    if (args.now - session.doneAt > args.maxAgeMs) {
      relayed.add(session.sessionId);
      continue;
    }

    toNotify.push(session);
    relayed.add(session.sessionId);
  }

  return {
    toNotify,
    updatedRelayedSessionIds: [...relayed].slice(-100)
  };
}

export function scanCompletedRelaySessionsFromAgentsDir(agentsDir: string): CompletedRelaySession[] {
  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  const results: CompletedRelaySession[] = [];
  const agents = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory());

  for (const agentDir of agents) {
    const sessionsDir = path.join(agentsDir, agentDir.name, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      continue;
    }

    const files = fs.readdirSync(sessionsDir).filter((file) => file.endsWith('.acp-stream.jsonl'));
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      const sessionId = file.replace('.acp-stream.jsonl', '');

      try {
        const parsed = parseCompletedRelaySession({
          sessionId,
          fallbackAgentId: agentDir.name,
          raw: fs.readFileSync(filePath, 'utf8')
        });

        if (parsed) {
          results.push(parsed);
        }
      } catch {
        // ignore malformed files
      }
    }
  }

  return results;
}

export function buildRecoveryActionOutcome(args: {
  state: RecoveryState;
  now: number;
  succeeded: boolean;
}): RecoveryActionOutcome {
  const nextState: RecoveryState = {
    ...args.state,
    recoveryCount: args.state.recoveryCount + 1,
    lastProgressAt: args.now
  };

  if (args.succeeded) {
    return {
      kind: "RECOVERY_SUCCEEDED",
      nextState,
      summary: `STALLED: 已恢复（第 ${nextState.recoveryCount} 次）`
    };
  }

  return {
    kind: "RECOVERY_FAILED",
    nextState,
    summary: "RECOVERY_FAILED"
  };
}

export function buildCompletionRelayMessage(session: Pick<CompletedRelaySession, "agentId" | "summary">): string {
  return `✅ [${session.agentId}] 任务完成\n${session.summary}\n（此消息由 stall-detector 补发，原 relay 链路未投递）`;
}

export function buildRecoveryEventMessage(input: RecoveryEventMessageInput): string {
  return `plan stall ${input.elapsed}s. 继续执行 ${input.nextStory.id}: ${input.nextStory.title}. 用 sessions_spawn mode:run streamTo:parent 不带 thread:true.`;
}

export function buildRecoveryInspectionOutput(args: {
  inspection: RecoveryPlanInspection;
  timeout: number;
}): RecoveryInspectionOutput {
  if (args.inspection.kind === "NO_PLAN") {
    return {
      kind: "NO_PLAN",
      exitCode: 0,
      lines: ["NO_PLAN"]
    };
  }

  const decision = args.inspection.decision;

  if (decision.kind === "ALL_DONE") {
    return {
      kind: "ALL_DONE",
      exitCode: 0,
      lines: ["ALL_DONE: 所有 stories 已完成"]
    };
  }

  if (decision.kind === "HEALTHY_CHANGED") {
    return {
      kind: "HEALTHY",
      exitCode: 0,
      lines: [`HEALTHY: plan 文件有变化，${decision.pendingCount} stories 待执行`],
      nextState: decision.nextState
    };
  }

  if (decision.kind === "HEALTHY_WAITING") {
    return {
      kind: "HEALTHY",
      exitCode: 0,
      lines: [`HEALTHY: 无变化 ${decision.elapsed}s（阈值 ${args.timeout}s），${decision.pendingCount} stories 待执行`],
      nextState: decision.nextState
    };
  }

  const stalledLines = [
    `STALLED: ${decision.elapsed}s 无进展（阈值 ${args.timeout}s）`,
    `  下一个: ${decision.nextStory.id} - ${decision.nextStory.title}`,
    `  已恢复次数: ${decision.recoveryCount}`
  ];

  if (decision.kind === "STALLED_DRY") {
    return {
      kind: "STALLED_DRY",
      exitCode: 0,
      lines: [...stalledLines, "STALLED_DRY: dry-run 模式，未触发恢复"]
    };
  }

  if (decision.kind === "STALLED_MAX") {
    return {
      kind: "STALLED_MAX",
      exitCode: 0,
      lines: [...stalledLines, "STALLED_MAX: 已达最大恢复次数（3），需人工干预"]
    };
  }

  return {
    kind: "ACTION_REQUIRED",
    exitCode: 0,
    lines: stalledLines,
    state: args.inspection.state,
    decision
  };
}
