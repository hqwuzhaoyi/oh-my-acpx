import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  buildAuxiliaryTaskReturn,
  buildOffloadProposal,
  describeAuxiliaryTaskReturnSchema,
  inspectOffloadPlan,
  loadOffloadPlan,
  type OffloadPlan,
} from "../../src/core/offload";
import { runCli } from "../../src/cli";

function tempPlan(contents: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "oma-offload-"));
  const path = join(dir, "plan.json");
  writeFileSync(path, JSON.stringify(contents, null, 2));
  return { dir, path };
}

function samplePlan(status: OffloadPlan["tasks"][number]["status"] = "pending"): OffloadPlan {
  return {
    version: 1,
    objective: "Keep host context small while checking docs.",
    tasks: [
      {
        id: "docs-check",
        title: "Review docs for sidecar language",
        status,
        contextBudget: {
          maxTokens: 2000,
          rationale: "Docs can be inspected without the full Host Plan context.",
        },
        route: {
          runtime: "fake-local",
          agent: "reviewer",
        },
        prompt: "Inspect docs for Host Agent and Offload Plan language.",
        expectedReturn: "AuxiliaryTaskReturn",
      },
    ],
  };
}

function samplePlanWithLocalOutputs(): OffloadPlan {
  return {
    version: 1,
    objective: "Create files from a bounded local output task.",
    tasks: [
      {
        id: "local-output-demo",
        title: "Create local demo files",
        status: "pending",
        contextBudget: {
          maxTokens: 1000,
          rationale: "The output files are fully described in the Offload Plan.",
        },
        route: {
          runtime: "fake-local",
          agent: "file-writer",
        },
        prompt: "Create the declared local output files.",
        expectedReturn: "AuxiliaryTaskReturn",
        modifiedFiles: ["demo/hello.txt"],
        localOutputs: [
          {
            path: "demo/hello.txt",
            content: "hello from oma\n",
          },
        ],
      },
    ],
  };
}

function samplePlanWithAcpxRoute(): OffloadPlan {
  return {
    version: 1,
    objective: "Run an Auxiliary Task through ACPX.",
    tasks: [
      {
        id: "acpx-demo",
        title: "Use ACPX",
        status: "pending",
        contextBudget: {
          maxTokens: 1000,
          rationale: "The prompt is bounded and can be delegated through ACPX.",
        },
        route: {
          runtime: "acpx",
          agent: "codex",
          role: "deep",
          sessionName: "oma-acpx-demo",
        },
        prompt: "Create a small demo file.",
        expectedReturn: "AuxiliaryTaskReturn",
        modifiedFiles: ["demo/acpx.txt"],
      },
    ],
  };
}

function samplePlanWithTwoLocalOutputTasks(): OffloadPlan {
  return {
    version: 1,
    objective: "Create files through two split Auxiliary Tasks.",
    tasks: [
      {
        id: "first-output",
        title: "Create first file",
        status: "pending",
        contextBudget: {
          maxTokens: 1000,
          rationale: "The first output is bounded.",
        },
        route: {
          runtime: "fake-local",
          agent: "gemini",
          role: "deep",
        },
        prompt: "Create the first declared local output file.",
        modifiedFiles: ["demo/first.txt"],
        localOutputs: [
          {
            path: "demo/first.txt",
            content: "first\n",
          },
        ],
      },
      {
        id: "second-output",
        title: "Create second file",
        status: "pending",
        contextBudget: {
          maxTokens: 1000,
          rationale: "The second output is bounded.",
        },
        route: {
          runtime: "fake-local",
          agent: "qoder",
          role: "visual",
        },
        prompt: "Create the second declared local output file.",
        modifiedFiles: ["demo/second.txt"],
        localOutputs: [
          {
            path: "demo/second.txt",
            content: "second\n",
          },
        ],
      },
    ],
  };
}

