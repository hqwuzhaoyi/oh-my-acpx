import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildRelayInspectOutput,
  buildRelayInspectReport,
  buildRelayWatchOutput,
  buildRelayWatchTerminalResult,
  buildRelayWatchTimeoutResult,
  diagnoseRelayEvents,
  evaluateRelayWatchStep,
  findLatestAcpxChildLog,
  loadRelayInspectionContext,
  parseRelayFallbackArgs,
  parseStreamLogText,
  recoverChildLogText,
  resolveRelayChildLogPath
} from "../../src/core/fallback";

test("start + stall without done is diagnosed as stalled", () => {
  const events = parseStreamLogText(`
{"kind":"system_event","contextKey":"relay:start"}
{"kind":"system_event","contextKey":"relay:stall"}
`);

  const result = diagnoseRelayEvents(events);
  assert.equal(result.diagnosis, "relay_stalled_without_terminal_event");
});

test("done is diagnosed as completed", () => {
  const events = parseStreamLogText(`
{"kind":"system_event","contextKey":"relay:start"}
{"kind":"system_event","contextKey":"relay:done"}
`);

  const result = diagnoseRelayEvents(events);
  assert.equal(result.diagnosis, "relay_completed");
});

test("error is diagnosed as relay_error", () => {
  const events = parseStreamLogText(`
{"kind":"system_event","contextKey":"relay:start"}
{"kind":"system_event","contextKey":"relay:error"}
`);

  const result = diagnoseRelayEvents(events);
  assert.equal(result.diagnosis, "relay_error");
});

test("start only is diagnosed as waiting", () => {
  const events = parseStreamLogText(`
{"kind":"system_event","contextKey":"relay:start"}
`);

  const result = diagnoseRelayEvents(events);
  assert.equal(result.diagnosis, "relay_started_waiting");
});

test("recoverChildLogText supports JSON-RPC child logs", () => {
  const result = recoverChildLogText(`
{"method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"text":"Hello "}}}}
{"method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"text":"World"}}}}
{"result":{"stopReason":"end_turn"}}
`);

  assert.deepEqual(result, {
    found: true,
    messageCount: 2,
    hasEndTurn: true,
    text: "Hello World",
    childLogPath: undefined
  });
});

test("recoverChildLogText supports flat event child logs", () => {
  const result = recoverChildLogText(`
{"kind":"assistant_delta","text":"Part 1 "}
{"role":"assistant","content":"Part 2"}
{"stopReason":"end_turn"}
`);

  assert.deepEqual(result, {
    found: true,
    messageCount: 2,
    hasEndTurn: true,
    text: "Part 1 Part 2",
    childLogPath: undefined
  });
});

test("findLatestAcpxChildLog returns the newest .stream.ndjson file", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-fallback-"));

  try {
    const sessionsDir = path.join(tempDir, ".acpx", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const older = path.join(sessionsDir, "older.stream.ndjson");
    const newer = path.join(sessionsDir, "newer.stream.ndjson");
    const ignored = path.join(sessionsDir, "ignored.txt");

    fs.writeFileSync(older, "old");
    fs.writeFileSync(newer, "new");
    fs.writeFileSync(ignored, "ignore");

    const now = new Date();
    const oldTime = new Date(now.getTime() - 10_000);
    fs.utimesSync(older, oldTime, oldTime);
    fs.utimesSync(newer, now, now);

    assert.equal(findLatestAcpxChildLog(tempDir), newer);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveRelayChildLogPath prefers explicit child log path", () => {
  assert.equal(
    resolveRelayChildLogPath({
      childLogPath: "/tmp/child.ndjson",
      homeDir: "/tmp/unused"
    }),
    "/tmp/child.ndjson"
  );
});

test("loadRelayInspectionContext combines parsed log, inspection, and child recovery", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-relay-context-"));

  try {
    const streamLog = path.join(tempDir, "relay.jsonl");
    const childLog = path.join(tempDir, "child.stream.ndjson");

    fs.writeFileSync(
      streamLog,
      [
        JSON.stringify({ kind: "system_event", contextKey: "relay:start" }),
        JSON.stringify({ kind: "system_event", contextKey: "relay:stall" })
      ].join("\n")
    );

    fs.writeFileSync(
      childLog,
      [
        JSON.stringify({
          method: "session/update",
          params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "done" } } }
        }),
        JSON.stringify({ result: { stopReason: "end_turn" } })
      ].join("\n")
    );

    const context = loadRelayInspectionContext({
      streamLog,
      childLogPath: childLog
    });

    assert.equal(context.parsed.events.length, 2);
    assert.equal(context.inspection.diagnosis, "relay_stalled_without_terminal_event");
    assert.equal(context.childLogPath, childLog);
    assert.equal(context.childRecovery?.found, true);
    assert.equal(context.childRecovery?.text, "done");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("buildRelayInspectReport adds next steps and telemetry event for stalled relays", () => {
  const report = buildRelayInspectReport({
    streamLog: "/tmp/relay.jsonl",
    eventCount: 2,
    inspection: {
      hasStart: true,
      hasStall: true,
      hasDone: false,
      hasError: false,
      hasAssistantDelta: false,
      diagnosis: "relay_stalled_without_terminal_event"
    },
    childRecovery: {
      found: true,
      messageCount: 2,
      hasEndTurn: true,
      text: "hello",
      childLogPath: "/tmp/child.ndjson"
    }
  });

  assert.equal(report.telemetryEvent, "relay_stall_detected");
  assert.equal(report.nextSteps.length, 2);
  assert.match(report.nextSteps[1], /Child completed/);
});

