export type RecoveryState = {
  lastSeenHash: string;
  lastProgressAt: number;
  recoveryCount: number;
  relayedSessions: string[];
};

export type RecoveryPlanStory = {
  id: string;
  title: string;
  priority?: number;
  passes: boolean;
  notes?: string;
  agent?: string;
  category?: string;
};

export type RecoveryPlanFile = {
  stories: RecoveryPlanStory[];
  channel?: {
    chat_id?: string;
  };
};

export type RecoveryPlanInspection =
  | {
      kind: "NO_PLAN";
      planPath: string;
      statePath: string;
      state: RecoveryState;
    }
  | {
      kind: "DECISION";
      planPath: string;
      statePath: string;
      plan: RecoveryPlanFile;
      state: RecoveryState;
      timeout: number;
      dryRun: boolean;
      decision: RecoveryDecision;
    };

export type RecoveryDecision =
  | {
      kind: "ALL_DONE";
      pendingCount: 0;
    }
  | {
      kind: "HEALTHY_CHANGED";
      pendingCount: number;
      nextStory: RecoveryPlanStory;
      nextState: RecoveryState;
    }
  | {
      kind: "HEALTHY_WAITING";
      pendingCount: number;
      nextStory: RecoveryPlanStory;
      elapsed: number;
      nextState?: RecoveryState;
    }
  | {
      kind: "STALLED_DRY";
      pendingCount: number;
      nextStory: RecoveryPlanStory;
      elapsed: number;
      recoveryCount: number;
    }
  | {
      kind: "STALLED_MAX";
      pendingCount: number;
      nextStory: RecoveryPlanStory;
      elapsed: number;
      recoveryCount: number;
    }
  | {
      kind: "STALLED_READY";
      pendingCount: number;
      nextStory: RecoveryPlanStory;
      elapsed: number;
      recoveryCount: number;
      chatId: string;
      recoveryMessage: string;
      notifyMessage: string;
    };

export type CompletedRelaySession = {
  sessionId: string;
  agentId: string;
  runId?: string;
  summary?: string;
  chatId: string;
  doneAt: number;
};

export type RecoveryActionOutcome =
  | {
      kind: "RECOVERY_SUCCEEDED";
      nextState: RecoveryState;
      summary: string;
    }
  | {
      kind: "RECOVERY_FAILED";
      nextState: RecoveryState;
      summary: string;
    };

export type StallDetectorCliOptions = {
  planPath: string;
  timeoutSec: number;
  dryRun: boolean;
  watch: boolean;
};

export type RecoveryEventMessageInput = {
  elapsed: number;
  nextStory: Pick<RecoveryPlanStory, "id" | "title">;
};

export type RecoveryInspectionOutput =
  | {
      kind: "NO_PLAN";
      exitCode: 0;
      lines: string[];
    }
  | {
      kind: "ALL_DONE";
      exitCode: 0;
      lines: string[];
    }
  | {
      kind: "HEALTHY";
      exitCode: 0;
      lines: string[];
      nextState?: RecoveryState;
    }
  | {
      kind: "STALLED_DRY";
      exitCode: 0;
      lines: string[];
    }
  | {
      kind: "STALLED_MAX";
      exitCode: 0;
      lines: string[];
    }
  | {
      kind: "ACTION_REQUIRED";
      exitCode: 0;
      lines: string[];
      state: RecoveryState;
      decision: Extract<RecoveryDecision, { kind: "STALLED_READY" }>;
    };