function writeApprovedAgentsConfig(dir: string): void {
  const configPath = join(dir, ".oma/config/agents.json");
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        approvedAgents: {
          codex: {
            approved: true,
            role: "deep",
            permissions: "edit",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

function writeGlobalApprovedAgentsConfig(omaHome: string): void {
  const configPath = join(omaHome, "config/agents.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        approvedAgents: {
          codex: {
            approved: true,
            role: "deep",
            permissions: "edit",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

function bodyAsRecord(body: unknown): Record<string, any> {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  return body as Record<string, any>;
}

let lastCapturedRunId: string | undefined;

function withRunId<T extends Record<string, any>>(value: T, args: string[]): T & { runId: string } {
  const prompt = String(args.at(-1));
  const runId = prompt.match(/OMA runId: ([^\n]+)/)?.[1]
    ?? args.join(" ").match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)?.[0]
    ?? lastCapturedRunId;
  assert.ok(runId);
  lastCapturedRunId = runId;
  return { ...value, runId };
}

function skillsPath(): string {
  return resolve(dirname(require.resolve("../../src/cli/index")), "..", "..", "..", "skills");
}

describe("offload core", () => {
  test("missing Offload Plan returns NO_PLAN", () => {
    const result = loadOffloadPlan("/missing/offload-plan.json");

    assert.equal(result.status, "NO_PLAN");
    assert.match(result.summary, /Offload Plan/i);
  });

  test("all Auxiliary Tasks completed returns ALL_DONE", () => {
    const { dir, path } = tempPlan(samplePlan("completed"));
    try {
      const loaded = loadOffloadPlan(path);
      assert.equal(loaded.status, "PLAN_LOADED");

      if (loaded.status === "PLAN_LOADED") {
        const inspection = inspectOffloadPlan(loaded.plan);
        assert.equal(inspection.status, "ALL_DONE");
        assert.match(inspection.summary, /No pending Auxiliary Tasks/i);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("pending Auxiliary Task returns OFFLOAD_READY proposal", () => {
    const { dir, path } = tempPlan(samplePlan());
    try {
      const loaded = loadOffloadPlan(path);
      assert.equal(loaded.status, "PLAN_LOADED");

      if (loaded.status === "PLAN_LOADED") {
        const inspection = inspectOffloadPlan(loaded.plan);
        assert.equal(inspection.status, "OFFLOAD_READY");

        if (inspection.status === "OFFLOAD_READY") {
          const proposal = buildOffloadProposal(loaded.plan, inspection.task);
          assert.equal(proposal.kind, "Offload Proposal");
          assert.equal(proposal.status, "OFFLOAD_READY");
          assert.equal(proposal.executeMode, false);
          assert.equal(proposal.selectedRoute.runtime, "fake-local");
          assert.equal(proposal.payload.prompt, samplePlan().tasks[0].prompt);
          assert.equal(proposal.expectedReturnSchema.kind, "Auxiliary Task Return Schema");
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid Auxiliary Task id cannot escape artifact paths", () => {
    const plan = samplePlan();
    plan.tasks[0] = {
      ...plan.tasks[0],
      id: "../escape",
    };
    const { dir, path } = tempPlan(plan);
    try {
      const loaded = loadOffloadPlan(path);

      assert.equal(loaded.status, "INVALID_PLAN");
      if (loaded.status === "INVALID_PLAN") {
        assert.match(loaded.errors.join("\n"), /safe single path segment/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fake Execute Mode returns completed Auxiliary Task Return", () => {
    const plan = samplePlan();
    const task = plan.tasks[0];

    const result = buildAuxiliaryTaskReturn(plan, task, "test-run-id");

    assert.equal(result.kind, "Auxiliary Task Return");
    assert.equal(result.status, "completed");
    assert.equal(result.verdict, "provisional_accept");
    assert.equal(result.hostPlanComplete, false);
    assert.equal(result.runId, "test-run-id");
    assert.match(result.summary, /fake\/local Execute Mode/i);
    assert.ok(result.evidence.length > 0);
    assert.deepEqual(result.scope.modifiedFiles, []);
    assert.equal(result.coordinationAdvice.recommendedAction, "accept");
  });

  test("schema states completed is not Host Plan completion", () => {
    const schema = describeAuxiliaryTaskReturnSchema();

    assert.equal(schema.kind, "Auxiliary Task Return Schema");
    assert.ok(schema.requiredFields.includes("status"));
    assert.ok(schema.requiredFields.includes("verdict"));
    assert.ok(schema.requiredFields.includes("runId"));
    assert.match(schema.statusSemantics.completed, /does not mean the Host Plan is complete/i);
  });
});

describe("oma CLI", () => {
  let previousOmaHome: string | undefined;

  beforeEach(() => {
    previousOmaHome = process.env.OMA_HOME;
    process.env.OMA_HOME = mkdtempSync(join(tmpdir(), "oma-home-"));
  });

  afterEach(() => {
    if (process.env.OMA_HOME) {
      rmSync(process.env.OMA_HOME, { recursive: true, force: true });
    }
    if (previousOmaHome === undefined) {
      delete process.env.OMA_HOME;
    } else {
      process.env.OMA_HOME = previousOmaHome;
    }
  });

  test("package exposes oma as the CLI binary", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      bin: Record<string, string>;
      engines: Record<string, string>;
      scripts: Record<string, string>;
      files: string[];
    };

    assert.deepEqual(packageJson.bin, {
      oma: "bin/oma",
    });
    assert.equal(packageJson.engines.node, ">=20");
    assert.match(packageJson.scripts.postbuild, /chmod \+x dist\/src\/cli\/index\.js bin\/oma/);
    assert.equal(packageJson.scripts.prepack, "npm run build");
    assert.ok(packageJson.files.includes("bin/oma"));
  });

  test("built oma CLI is executable for package shims", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      bin: Record<string, string>;
    };

    const mode = statSync(resolve(packageJson.bin.oma)).mode;
    assert.notEqual(mode & 0o111, 0);
  });

  test("setup creates the default Offload Plan and artifact directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-setup-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["setup"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "SETUP_COMPLETE");
      assert.equal(existsSync(join(dir, ".oma/plans/plan.json")), true);
      assert.equal(existsSync(join(dir, ".oma/artifacts")), true);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("default run returns proposal and does not enter Execute Mode", async () => {
    const { dir, path } = tempPlan(samplePlan());
    try {
      const result = await runCli(["run", path]);
      const body = bodyAsRecord(result.body);
      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "OFFLOAD_READY");
      assert.equal(body.executeMode, false);
      assert.equal(body.kind, "Offload Proposal");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("default run on an acpx route returns proposal without spawning ACPX", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      const result = await runCli(["run", path], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          return { exitCode: 0, stdout: "should not execute", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Offload Proposal");
      assert.equal(body.executeMode, false);
      assert.equal(body.selectedRoute.runtime, "acpx");
      assert.deepEqual(calls, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute returns fake completed Auxiliary Task Return", async () => {
    const { dir, path } = tempPlan(samplePlan());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["run", path, "--execute"]);
      const body = bodyAsRecord(result.body);
      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Task Return");
      assert.equal(body.status, "completed");
      assert.equal(body.hostPlanComplete, false);
      assert.equal(existsSync(join(dir, ".oma/artifacts/docs-check.json")), true);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute creates declared local output files", async () => {
    const { dir, path } = tempPlan(samplePlanWithLocalOutputs());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["run", path, "--execute"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Task Return");
      assert.equal(readFileSync(join(dir, "demo/hello.txt"), "utf8"), "hello from oma\n");
      assert.deepEqual(body.scope.modifiedFiles, ["demo/hello.txt"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute allows local output paths with parent-like filename prefixes", async () => {
    const plan = samplePlan();
    plan.tasks[0].localOutputs = [{ path: "..foo/out.txt", content: "inside\n" }];
    plan.tasks[0].modifiedFiles = ["..foo/out.txt"];
    const { dir, path } = tempPlan(plan);
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["run", path, "--execute"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "completed");
      assert.equal(readFileSync(join(dir, "..foo/out.txt"), "utf8"), "inside\n");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unsafe local output paths make the Offload Plan invalid", async () => {
    const plan = samplePlan();
    plan.tasks[0].localOutputs = [{ path: "../outside.txt", content: "nope\n" }];
    const { dir, path } = tempPlan(plan);
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["run", path, "--execute"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 1);
      assert.equal(body.status, "INVALID_PLAN");
      assert.match(body.errors.join("\n"), /inside the workspace/);
      assert.equal(existsSync(join(dir, "../outside.txt")), false);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unsafe acpx local output paths fail before ACPX execution", async () => {
    const plan = samplePlanWithAcpxRoute();
    plan.tasks[0].localOutputs = [{ path: "/tmp/outside.txt", content: "nope\n" }];
    const { dir, path } = tempPlan(plan);
    const previousCwd = process.cwd();
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          return { exitCode: 0, stdout: "should not execute", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 1);
      assert.equal(body.status, "INVALID_PLAN");
      assert.match(body.errors.join("\n"), /inside the workspace/);
      assert.deepEqual(calls, []);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute marks completed tasks so split Offload Plans advance", async () => {
    const { dir, path } = tempPlan(samplePlanWithTwoLocalOutputTasks());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);

      const firstResult = await runCli(["run", path, "--execute"]);
      const firstBody = bodyAsRecord(firstResult.body);
      const afterFirst = JSON.parse(readFileSync(path, "utf8")) as OffloadPlan;

      assert.equal(firstResult.exitCode, 0);
      assert.equal(firstBody.auxiliaryTaskId, "first-output");
      assert.equal(afterFirst.tasks[0].status, "completed");
      assert.equal(afterFirst.tasks[1].status, "pending");
      assert.equal(readFileSync(join(dir, "demo/first.txt"), "utf8"), "first\n");

      const secondResult = await runCli(["run", path, "--execute"]);
      const secondBody = bodyAsRecord(secondResult.body);
      const afterSecond = JSON.parse(readFileSync(path, "utf8")) as OffloadPlan;

      assert.equal(secondResult.exitCode, 0);
      assert.equal(secondBody.auxiliaryTaskId, "second-output");
      assert.equal(afterSecond.tasks[0].status, "completed");
      assert.equal(afterSecond.tasks[1].status, "completed");
      assert.equal(readFileSync(join(dir, "demo/second.txt"), "utf8"), "second\n");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute returns NO_AGENT_ONBOARDING before acpx execution when approved agents config is missing", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      process.chdir(dir);
      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          return { exitCode: 0, stdout: "should not execute", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 2);
      assert.equal(body.status, "NO_AGENT_ONBOARDING");
      assert.match(body.summary, /\.oma\/config\/agents\.json/);
      assert.match(body.summary, /shared global OMA config/);
      assert.deepEqual(calls, []);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute returns NO_APPROVED_AGENT when approved agent lacks the requested role", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeFileSync(
        join(dir, ".oma/config/agents.json"),
        `${JSON.stringify(
          {
            version: 1,
            approvedAgents: {
              codex: {
                approved: true,
                role: "quick",
                permissions: "read",
              },
            },
          },
          null,
          2,
        )}\n`,
      );

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          return { exitCode: 0, stdout: "should not execute", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 2);
      assert.equal(body.status, "NO_APPROVED_AGENT");
      assert.match(body.summary, /deep/);
      assert.deepEqual(calls, []);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute invokes acpx prompt sessions for acpx routes", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: "session history", stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Task Return");
      assert.match(body.summary, /ACPX Execute Mode/);
      assert.doesNotMatch(body.summary, /fake\/local/);
      assert.doesNotMatch(JSON.stringify(body), /fake\/local/);
      assert.equal(calls.length, 4);
      assert.equal(calls[0].command, "acpx");
      const sessionName = String(calls[0].args.at(-1));
      assert.match(sessionName, /^oma-acpx-demo-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
      assert.deepEqual(calls[0].args, [
        "--cwd",
        process.cwd(),
        "codex",
        "sessions",
        "ensure",
        "--name",
        sessionName,
      ]);
      assert.deepEqual(calls[1].args.slice(0, 8), [
        "--cwd",
        process.cwd(),
        "--approve-all",
        "--timeout",
        "180",
        "codex",
        "-s",
        sessionName,
      ]);
      assert.match(calls[1].args[8], /Create a small demo file\./);
      assert.match(calls[1].args[8], /Auxiliary Task Return/);
      assert.match(calls[1].args[8], /auxiliaryTaskId/);
      assert.deepEqual(calls[2].args, ["--cwd", process.cwd(), "codex", "sessions", "show", sessionName]);
      assert.deepEqual(calls[3].args, [
        "--cwd",
        process.cwd(),
        "codex",
        "sessions",
        "history",
        sessionName,
        "--limit",
        "20",
      ]);
      assert.match(JSON.stringify(body.evidence), /acpx completed/);
      assert.match(JSON.stringify(body.evidence), /oma-acpx-demo/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute adopts schema-confirmed Auxiliary Task Return from acpx session history", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "Schema-confirmed review completed.",
        scope: {
          readFiles: ["docs/design.md"],
          modifiedFiles: [],
          artifactRefs: [".oma/artifacts/acpx-demo.json"],
        },
        evidence: [
          {
            kind: "note",
            summary: "Reviewed the design from session history.",
          },
        ],
        blockers: [],
        findings: ["The return capture path should trust schema-valid session history."],
        followups: [],
        coordinationAdvice: {
          recommendedAction: "accept",
          reason: "The auxiliary agent emitted a schema-valid return.",
        },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: `assistant final\n\`\`\`json\n${JSON.stringify(withRunId(schemaReturn, args), null, 2)}\n\`\`\``, stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Task Return");
      assert.equal(body.status, "completed");
      assert.equal(body.verdict, "provisional_accept");
      assert.equal(body.summary, "Schema-confirmed review completed.");
      assert.deepEqual(body.findings, ["The return capture path should trust schema-valid session history."]);
      assert.deepEqual(body.scope.readFiles, ["docs/design.md"]);
      assert.match(JSON.stringify(body.evidence), /ACPX acpx .*<prompt redacted>/);
      assert.match(JSON.stringify(body.evidence), /ACPX sessionName:/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute ignores stale schema returns before the current run marker", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const staleReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "Stale schema-confirmed result.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [{ kind: "note", summary: "Old run." }],
        blockers: [],
        findings: ["stale finding"],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Old run accepted." },
      };
      const currentReturn = {
        ...staleReturn,
        summary: "Current schema-confirmed result.",
        findings: ["current finding"],
        coordinationAdvice: { recommendedAction: "accept", reason: "Current run accepted." },
      };
      let currentRunId = "";

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("-s")) {
            const prompt = String(args.at(-1));
            currentRunId = prompt.match(/OMA runId: ([^\n]+)/)?.[1] ?? "";
            return { exitCode: 0, stdout: `\`\`\`json\n${JSON.stringify(withRunId(currentReturn, args))}\n\`\`\``, stderr: "" };
          }
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return {
              exitCode: 0,
              stdout: [
                "assistant final",
                "```json",
                JSON.stringify(staleReturn),
                "```",
                `2026-05-14T00:00:00.000Z user OMA runId: ${currentRunId}`,
                "2026-05-14T00:00:01.000Z assistant I did not emit schema in history.",
              ].join("\n"),
              stderr: "",
            };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.summary, "Current schema-confirmed result.");
      assert.deepEqual(body.findings, ["current finding"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute rejects schema returns with a mismatched runId", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        runId: "not-this-run",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "Wrong run.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["wrong run"],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Wrong run." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: JSON.stringify(schemaReturn), stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "blocked");
      assert.equal(body.verdict, "revise");
      assert.match(body.blockers.join("\n"), /No usable auxiliary result content/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute returns extracted findings from free-form acpx session history", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return {
              exitCode: 0,
              stdout: "assistant final\nThe design review found that OMA should capture session answers even when artifact writing fails.\nIt should return revise because no schema-valid return was emitted.",
              stderr: "",
            };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Task Return");
      assert.equal(body.status, "completed");
      assert.equal(body.verdict, "revise");
      assert.match(body.summary, /free-form/i);
      assert.deepEqual(body.findings, [
        "The design review found that OMA should capture session answers even when artifact writing fails.",
        "It should return revise because no schema-valid return was emitted.",
      ]);
      assert.equal(body.coordinationAdvice.recommendedAction, "retry");
      const updatedPlan = JSON.parse(readFileSync(path, "utf8")) as OffloadPlan;
      assert.equal(updatedPlan.tasks[0].status, "pending");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("result show returns the complete captured answer by Auxiliary Task identity", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const capturedAnswer = "The complete captured answer explains the design review findings.\nIt is longer than the concise findings returned to the Host Agent.";
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const runResult = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: `assistant final\n${capturedAnswer}`, stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      assert.equal(runResult.exitCode, 0);

      const result = await runCli(["result", "show", "acpx-demo"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Result Inspection");
      assert.equal(body.auxiliaryTaskId, "acpx-demo");
      assert.equal(body.capturedAnswer, capturedAnswer);
      assert.equal("acpxResult" in body, false);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute blocks when only schema output has mismatched Auxiliary Task identity", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const staleSchemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "other-task",
        summary: "This belongs to another task.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["This stale result must not be returned for acpx-demo."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Wrong task." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: JSON.stringify(staleSchemaReturn), stderr: "" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "blocked");
      assert.equal(body.verdict, "revise");
      assert.match(body.blockers.join("\n"), /No usable auxiliary result content/);
      assert.deepEqual(body.findings, []);
      assert.match(JSON.stringify(body.evidence), /other-task/);
      assert.match(JSON.stringify(body.evidence), /acpx-demo/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute extracts only the final assistant answer from noisy acpx history", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const history = [
        "2026-05-12T00:00:00.000Z user Read these files",
        "[tool] Read src/cli/index.ts (completed)",
        "old assistant note that must not be captured",
        "assistant final",
        "Finding one: capture works.",
        "Finding two: result show returns the captured answer.",
        "[done] end_turn",
        "[client] session/save (completed)",
      ].join("\n");

      const runResult = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: history, stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const runBody = bodyAsRecord(runResult.body);

      assert.equal(runBody.status, "completed");
      assert.equal(runBody.verdict, "revise");
      assert.deepEqual(runBody.findings, [
        "Finding one: capture works.",
        "Finding two: result show returns the captured answer.",
      ]);

      const result = await runCli(["result", "show", "acpx-demo"]);
      const body = bodyAsRecord(result.body);
      assert.equal(
        body.capturedAnswer,
        "Finding one: capture works.\nFinding two: result show returns the captured answer.",
      );
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute captures timestamped assistant history before stdout fallback", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const history = [
        "session: 019e-demo (2/2 shown)",
        "2026-05-13T05:02:38.853Z user Evaluate docs/prd/example.md",
        "2026-05-13T05:03:11.000Z assistant The PRD is ready with edits.",
        "Finding: capture should preserve usable assistant content.",
        "Risk: Host Agent should not need manual artifact inspection.",
      ].join("\n");

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: history, stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "completed");
      assert.equal(body.verdict, "revise");
      assert.deepEqual(body.findings, [
        "The PRD is ready with edits.",
        "Finding: capture should preserve usable assistant content.",
        "Risk: Host Agent should not need manual artifact inspection.",
      ]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute blocks truncated schema-like stdout instead of treating it as findings", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          return {
            exitCode: 0,
            stdout: '{ "kind": "Auxiliary Task Return", "auxiliaryTaskId": "acpx-demo", "status": "completed"',
            stderr: "",
          };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "blocked");
      assert.deepEqual(body.findings, []);
      assert.match(body.blockers.join("\n"), /No usable auxiliary result content/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute blocks noisy free-form history without an assistant final marker", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const history = [
        "2026-05-12T00:00:00.000Z user Read these files",
        "[tool] Read src/cli/index.ts (completed)",
        "A loose line that should not be trusted without a final marker.",
        "[done] end_turn",
      ].join("\n");

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: history, stderr: "" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "blocked");
      assert.equal(body.verdict, "revise");
      assert.deepEqual(body.findings, []);
      assert.match(body.blockers.join("\n"), /No usable auxiliary result content/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute adopts schema-confirmed Auxiliary Task Return from acpx stdout fallback", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "Schema-confirmed stdout fallback completed.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [{ kind: "note", summary: "Captured from stdout." }],
        blockers: [],
        findings: ["stdout schema finding"],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Stdout schema was valid." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          return { exitCode: 0, stdout: JSON.stringify(withRunId(schemaReturn, args)), stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "completed");
      assert.equal(body.summary, "Schema-confirmed stdout fallback completed.");
      assert.deepEqual(body.findings, ["stdout schema finding"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute returns extracted findings from acpx stdout fallback", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          return { exitCode: 0, stdout: "assistant final\nstdout free-form finding", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "completed");
      assert.equal(body.verdict, "revise");
      assert.deepEqual(body.findings, ["stdout free-form finding"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute blocks unmarked free-form stdout fallback", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          return { exitCode: 0, stdout: "plain adapter log line without final marker", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "blocked");
      assert.deepEqual(body.findings, []);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute adopts the last matching schema-confirmed return", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const firstReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "First matching return.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["first finding"],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "First." },
      };
      const lastReturn = {
        ...firstReturn,
        summary: "Last matching return.",
        findings: ["last finding"],
        coordinationAdvice: { recommendedAction: "accept", reason: "Last." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: `${JSON.stringify(withRunId(firstReturn, args))}\n${JSON.stringify(withRunId(lastReturn, args))}`, stderr: "" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.summary, "Last matching return.");
      assert.deepEqual(body.findings, ["last finding"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute preserves mismatch evidence when a later schema return matches the task", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const staleSchemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "other-task",
        summary: "This belongs to another task.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["This stale result must not be adopted."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Wrong task." },
      };
      const matchingSchemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "This belongs to the active task.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [{ kind: "note", summary: "Matching schema evidence." }],
        blockers: [],
        findings: ["Matching schema finding."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Correct task." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return {
              exitCode: 0,
              stdout: `${JSON.stringify(staleSchemaReturn)}\n${JSON.stringify(withRunId(matchingSchemaReturn, args))}`,
              stderr: "",
            };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "completed");
      assert.equal(body.summary, "This belongs to the active task.");
      assert.deepEqual(body.findings, ["Matching schema finding."]);
      assert.match(JSON.stringify(body.evidence), /Matching schema evidence/);
      assert.match(JSON.stringify(body.evidence), /other-task/);
      assert.match(JSON.stringify(body.evidence), /acpx-demo/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute rejects acpx output that reports permission-confirmation tool failures", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async () => ({
          exitCode: 0,
          stdout:
            "[tool] Write (failed)\n  output:\n    Error: Permission confirmation required but no interactive handler is available.\n[done] end_turn\n",
          stderr: "",
        }),
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Task Return");
      assert.equal(body.status, "failed");
      assert.equal(body.verdict, "reject");
      assert.match(body.blockers.join("\n"), /Permission confirmation required/);
      assert.deepEqual(body.findings, []);
      assert.equal(body.coordinationAdvice.recommendedAction, "fallback_to_host");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute rejects generic failed tool calls even with schema output", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "This optimistic return must not be trusted.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["Should not be trusted."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Should not be accepted." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: JSON.stringify(withRunId(schemaReturn, args)), stderr: "" };
          }
          return { exitCode: 0, stdout: `[tool] Read docs.md (failed)\n${JSON.stringify(schemaReturn)}`, stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "failed");
      assert.equal(body.verdict, "reject");
      assert.match(body.blockers.join("\n"), /failed tool call/);
      assert.deepEqual(body.findings, []);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute does not treat audited source text as a permission failure", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "Audited source text safely.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["The literal permission string appeared inside source code."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "The run itself did not fail." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: JSON.stringify(withRunId(schemaReturn, args)), stderr: "" };
          }
          return {
            exitCode: 0,
            stdout:
              "function classify() { return 'Permission confirmation required but no interactive handler is available'; }\n",
            stderr: "",
          };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "completed");
      assert.equal(body.verdict, "provisional_accept");
      assert.equal(body.summary, "Audited source text safely.");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute lets hard execution failure override schema-confirmed output", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "This optimistic return must not be trusted.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["Should not appear in the final return."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Should not be accepted." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: JSON.stringify(withRunId(schemaReturn, args)), stderr: "" };
          }
          return {
            exitCode: 0,
            stdout: `[tool] Write (failed)\n  output:\n    Permission confirmation required but no interactive handler is available.\n${JSON.stringify(schemaReturn)}`,
            stderr: "",
          };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "failed");
      assert.equal(body.verdict, "reject");
      assert.match(body.blockers.join("\n"), /Permission confirmation required/);
      assert.notEqual(body.summary, "This optimistic return must not be trusted.");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("result show exposes captured answer even when hard execution failure rejects the task", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const capturedAnswer = "The audit found that hard failures should still preserve captured answers for inspection.";
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const runResult = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: `assistant final\n${capturedAnswer}`, stderr: "" };
          }
          return {
            exitCode: 0,
            stdout: "[tool] Write (failed)\n  output:\n    Permission confirmation required but no interactive handler is available.",
            stderr: "",
          };
        },
      });
      const runBody = bodyAsRecord(runResult.body);
      assert.equal(runBody.status, "failed");
      assert.equal(runBody.verdict, "reject");

      const result = await runCli(["result", "show", "acpx-demo"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Result Inspection");
      assert.equal(body.capturedAnswer, capturedAnswer);
      assert.notDeepEqual(body.findings, [capturedAnswer]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute returns captured schema content when artifact persistence fails", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      writeFileSync(join(dir, ".oma/artifacts"), "not a directory");
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "Schema-confirmed content must still return to the Host Agent.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [{ kind: "note", summary: "Captured before artifact persistence failed." }],
        blockers: [],
        findings: ["Captured schema finding survives artifact write failure."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Schema content was captured." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: JSON.stringify(withRunId(schemaReturn, args)), stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "completed");
      assert.equal(body.verdict, "revise");
      assert.equal(body.summary, "Schema-confirmed content must still return to the Host Agent.");
      assert.deepEqual(body.findings, ["Captured schema finding survives artifact write failure."]);
      assert.match(body.blockers.join("\n"), /artifact/i);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute does not trust schema content from failed session history", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const schemaReturn = {
        kind: "Auxiliary Task Return",
        status: "completed",
        verdict: "provisional_accept",
        hostPlanComplete: false,
        auxiliaryTaskId: "acpx-demo",
        summary: "Failed history stdout must not be trusted.",
        scope: { readFiles: [], modifiedFiles: [], artifactRefs: [] },
        evidence: [],
        blockers: [],
        findings: ["This came from failed history stdout."],
        followups: [],
        coordinationAdvice: { recommendedAction: "accept", reason: "Should not be trusted." },
      };

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 1, stdout: JSON.stringify(schemaReturn), stderr: "history failed" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "blocked");
      assert.equal(body.verdict, "revise");
      assert.notEqual(body.summary, "Failed history stdout must not be trusted.");
      assert.deepEqual(body.findings, []);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute keeps extracted findings out of the Host-facing return on hard failure", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const capturedAnswer = "Captured answer should be inspectable but not trusted as failed-return findings.";
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);

      const runResult = await runCli(["run", path, "--execute"], {
        executeCommand: async (_command, args) => {
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: `assistant final\n${capturedAnswer}`, stderr: "" };
          }
          return {
            exitCode: 0,
            stdout: "[tool] Write (failed)\n  output:\n    Permission confirmation required but no interactive handler is available.",
            stderr: "",
          };
        },
      });
      const runBody = bodyAsRecord(runResult.body);

      assert.equal(runBody.status, "failed");
      assert.equal(runBody.verdict, "reject");
      assert.notDeepEqual(runBody.findings, [capturedAnswer]);

      const result = await runCli(["result", "show", "acpx-demo"]);
      const body = bodyAsRecord(result.body);
      assert.equal(body.capturedAnswer, capturedAnswer);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("result show rejects unsafe task ids", async () => {
    const { dir } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);

      const result = await runCli(["result", "show", "../secret"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 1);
      assert.equal(body.status, "INVALID_RESULT_TASK_ID");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("result show rejects artifact identity mismatch", async () => {
    const { dir } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/artifacts"), { recursive: true });
      writeFileSync(
        join(dir, ".oma/artifacts/acpx-demo.json"),
        `${JSON.stringify({
          auxiliaryTaskId: "other-task",
          summary: "Wrong artifact.",
          capturedAnswer: "Wrong answer.",
          findings: ["Wrong finding."],
          evidence: [],
        })}\n`,
      );

      const result = await runCli(["result", "show", "acpx-demo"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 1);
      assert.equal(body.status, "RESULT_IDENTITY_MISMATCH");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("result show returns a structured error for malformed artifact json", async () => {
    const { dir } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/artifacts"), { recursive: true });
      writeFileSync(join(dir, ".oma/artifacts/acpx-demo.json"), "{not-json\n");

      const result = await runCli(["result", "show", "acpx-demo"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 1);
      assert.equal(body.status, "RESULT_ARTIFACT_INVALID");
      assert.equal(body.auxiliaryTaskId, "acpx-demo");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute maps read permissions to approve reads", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeFileSync(
        join(dir, ".oma/config/agents.json"),
        `${JSON.stringify(
          {
            version: 1,
            approvedAgents: {
              codex: {
                approved: true,
                role: "deep",
                permissions: "read",
              },
            },
          },
          null,
          2,
        )}\n`,
      );

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });

      assert.equal(result.exitCode, 0);
      assert.equal(calls[1].args[2], "--approve-reads");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute passes route timeoutSeconds to ACPX", async () => {
    const plan = samplePlanWithAcpxRoute();
    plan.tasks[0].route.timeoutSeconds = 420;
    const { dir, path } = tempPlan(plan);
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeApprovedAgentsConfig(dir);
      const calls: string[][] = [];

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (command, args) => {
          calls.push([command, ...args]);
          if (args.includes("show")) {
            return { exitCode: 0, stdout: "session metadata", stderr: "" };
          }
          if (args.includes("history")) {
            return { exitCode: 0, stdout: "assistant final\nDone.", stderr: "" };
          }
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });

      const promptCall = calls.find((call) => call.includes("--timeout"));
      assert.equal(result.exitCode, 0);
      assert.ok(promptCall);
      assert.deepEqual(promptCall.slice(promptCall.indexOf("--timeout"), promptCall.indexOf("--timeout") + 2), [
        "--timeout",
        "420",
      ]);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("run --execute uses global Approved Agents config by default", async () => {
    const { dir, path } = tempPlan(samplePlanWithAcpxRoute());
    const previousCwd = process.cwd();
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      assert.ok(process.env.OMA_HOME);
      writeGlobalApprovedAgentsConfig(process.env.OMA_HOME);
      process.chdir(dir);

      const result = await runCli(["run", path, "--execute"], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          return { exitCode: 0, stdout: "acpx completed", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.kind, "Auxiliary Task Return");
      assert.equal(calls.length, 4);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("schema command exposes Auxiliary Task Return contract", async () => {
    const result = await runCli(["schema"]);
    const body = bodyAsRecord(result.body);

    assert.equal(result.exitCode, 0);
    assert.equal(body.kind, "Auxiliary Task Return Schema");
    assert.ok(body.requiredFields.includes("evidence"));
    assert.ok(body.requiredFields.includes("runId"));
  });

  test("help command lists acpx onboarding command", async () => {
    const result = await runCli(["--help"]);
    const body = bodyAsRecord(result.body);

    assert.equal(result.exitCode, 0);
    assert.match(body.summary, /acpx/);
  });

  test("version command reports package version", async () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    const result = await runCli(["--version"]);
    const body = bodyAsRecord(result.body);

    assert.equal(result.exitCode, 0);
    assert.equal(body.version, packageJson.version);
  });

  test("install starts interactive installation for all skills", async () => {
    const calls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv; stdio?: string }> = [];

    const result = await runCli(["install"], {
      executeCommand: async (command, args, env, stdio) => {
        calls.push({ command, args, env, stdio });
        return { exitCode: 0, stdout: "installed", stderr: "" };
      },
    });
    const body = bodyAsRecord(result.body);

    assert.equal(result.exitCode, 0);
    assert.equal(body.status, "SKILLS_INSTALLED");
    assert.equal(body.source, skillsPath());
    assert.deepEqual(
      calls.map(({ command, args }) => ({ command, args })),
      [
      {
        command: "npx",
        args: ["skills@latest", "add", skillsPath(), "--full-depth", "-f"],
      },
      ],
    );
    assert.equal(calls[0].stdio, "inherit");
  });

  test("install ignores skill arguments and installs all skills", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await runCli(["install", "oma"], {
      executeCommand: async (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });
    const body = bodyAsRecord(result.body);

    assert.equal(result.exitCode, 0);
    assert.equal(body.status, "SKILLS_INSTALLED");
    assert.deepEqual(calls[0], {
      command: "npx",
      args: ["skills@latest", "add", skillsPath(), "--full-depth", "-f"],
    });
  });

  test("install strips npm npx environment variables before nested npx", async () => {
    const previousNpmCommand = process.env.npm_command;
    const previousInitCwd = process.env.INIT_CWD;
    let capturedEnv: NodeJS.ProcessEnv | undefined;

    try {
      process.env.npm_command = "exec";
      process.env.INIT_CWD = "/tmp/from-parent-npx";

      const result = await runCli(["install"], {
        executeCommand: async (_command, _args, env) => {
          capturedEnv = env;
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      });

      assert.equal(result.exitCode, 0);
      assert.ok(capturedEnv);
      assert.equal(capturedEnv.npm_command, undefined);
      assert.equal(capturedEnv.INIT_CWD, undefined);
    } finally {
      if (previousNpmCommand === undefined) {
        delete process.env.npm_command;
      } else {
        process.env.npm_command = previousNpmCommand;
      }
      if (previousInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = previousInitCwd;
      }
    }
  });

  test("acpx init discovers declared ACPX adapters without presenting them as user-usable agents", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-init-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["acpx", "init"], {
        executeCommand: async (command, args) => {
          assert.equal(command, "acpx");
          assert.deepEqual(args, ["--help"]);
          return { exitCode: 0, stdout: "Commands:\n  codex [options] [prompt...]                Use codex agent\n  claude [options] [prompt...]                Use claude agent\n", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);
      assert.ok(process.env.OMA_HOME);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "AGENT_ONBOARDING_READY");
      assert.deepEqual(body.declaredAdapters, ["codex", "claude"]);
      assert.equal("supportedAgents" in body, false);
      assert.equal("availableAgents" in body, false);
      assert.deepEqual(body.availableRoles, ["quick", "deep", "visual"]);
      assert.deepEqual(body.availablePermissions, ["read", "edit"]);
      assert.deepEqual(body.availableScopes, ["project", "global"]);
      assert.equal(body.recommendedApprovalCommand, "oma acpx approve --agent codex --role deep --permissions edit --scope project");
      assert.match(String(body.summary), /declared ACPX adapters/i);
      assert.match(String(body.summary), /does not prove the user can run them/i);
      assert.equal(existsSync(join(process.env.OMA_HOME, "config/agents.json")), false);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("acpx init recommends a discovered non-codex adapter when codex is absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-init-no-codex-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["acpx", "init"], {
        executeCommand: async () => ({
          exitCode: 0,
          stdout: "Commands:\n  claude [options] [prompt...]                Use claude agent\n",
          stderr: "",
        }),
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.deepEqual(body.declaredAdapters, ["claude"]);
      assert.equal(body.recommendedApprovalCommand, "oma acpx approve --agent claude --role deep --permissions edit --scope project");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("acpx init parses declared adapters from stderr help output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-init-stderr-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["acpx", "init"], {
        executeCommand: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: "Commands:\n  gemini [options] [prompt...]                Use gemini agent\n",
        }),
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.deepEqual(body.declaredAdapters, ["gemini"]);
      assert.equal(body.recommendedApprovalCommand, "oma acpx approve --agent gemini --role deep --permissions edit --scope project");
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("acpx init reports structured discovery failure when acpx help fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-init-failed-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli(["acpx", "init"], {
        executeCommand: async () => ({
          exitCode: 127,
          stdout: "",
          stderr: "acpx: command not found",
        }),
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 1);
      assert.equal(body.status, "AGENT_ONBOARDING_DISCOVERY_FAILED");
      assert.deepEqual(body.declaredAdapters, []);
      assert.match(String(body.summary), /could not complete ACPX adapter discovery/i);
      assert.match(String(body.error), /command not found/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("acpx init reports existing Approved Agents config without prompting", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-init-existing-"));
    const previousCwd = process.cwd();
    const calls: Array<{ command: string; args: string[] }> = [];
    try {
      process.chdir(dir);
      assert.ok(process.env.OMA_HOME);
      writeGlobalApprovedAgentsConfig(process.env.OMA_HOME);

      const result = await runCli(["acpx", "init"], {
        executeCommand: async (command, args) => {
          calls.push({ command, args });
          return { exitCode: 0, stdout: "should not inspect", stderr: "" };
        },
      });
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 0);
      assert.equal(body.status, "APPROVED_AGENTS_LOADED");
      assert.deepEqual(body.approvedAgents, ["codex"]);
      assert.deepEqual(calls, []);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("acpx approve reports malformed existing config instead of throwing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-approve-malformed-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      mkdirSync(join(dir, ".oma/config"), { recursive: true });
      writeFileSync(join(dir, ".oma/config/agents.json"), "{bad");

      const result = await runCli(["acpx", "approve", "--agent", "codex", "--role", "deep"]);
      const body = bodyAsRecord(result.body);

      assert.equal(result.exitCode, 1);
      assert.equal(body.status, "INVALID_APPROVED_AGENTS");
      assert.match(body.errors.join("\n"), /JSON/);
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("acpx approve writes project Approved Agents config from explicit arguments", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-approve-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = await runCli([
        "acpx",
        "approve",
        "--agent",
        "codex",
        "--role",
        "quick",
        "--permissions",
        "read",
        "--scope",
        "project",
      ]);
      const config = JSON.parse(readFileSync(join(dir, ".oma/config/agents.json"), "utf8"));

      assert.equal(result.exitCode, 0);
      assert.equal(bodyAsRecord(result.body).status, "AGENT_ONBOARDING_COMPLETE");
      assert.deepEqual(config.approvedAgents.codex, {
        approved: true,
        role: "quick",
        permissions: "read",
      });
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("acpx approve writes project Approved Agents by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oma-acpx-approve-project-default-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(dir);

      const result = await runCli([
        "acpx",
        "approve",
        "--agent",
        "claude",
        "--role",
        "deep",
        "--permissions",
        "edit",
      ]);
      const config = JSON.parse(readFileSync(join(dir, ".oma/config/agents.json"), "utf8"));

      assert.equal(result.exitCode, 0);
      assert.equal(bodyAsRecord(result.body).scope, "project");
      assert.deepEqual(Object.keys(config.approvedAgents), ["claude"]);
      assert.deepEqual(config.approvedAgents.claude, {
        approved: true,
        role: "deep",
        permissions: "edit",
      });
    } finally {
      process.chdir(previousCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("oma skill documents localOutputs for file creation tasks", () => {
    const skill = readFileSync(resolve("skills/oma/SKILL.md"), "utf8");

    assert.match(skill, /## Onboarding Gate/);
    assert.match(skill, /Before executing an ACPX-backed Offload Plan/i);
    assert.match(skill, /must use the `oma-acpx-init` skill/i);
    assert.match(skill, /proposal-only `oma run`/);
    assert.match(skill, /Do not guess `route\.agent`/);
    assert.match(skill, /Approved Agent role/i);
    assert.match(skill, /summarize the current approval state/i);
    assert.match(skill, /current optional choices/i);
    assert.match(skill, /visual/);
    assert.match(skill, /deep/);
    assert.match(skill, /quick/);
    assert.match(skill, /`oma setup`/);
    assert.match(skill, /`oma schema`/);
    assert.match(skill, /localOutputs/);
    assert.match(skill, /oma acpx init/);
    assert.match(skill, /oma-acpx-init/);
    assert.match(skill, /NO_AGENT_ONBOARDING/);
    assert.match(skill, /oma run <plan-path> --execute/);
    assert.match(skill, /oma result show <task-id>/);
    assert.match(skill, /Uses ACPX prompt sessions for `acpx` routes/i);
    assert.match(skill, /Auxiliary Return Capture/);
    assert.match(skill, /trusted `sessions history` first, then stdout fallback/);
    assert.match(skill, /Result Trust Boundary/);
    assert.match(skill, /Hard execution failures override result trust/);
    assert.match(skill, /capturedAnswer/);
    assert.match(skill, /route\.timeoutSeconds/);
    assert.match(skill, /timestamped `assistant` entry/);
    assert.match(skill, /incomplete schema-like JSON fragments/);
    assert.match(skill, /malformed artifact JSON/);
    assert.match(skill, /mismatched `auxiliaryTaskId` returns as evidence only/);
  });

  test("oma skill documents persistent ACPX session usage instead of one-shot exec", () => {
    const skill = readFileSync(resolve("skills/oma/SKILL.md"), "utf8");

    assert.match(skill, /ACPX Session Discipline/);
    assert.match(skill, /Do not use `exec`/);
    assert.match(skill, /sessions ensure --name/);
    assert.match(skill, /-s <session-name>/);
    assert.match(skill, /sessions show <session-name>/);
    assert.match(skill, /sessions history <session-name>/);
    assert.match(skill, /sessionName/);
  });

  test("oma acpx init skill documents scriptable Approved Agent onboarding", () => {
    const skill = readFileSync(resolve("skills/oma-acpx-init/SKILL.md"), "utf8");

    assert.match(skill, /^name: oma-acpx-init/m);
    assert.match(skill, /NO_AGENT_ONBOARDING/);
    assert.match(skill, /NO_APPROVED_AGENT/);
    assert.match(skill, /Approved Agent/);
    assert.match(skill, /\.oma\/config\/agents\.json/);
    assert.match(skill, /current configuration/i);
    assert.match(skill, /available choices/i);
    assert.match(skill, /Declared ACPX adapters/i);
    assert.doesNotMatch(skill, /Supported agents:/i);
    assert.match(skill, /Roles/i);
    assert.match(skill, /Permissions/i);
    assert.match(skill, /Scope/i);
    assert.match(skill, /oma acpx init/);
    assert.match(skill, /oma acpx approve/);
    assert.match(skill, /must not prompt/);
  });
});
