#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  type AuxiliaryTaskReturn,
  DEFAULT_OFFLOAD_PLAN_PATH,
  buildAuxiliaryTaskReturn,
  buildOffloadProposal,
  describeAuxiliaryTaskReturnSchema,
  inspectOffloadPlan,
  loadOffloadPlan,
} from "../core/offload";

export interface CliResult {
  exitCode: number;
  body: unknown;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CliOptions {
  executeCommand?: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>;
}

export async function runCli(args: string[], options: CliOptions = {}): Promise<CliResult> {
  const [command, ...rest] = args;

  switch (command) {
    case "setup":
      return setupCommand();
    case "install":
      return installCommand(rest, options.executeCommand ?? executeCommand);
    case "run":
      return runCommand(rest);
    case "schema":
      return {
        exitCode: 0,
        body: describeAuxiliaryTaskReturnSchema(),
      };
    default:
      return {
        exitCode: 1,
        body: {
          status: "UNKNOWN_COMMAND",
          summary: "Supported commands: setup, install, run, schema.",
        },
      };
  }
}

async function installCommand(
  _args: string[],
  execute: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>,
): Promise<CliResult> {
  const source = resolve(__dirname, "..", "..", "..", "skills");
  const commandArgs = ["skills@latest", "add", source, "--full-depth"];
  const commandResult = await execute("npx", commandArgs, cleanNestedNpxEnv(process.env));

  return {
    exitCode: commandResult.exitCode,
    body: {
      status: commandResult.exitCode === 0 ? "SKILLS_INSTALLED" : "SKILLS_INSTALL_FAILED",
      source,
      command: ["npx", ...commandArgs],
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
    },
  };
}

function cleanNestedNpxEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleanEnv = { ...env };
  delete cleanEnv.npm_command;
  delete cleanEnv.npm_config_argv;
  delete cleanEnv.npm_config_global;
  delete cleanEnv.npm_config_local_prefix;
  delete cleanEnv.npm_config_prefix;
  delete cleanEnv.npm_config_user_agent;
  delete cleanEnv.npm_execpath;
  delete cleanEnv.npm_lifecycle_event;
  delete cleanEnv.npm_lifecycle_script;
  delete cleanEnv.npm_node_execpath;
  delete cleanEnv.npm_package_json;
  delete cleanEnv.INIT_CWD;
  return cleanEnv;
}

function executeCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });
    let stdout = "";
    let stderr = "";

    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function setupCommand(): CliResult {
  const planPath = DEFAULT_OFFLOAD_PLAN_PATH;
  mkdirSync(dirname(planPath), { recursive: true });
  mkdirSync(".oma/artifacts", { recursive: true });
  if (!existsSync(planPath)) {
    writeFileSync(planPath, `${JSON.stringify(defaultPlan(), null, 2)}\n`);
  }

  return {
    exitCode: 0,
    body: {
      status: "SETUP_COMPLETE",
      offloadPlan: planPath,
      artifactsDir: ".oma/artifacts",
    },
  };
}

function runCommand(args: string[]): CliResult {
  const executeMode = args.includes("--execute");
  const planPath = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_OFFLOAD_PLAN_PATH;
  const loaded = loadOffloadPlan(planPath);

  if (loaded.status !== "PLAN_LOADED") {
    return {
      exitCode: loaded.status === "NO_PLAN" ? 2 : 1,
      body: loaded,
    };
  }

  const inspection = inspectOffloadPlan(loaded.plan);

  if (inspection.status === "ALL_DONE") {
    return {
      exitCode: 0,
      body: inspection,
    };
  }

  if (!executeMode) {
    return {
      exitCode: 0,
      body: buildOffloadProposal(loaded.plan, inspection.task),
    };
  }

  const auxiliaryReturn = buildAuxiliaryTaskReturn(loaded.plan, inspection.task);
  writeLocalOutputs(inspection.task.localOutputs);
  writeArtifact(auxiliaryReturn);

  return {
    exitCode: 0,
    body: auxiliaryReturn,
  };
}

function writeLocalOutputs(outputs: Array<{ path: string; content: string }> | undefined): void {
  for (const output of outputs ?? []) {
    const outputPath = normalize(output.path);
    if (isAbsolute(outputPath) || outputPath.startsWith("..")) {
      throw new Error(`Refusing to write local output outside the workspace: ${output.path}`);
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output.content);
  }
}

function writeArtifact(auxiliaryReturn: AuxiliaryTaskReturn): void {
  const artifactPath = join(".oma", "artifacts", `${auxiliaryReturn.auxiliaryTaskId}.json`);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        kind: "Fake Local Execution Artifact",
        auxiliaryTaskId: auxiliaryReturn.auxiliaryTaskId,
        summary: auxiliaryReturn.summary,
        evidence: auxiliaryReturn.evidence,
        findings: auxiliaryReturn.findings,
        note: "This artifact keeps long execution detail outside the Host Agent conversation.",
      },
      null,
      2,
    )}\n`,
  );
}

function defaultPlan() {
  return {
    version: 1,
    objective: "Provide a bounded Offload Plan that saves Host Agent context.",
    tasks: [
      {
        id: "example-docs-check",
        title: "Check documentation for sidecar vocabulary",
        status: "pending",
        contextBudget: {
          maxTokens: 2000,
          rationale: "This review can run with a small slice of context instead of the full Host Plan.",
        },
        route: {
          runtime: "fake-local",
          agent: "reviewer",
        },
        prompt:
          "Review the provided files for Host Agent, Offload Plan, Auxiliary Task, Offload Proposal, Execute Mode, Auxiliary Task Return, and Evidence language.",
        expectedReturn: "AuxiliaryTaskReturn",
        readFiles: ["CONTEXT.md", "README.md"],
        modifiedFiles: [],
      },
    ],
  };
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result.body, null, 2)}\n`);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    });
}