test("buildRelayInspectOutput is an alias of inspect report shape", () => {
  const report = buildRelayInspectOutput({
    streamLog: "/tmp/relay.jsonl",
    eventCount: 1,
    inspection: {
      hasStart: true,
      hasStall: false,
      hasDone: false,
      hasError: false,
      hasAssistantDelta: false,
      diagnosis: "relay_started_waiting"
    },
    childRecovery: null
  });

  assert.equal(report.streamLog, "/tmp/relay.jsonl");
  assert.equal(report.events, 1);
  assert.equal(report.diagnosis, "relay_started_waiting");
});

test("buildRelayWatchTerminalResult picks the correct terminal status", () => {
  const result = buildRelayWatchTerminalResult({
    elapsedMs: 123,
    inspection: {
      hasStart: true,
      hasStall: false,
      hasDone: true,
      hasError: false,
      hasAssistantDelta: false,
      diagnosis: "relay_completed"
    }
  });

  assert.equal(result.status, "relay_completed");
  assert.equal(result.elapsedMs, 123);
});

test("buildRelayWatchTimeoutResult captures child recovery fallback success", () => {
  const result = buildRelayWatchTimeoutResult({
    elapsedMs: 75000,
    inspection: {
      hasStart: true,
      hasStall: true,
      hasDone: false,
      hasError: false,
      hasAssistantDelta: false,
      diagnosis: "relay_stalled_without_terminal_event"
    },
    childRecovery: {
      found: true,
      messageCount: 1,
      hasEndTurn: true,
      text: "child result",
      childLogPath: "/tmp/child.ndjson"
    }
  });

  assert.equal(result.status, "fallback_success");
  assert.equal(result.telemetryData.childLogPath, "/tmp/child.ndjson");
  assert.equal(result.telemetryData.childMessages, 1);
});

test("buildRelayWatchOutput selects terminal vs timeout result shape", () => {
  const terminal = buildRelayWatchOutput({
    inspection: {
      hasStart: true,
      hasStall: false,
      hasDone: true,
      hasError: false,
      hasAssistantDelta: false,
      diagnosis: "relay_completed"
    },
    elapsedMs: 123,
    childRecovery: null,
    isTerminal: true
  });
  assert.equal(terminal.status, "relay_completed");

  const timeout = buildRelayWatchOutput({
    inspection: {
      hasStart: true,
      hasStall: true,
      hasDone: false,
      hasError: false,
      hasAssistantDelta: false,
      diagnosis: "relay_stalled_without_terminal_event"
    },
    elapsedMs: 75000,
    childRecovery: {
      found: true,
      messageCount: 1,
      hasEndTurn: true,
      text: "child result",
      childLogPath: "/tmp/child.ndjson"
    },
    isTerminal: false
  });
  assert.equal(timeout.status, "fallback_success");
});

test("parseRelayFallbackArgs reads stream-log, child-log, watch flag, and timeout", () => {
  const parsed = parseRelayFallbackArgs([
    "--watch",
    "--stream-log",
    "/tmp/relay.jsonl",
    "--child-log",
    "/tmp/child.ndjson",
    "--timeout",
    "90"
  ]);

  assert.deepEqual(parsed, {
    streamLog: "/tmp/relay.jsonl",
    childLogPath: "/tmp/child.ndjson",
    watch: true,
    timeoutSec: 90
  });
});

test("evaluateRelayWatchStep chooses terminal, timeout, tick, or continue", () => {
  assert.deepEqual(
    evaluateRelayWatchStep({
      inspection: {
        hasStart: true,
        hasStall: false,
        hasDone: true,
        hasError: false,
        hasAssistantDelta: false,
        diagnosis: "relay_completed"
      },
      elapsedMs: 1000,
      timeoutMs: 75000,
      lastCheckMs: 0
    }),
    { kind: "terminal" }
  );

  assert.deepEqual(
    evaluateRelayWatchStep({
      inspection: {
        hasStart: true,
        hasStall: true,
        hasDone: false,
        hasError: false,
        hasAssistantDelta: false,
        diagnosis: "relay_stalled_without_terminal_event"
      },
      elapsedMs: 80000,
      timeoutMs: 75000,
      lastCheckMs: 0
    }),
    { kind: "timeout" }
  );

  assert.deepEqual(
    evaluateRelayWatchStep({
      inspection: {
        hasStart: true,
        hasStall: false,
        hasDone: false,
        hasError: false,
        hasAssistantDelta: false,
        diagnosis: "relay_started_waiting"
      },
      elapsedMs: 20000,
      timeoutMs: 75000,
      lastCheckMs: 0
    }),
    { kind: "tick", nextLastCheckMs: 20000 }
  );

  assert.deepEqual(
    evaluateRelayWatchStep({
      inspection: {
        hasStart: true,
        hasStall: false,
        hasDone: false,
        hasError: false,
        hasAssistantDelta: false,
        diagnosis: "relay_started_waiting"
      },
      elapsedMs: 5000,
      timeoutMs: 75000,
      lastCheckMs: 0
    }),
    { kind: "continue" }
  );
});
