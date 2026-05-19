import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildRecoveryActionOutcome,
  buildRecoveryEventMessage,
  buildCompletionRelayMessage,
  buildRecoveryInspectionOutput,
  classifyRelaySessionsToProcess,
  DEFAULT_OMA_PLAN_PATH,
  getRecoveryStatePath,
  hashRecoveryPlan,
  inspectRecoveryPlanFile,
  inspectRecoveryProgress,
  loadRecoveryState,
  parseCompletedRelaySession,
  parseStallDetectorArgs,
  scanCompletedRelaySessionsFromAgentsDir,
  saveRecoveryState
} from "../../src/core/recovery";

test("DEFAULT_OMA_PLAN_PATH points to .oma plan", () => {
  assert.equal(DEFAULT_OMA_PLAN_PATH, ".oma/plans/plan.json");
});

test("getRecoveryStatePath uses the plan directory", () => {
  const statePath = getRecoveryStatePath(".oma/plans/plan.json");
  assert.equal(statePath, path.join(path.resolve(".oma/plans"), ".stall-detector-state.json"));
});

test("loadRecoveryState returns defaults when state file is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-recovery-"));

  try {
    const statePath = path.join(tempDir, ".oma", "plans", ".stall-detector-state.json");
    const state = loadRecoveryState(statePath);

    assert.deepEqual(state, {
      lastSeenHash: "",
      lastProgressAt: 0,
      recoveryCount: 0,
      relayedSessions: []
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("saveRecoveryState creates parent directories before writing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-recovery-"));

  try {
    const statePath = path.join(tempDir, ".oma", "plans", ".stall-detector-state.json");

    saveRecoveryState(statePath, {
      lastSeenHash: "hash",
      lastProgressAt: 123,
      recoveryCount: 1,
      relayedSessions: ["session-1"]
    });

    assert.equal(fs.existsSync(statePath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath, "utf8")), {
      lastSeenHash: "hash",
      lastProgressAt: 123,
      recoveryCount: 1,
      relayedSessions: ["session-1"]
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("hashRecoveryPlan stays aligned with story pass/notes changes", () => {
  const hash = hashRecoveryPlan({
    stories: [
      { id: "S-1", passes: false, notes: "abc" },
      { id: "S-2", passes: true, notes: "" }
    ]
  });

  assert.equal(hash, "S-1:false:3|S-2:true:0");
});

test("inspectRecoveryProgress returns ALL_DONE when no pending stories remain", () => {
  const decision = inspectRecoveryProgress({
    plan: {
      stories: [{ id: "S-1", title: "done", priority: 1, passes: true }]
    },
    state: {
      lastSeenHash: "",
      lastProgressAt: 0,
      recoveryCount: 0,
      relayedSessions: []
    },
    now: 100,
    timeout: 120,
    dryRun: false
  });

  assert.equal(decision.kind, "ALL_DONE");
});

test("inspectRecoveryPlanFile returns NO_PLAN with default state when the plan file is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-recovery-"));

  try {
    const planPath = path.join(tempDir, ".oma", "plans", "plan.json");
    const inspection = inspectRecoveryPlanFile({
      planPath,
      timeout: 120,
      dryRun: true,
      now: 100
    });

    assert.equal(inspection.kind, "NO_PLAN");
    if (inspection.kind !== "NO_PLAN") {
      throw new Error("expected NO_PLAN");
    }
    assert.equal(inspection.planPath, planPath);
    assert.match(inspection.statePath, /\.stall-detector-state\.json$/);
    assert.deepEqual(inspection.state, {
      lastSeenHash: "",
      lastProgressAt: 0,
      recoveryCount: 0,
      relayedSessions: []
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("inspectRecoveryPlanFile reads the plan file and returns a dry-run decision", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-recovery-"));

  try {
    const planPath = path.join(tempDir, ".oma", "plans", "plan.json");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        stories: [{ id: "S-1", title: "pending", priority: 1, passes: false }]
      })
    );
    saveRecoveryState(path.join(path.dirname(planPath), ".stall-detector-state.json"), {
      lastSeenHash: "S-1:false:0",
      lastProgressAt: 1,
      recoveryCount: 0,
      relayedSessions: []
    });

    const inspection = inspectRecoveryPlanFile({
      planPath,
      timeout: 120,
      dryRun: true,
      now: 200
    });

    assert.equal(inspection.kind, "DECISION");
    if (inspection.kind !== "DECISION") {
      throw new Error("expected DECISION");
    }
    assert.equal(inspection.decision.kind, "STALLED_DRY");
    assert.equal(inspection.plan.stories[0]?.id, "S-1");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("inspectRecoveryProgress marks changed plans as healthy and resets recovery count", () => {
  const decision = inspectRecoveryProgress({
    plan: {
      stories: [{ id: "S-1", title: "pending", priority: 1, passes: false, notes: "" }]
    },
    state: {
      lastSeenHash: "old-hash",
      lastProgressAt: 10,
      recoveryCount: 2,
      relayedSessions: []
    },
    now: 100,
    timeout: 120,
    dryRun: false
  });

  assert.equal(decision.kind, "HEALTHY_CHANGED");
  if (decision.kind !== "HEALTHY_CHANGED") {
    throw new Error("expected HEALTHY_CHANGED");
  }
  assert.equal(decision.nextState.recoveryCount, 0);
  assert.equal(decision.nextState.lastProgressAt, 100);
});

test("inspectRecoveryProgress returns waiting when elapsed time is below timeout", () => {
  const decision = inspectRecoveryProgress({
    plan: {
      stories: [{ id: "S-1", title: "pending", priority: 1, passes: false }]
    },
    state: {
      lastSeenHash: "S-1:false:0",
      lastProgressAt: 90,
      recoveryCount: 0,
      relayedSessions: []
    },
    now: 100,
    timeout: 120,
    dryRun: false
  });

  assert.equal(decision.kind, "HEALTHY_WAITING");
  if (decision.kind !== "HEALTHY_WAITING") {
    throw new Error("expected HEALTHY_WAITING");
  }
  assert.equal(decision.elapsed, 10);
});

test("inspectRecoveryProgress returns dry-run stall without side effects", () => {
  const decision = inspectRecoveryProgress({
    plan: {
      stories: [{ id: "S-1", title: "pending", priority: 1, passes: false }]
    },
    state: {
      lastSeenHash: "S-1:false:0",
      lastProgressAt: 1,
      recoveryCount: 0,
      relayedSessions: []
    },
    now: 200,
    timeout: 120,
    dryRun: true
  });

  assert.equal(decision.kind, "STALLED_DRY");
});

test("inspectRecoveryProgress returns stalled max after three recovery attempts", () => {
  const decision = inspectRecoveryProgress({
    plan: {
      stories: [{ id: "S-1", title: "pending", priority: 1, passes: false }]
    },
    state: {
      lastSeenHash: "S-1:false:0",
      lastProgressAt: 1,
      recoveryCount: 3,
      relayedSessions: []
    },
    now: 200,
    timeout: 120,
    dryRun: false
  });

  assert.equal(decision.kind, "STALLED_MAX");
});

test("inspectRecoveryProgress prepares recovery messages for stalled plans", () => {
  const decision = inspectRecoveryProgress({
    plan: {
      channel: { chat_id: "oc_demo" },
      stories: [{ id: "S-1", title: "pending", priority: 1, passes: false, agent: "codex" }]
    },
    state: {
      lastSeenHash: "S-1:false:0",
      lastProgressAt: 1,
      recoveryCount: 1,
      relayedSessions: []
    },
    now: 200,
    timeout: 120,
    dryRun: false
  });

  assert.equal(decision.kind, "STALLED_READY");
  if (decision.kind !== "STALLED_READY") {
    throw new Error("expected STALLED_READY");
  }
  assert.equal(decision.chatId, "oc_demo");
  assert.match(decision.recoveryMessage, /S-1/);
  assert.match(decision.notifyMessage, /正在自动恢复/);
});

test("parseCompletedRelaySession extracts done/progress summary and chat id", () => {
  const parsed = parseCompletedRelaySession({
    sessionId: "session-1",
    fallbackAgentId: "claude",
    raw: [
      JSON.stringify({
        kind: "system_event",
        contextKey: "relay:progress",
        text: "latest summary"
      }),
      JSON.stringify({
        kind: "system_event",
        contextKey: "relay:done",
        parentSessionKey: "agent:code-manager:feishu:group:oc_demo",
        agentId: "codex",
        runId: "run-1",
        epochMs: 123
      })
    ].join("\n")
  });

  assert.deepEqual(parsed, {
    sessionId: "session-1",
    agentId: "codex",
    runId: "run-1",
    summary: "latest summary",
    chatId: "oc_demo",
    doneAt: 123
  });
});

test("parseCompletedRelaySession returns null when no done event or invalid chat id", () => {
  assert.equal(
    parseCompletedRelaySession({
      sessionId: "session-1",
      fallbackAgentId: "claude",
      raw: JSON.stringify({ kind: "system_event", contextKey: "relay:progress", text: "summary" })
    }),
    null
  );

  assert.equal(
    parseCompletedRelaySession({
      sessionId: "session-2",
      fallbackAgentId: "claude",
      raw: JSON.stringify({
        kind: "system_event",
        contextKey: "relay:done",
        parentSessionKey: "agent:code-manager:feishu:group:not_chat"
      })
    }),
    null
  );
});

test("classifyRelaySessionsToProcess filters already relayed and stale sessions", () => {
  const result = classifyRelaySessionsToProcess({
    completed: [
      {
        sessionId: "already-relayed",
        agentId: "codex",
        chatId: "oc_demo",
        doneAt: 100,
        summary: "old",
        runId: "run-1"
      },
      {
        sessionId: "stale-session",
        agentId: "codex",
        chatId: "oc_demo",
        doneAt: 100,
        summary: "stale",
        runId: "run-2"
      },
      {
        sessionId: "fresh-session",
        agentId: "codex",
        chatId: "oc_demo",
        doneAt: 900,
        summary: "fresh",
        runId: "run-3"
      }
    ],
    relayedSessionIds: ["already-relayed"],
    now: 1000,
    maxAgeMs: 200
  });

  assert.deepEqual(result.toNotify, [
    {
      sessionId: "fresh-session",
      agentId: "codex",
      chatId: "oc_demo",
      doneAt: 900,
      summary: "fresh",
      runId: "run-3"
    }
  ]);
  assert.deepEqual(result.updatedRelayedSessionIds.sort(), [
    "already-relayed",
    "fresh-session",
    "stale-session"
  ]);
});

test("scanCompletedRelaySessionsFromAgentsDir collects valid completed sessions", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-agent-scan-"));

  try {
    const sessionsDir = path.join(tempDir, "codex", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    fs.writeFileSync(
      path.join(sessionsDir, "session-1.acp-stream.jsonl"),
      [
        JSON.stringify({
          kind: "system_event",
          contextKey: "relay:progress",
          text: "summary"
        }),
        JSON.stringify({
          kind: "system_event",
          contextKey: "relay:done",
          parentSessionKey: "agent:code-manager:feishu:group:oc_demo",
          agentId: "codex",
          runId: "run-1",
          epochMs: 123
        })
      ].join("\n")
    );

    assert.deepEqual(scanCompletedRelaySessionsFromAgentsDir(tempDir), [
      {
        sessionId: "session-1",
        agentId: "codex",
        runId: "run-1",
        summary: "summary",
        chatId: "oc_demo",
        doneAt: 123
      }
    ]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("buildRecoveryActionOutcome increments recovery count for success and failure", () => {
  const baseState = {
    lastSeenHash: "hash",
    lastProgressAt: 10,
    recoveryCount: 1,
    relayedSessions: []
  };

  const success = buildRecoveryActionOutcome({
    state: baseState,
    now: 100,
    succeeded: true
  });

  assert.equal(success.kind, "RECOVERY_SUCCEEDED");
  assert.equal(success.nextState.recoveryCount, 2);
  assert.equal(success.nextState.lastProgressAt, 100);
  assert.match(success.summary, /已恢复/);

  const failure = buildRecoveryActionOutcome({
    state: baseState,
    now: 200,
    succeeded: false
  });

  assert.equal(failure.kind, "RECOVERY_FAILED");
  assert.equal(failure.nextState.recoveryCount, 2);
  assert.equal(failure.nextState.lastProgressAt, 200);
  assert.equal(failure.summary, "RECOVERY_FAILED");
});

test("buildRecoveryInspectionOutput formats no-plan / healthy / stalled-dry outputs", () => {
  const noPlan = buildRecoveryInspectionOutput({
    inspection: {
      kind: "NO_PLAN",
      planPath: ".oma/plans/plan.json",
      statePath: ".oma/plans/.stall-detector-state.json",
      state: {
        lastSeenHash: "",
        lastProgressAt: 0,
        recoveryCount: 0,
        relayedSessions: []
      }
    },
    timeout: 120
  });
  assert.equal(noPlan.kind, "NO_PLAN");
  assert.deepEqual(noPlan.lines, ["NO_PLAN"]);

  const healthy = buildRecoveryInspectionOutput({
    inspection: {
      kind: "DECISION",
      planPath: ".oma/plans/plan.json",
      statePath: ".oma/plans/.stall-detector-state.json",
      plan: { stories: [{ id: "S-1", title: "pending", priority: 1, passes: false }] },
      state: {
        lastSeenHash: "old",
        lastProgressAt: 0,
        recoveryCount: 0,
        relayedSessions: []
      },
      timeout: 120,
      dryRun: true,
      decision: {
        kind: "HEALTHY_CHANGED",
        pendingCount: 1,
        nextStory: { id: "S-1", title: "pending", priority: 1, passes: false },
        nextState: {
          lastSeenHash: "new",
          lastProgressAt: 100,
          recoveryCount: 0,
          relayedSessions: []
        }
      }
    },
    timeout: 120
  });
  assert.equal(healthy.kind, "HEALTHY");
  assert.match(healthy.lines[0], /HEALTHY/);

  const stalledDry = buildRecoveryInspectionOutput({
    inspection: {
      kind: "DECISION",
      planPath: ".oma/plans/plan.json",
      statePath: ".oma/plans/.stall-detector-state.json",
      plan: { stories: [{ id: "S-1", title: "pending", priority: 1, passes: false }] },
      state: {
        lastSeenHash: "same",
        lastProgressAt: 1,
        recoveryCount: 0,
        relayedSessions: []
      },
      timeout: 120,
      dryRun: true,
      decision: {
        kind: "STALLED_DRY",
        pendingCount: 1,
        nextStory: { id: "S-1", title: "pending", priority: 1, passes: false },
        elapsed: 200,
        recoveryCount: 0
      }
    },
    timeout: 120
  });
  assert.equal(stalledDry.kind, "STALLED_DRY");
  assert.match(stalledDry.lines.join("\n"), /STALLED_DRY/);
});

test("buildCompletionRelayMessage formats the relay notification text", () => {
  assert.equal(
    buildCompletionRelayMessage({
      agentId: "codex",
      summary: "summary"
    }),
    "✅ [codex] 任务完成\nsummary\n（此消息由 stall-detector 补发，原 relay 链路未投递）"
  );
});

test("buildRecoveryEventMessage formats the openclaw recovery event text", () => {
  assert.equal(
    buildRecoveryEventMessage({
      elapsed: 75,
      nextStory: {
        id: "S-1",
        title: "Fix auth flow"
      }
    }),
    "plan stall 75s. 继续执行 S-1: Fix auth flow. 用 sessions_spawn mode:run streamTo:parent 不带 thread:true."
  );
});

test("parseStallDetectorArgs reads planPath, timeout, dry-run, and watch", () => {
  const parsed = parseStallDetectorArgs(
    [".oma/plans/custom.json", "--timeout", "180", "--dry-run", "--watch"],
    ".oma/plans/plan.json"
  );

  assert.deepEqual(parsed, {
    planPath: ".oma/plans/custom.json",
    timeoutSec: 180,
    dryRun: true,
    watch: true
  });
});

test("parseStallDetectorArgs falls back to defaults when flags are omitted", () => {
  const parsed = parseStallDetectorArgs([], ".oma/plans/plan.json");

  assert.deepEqual(parsed, {
    planPath: ".oma/plans/plan.json",
    timeoutSec: 120,
    dryRun: false,
    watch: false
  });
});
