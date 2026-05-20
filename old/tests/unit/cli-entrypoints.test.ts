import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CLI_ENTRY = path.join(REPO_ROOT, "dist", "src", "cli", "index.js");

function runCli(args: string[], cwd: string) {
  return spawnSync("node", [CLI_ENTRY, ...args], {
    cwd,
    encoding: "utf8"
  });
}

test("oax setup initializes .oma directory structure in the working directory", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-setup-"));

  try {
    const templatesDir = path.join(tempDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir, "plan.json"),
      JSON.stringify(
        {
          project: "demo",
          stories: [{ id: "S-001", title: "Example", priority: 1, passes: false }]
        },
        null,
        2
      )
    );

    const result = runCli(["setup"], tempDir);

    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(path.join(tempDir, ".oma", "plans", "plan.json")), true);
    assert.equal(fs.existsSync(path.join(tempDir, ".oma", "state")), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax run defaults to .oma/plans/plan.json when no plan path is provided", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-run-"));

  try {
    const result = runCli(["run"], tempDir);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /"status": "NO_PLAN"/);
    assert.match(result.stdout, /\.oma\/plans\/plan\.json/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax run-plan remains a compatibility alias for run", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-run-plan-"));

  try {
    const result = runCli(["run-plan"], tempDir);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /"status": "NO_PLAN"/);
    assert.match(result.stdout, /\.oma\/plans\/plan\.json/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax diagnose relay requires --stream-log", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-diagnose-"));

  try {
    const result = runCli(["diagnose", "relay"], tempDir);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Missing required flag: --stream-log/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax diagnose relay prints relay inspection for a stream log", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-diagnose-"));

  try {
    const streamLog = path.join(tempDir, "relay.jsonl");
    fs.writeFileSync(
      streamLog,
      [
        JSON.stringify({ kind: "system_event", contextKey: "relay:start" }),
        JSON.stringify({ kind: "system_event", contextKey: "relay:stall" })
      ].join("\n")
    );

    const result = runCli(["diagnose", "relay", "--stream-log", streamLog], tempDir);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /"diagnosis": "relay_stalled_without_terminal_event"/);
    assert.match(result.stdout, /"streamLog":/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax diagnose relay --watch returns fallback result for stalled relay", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-diagnose-watch-"));

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

    const result = runCli(
      ["diagnose", "relay", "--watch", "--timeout", "75", "--stream-log", streamLog, "--child-log", childLog],
      tempDir
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /"status": "fallback_success"/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax diagnose stall defaults to .oma/plans/plan.json and reports NO_PLAN", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-diagnose-stall-"));

  try {
    const result = runCli(["diagnose", "stall"], tempDir);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /"status": "NO_PLAN"/);
    assert.match(result.stdout, /\.oma\/plans\/plan\.json/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax diagnose stall reports STALLED_DRY for stalled plan state", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-diagnose-stall-"));

  try {
    const planDir = path.join(tempDir, ".oma", "plans");
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(
      path.join(planDir, "plan.json"),
      JSON.stringify(
        {
          project: "demo",
          stories: [{ id: "S-1", title: "Pending", priority: 1, passes: false }]
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(planDir, ".stall-detector-state.json"),
      JSON.stringify(
        {
          lastSeenHash: "S-1:false:0",
          lastProgressAt: 1,
          recoveryCount: 0,
          relayedSessions: []
        },
        null,
        2
      )
    );

    const result = runCli(["diagnose", "stall", ".oma/plans/plan.json", "--timeout", "120"], tempDir);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /"kind": "STALLED_DRY"/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("oax --help exposes relay and stall diagnose commands", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-cli-help-"));

  try {
    const result = runCli(["--help"], tempDir);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /diagnose relay --stream-log <path>/);
    assert.match(result.stdout, /diagnose stall \[plan-path\] \[--timeout <sec>\]/);
    assert.match(result.stdout, /run-plan \[plan-path\]\s+# compatibility alias/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
