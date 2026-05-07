import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";

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

function bodyAsRecord(body: unknown): Record<string, any> {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  return body as Record<string, any>;
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

  test("fake Execute Mode returns completed Auxiliary Task Return", () => {
    const plan = samplePlan();
    const task = plan.tasks[0];

    const result = buildAuxiliaryTaskReturn(plan, task);

    assert.equal(result.kind, "Auxiliary Task Return");
    assert.equal(result.status, "completed");
    assert.equal(result.verdict, "provisional_accept");
    assert.equal(result.hostPlanComplete, false);
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
    assert.match(schema.statusSemantics.completed, /does not mean the Host Plan is complete/i);
  });
});

describe("oma CLI", () => {
  test("package exposes oma as the CLI binary", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      bin: Record<string, string>;
    };

    assert.deepEqual(packageJson.bin, {
      oma: "dist/src/cli/index.js",
    });
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

  test("schema command exposes Auxiliary Task Return contract", async () => {
    const result = await runCli(["schema"]);
    const body = bodyAsRecord(result.body);

    assert.equal(result.exitCode, 0);
    assert.equal(body.kind, "Auxiliary Task Return Schema");
    assert.ok(body.requiredFields.includes("evidence"));
  });

  test("install starts interactive installation for all skills", async () => {
    const calls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];

    const result = await runCli(["install"], {
      executeCommand: async (command, args, env) => {
        calls.push({ command, args, env });
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
        args: ["skills@latest", "add", skillsPath(), "--full-depth"],
      },
      ],
    );
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
      args: ["skills@latest", "add", skillsPath(), "--full-depth"],
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

  test("oma skill documents localOutputs for file creation tasks", () => {
    const skill = readFileSync(resolve("skills/oma-orchestrator/SKILL.md"), "utf8");

    assert.match(skill, /localOutputs/);
    assert.match(skill, /oma run <plan-path> --execute/);
    assert.match(skill, /writes the declared local output files/i);
  });
});
