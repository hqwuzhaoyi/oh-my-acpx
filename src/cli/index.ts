#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

import {
  type ApprovedAgentConfig,
  type AuxiliaryTaskReturn,
  DEFAULT_OFFLOAD_PLAN_PATH,
  buildAuxiliaryTaskReturn,
  buildOffloadProposal,
  captureExtractedAuxiliaryFindings,
  captureMismatchedAuxiliaryReturns,
  captureSchemaConfirmedAuxiliaryReturn,
  defaultApprovedAgentsPath,
  describeAuxiliaryTaskReturnSchema,
  inspectOffloadPlan,
  loadApprovedAgents,
  loadOffloadPlan,
  matchApprovedAgent,
  PROJECT_APPROVED_AGENTS_PATH,
  isSafeLocalOutputPath,
  type OffloadPlan,
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
  executeCommand?: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    stdio?: "inherit" | "pipe",
  ) => Promise<CommandResult>;
  confirmAcpxInstall?: (message: string) => Promise<boolean>;
}

export async function runCli(args: string[], options: CliOptions = {}): Promise<CliResult> {
  const [command, ...rest] = args;

  if (command === "--help" || command === "help" || command === undefined) {
    return {
      exitCode: 0,
      body: {
        status: "HELP",
        summary: "Supported commands: acpx, setup, install, result, run, schema. Use oma acpx init before ACPX Execute Mode.",
      },
    };
  }

  if (command === "--version" || command === "version") {
    return {
      exitCode: 0,
      body: {
        status: "VERSION",
        version: packageVersion(),
      },
    };
  }

  switch (command) {
    case "acpx":
      return acpxCommand(rest, options);
    case "setup":
      return setupCommand();
    case "install":
      return installCommand(rest, options.executeCommand ?? executeCommand, options.confirmAcpxInstall ?? confirmAcpxInstall);
    case "result":
      return resultCommand(rest);
    case "run":
      return runCommand(rest, options.executeCommand ?? executeCommand);
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
          summary: "Supported commands: acpx, setup, install, result, run, schema.",
        },
      };
  }
}

function packageVersion(): string {
  try {
    const packageJsonPath = resolve(__dirname, "../../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : "unknown";
  } catch {
    return "unknown";
  }
}

function resultCommand(args: string[]): CliResult {
  const [subcommand, taskId, ...flags] = args;
  if (subcommand !== "show" || !taskId) {
    return {
      exitCode: 1,
      body: {
        status: "INVALID_RESULT_COMMAND",
        summary: "Usage: oma result show <task-id> [--full].",
      },
    };
  }
  if (!isSafeResultTaskId(taskId)) {
    return {
      exitCode: 1,
      body: {
        status: "INVALID_RESULT_TASK_ID",
        auxiliaryTaskId: taskId,
        summary: "Result task id must be a single safe Auxiliary Task id, not a path.",
      },
    };
  }
  const artifactPath = join(".oma", "artifacts", `${taskId}.json`);
  if (!existsSync(artifactPath)) {
    return {
      exitCode: 2,
      body: {
        status: "RESULT_NOT_FOUND",
        auxiliaryTaskId: taskId,
        summary: `No OMA result artifact exists for Auxiliary Task ${taskId}.`,
      },
    };
  }
  let artifact: Record<string, any>;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as Record<string, any>;
  } catch (error) {
    return {
      exitCode: 1,
      body: {
        status: "RESULT_ARTIFACT_INVALID",
        auxiliaryTaskId: taskId,
        summary: `Result artifact for Auxiliary Task ${taskId} is not valid JSON.`,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (artifact.auxiliaryTaskId !== taskId) {
    return {
      exitCode: 1,
      body: {
        status: "RESULT_IDENTITY_MISMATCH",
        auxiliaryTaskId: taskId,
        artifactAuxiliaryTaskId: artifact.auxiliaryTaskId,
        summary: `Result artifact identity does not match requested Auxiliary Task ${taskId}.`,
      },
    };
  }
  if (flags.includes("--full")) {
    return {
      exitCode: 0,
      body: artifact,
    };
  }
  return {
    exitCode: 0,
    body: {
      kind: "Auxiliary Result Inspection",
      auxiliaryTaskId: taskId,
      summary: artifact.summary,
      capturedAnswer: artifact.capturedAnswer ?? (Array.isArray(artifact.findings) ? artifact.findings.join("\n") : ""),
      findings: artifact.findings ?? [],
      evidence: artifact.evidence ?? [],
    },
  };
}

function isSafeResultTaskId(taskId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId) && !taskId.includes("..");
}

async function acpxCommand(args: string[], options: CliOptions): Promise<CliResult> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "init":
      return acpxInitCommand(options.executeCommand ?? executeCommand);
    case "approve":
      return acpxApproveCommand(rest);
    default:
      return {
        exitCode: 1,
        body: {
          status: "UNKNOWN_COMMAND",
          summary: "Supported acpx commands: init, approve.",
        },
      };
  }
}

async function acpxInitCommand(
  execute: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>,
): Promise<CliResult> {
  const existing = loadApprovedAgents();
  if (existing.status === "APPROVED_AGENTS_LOADED") {
    return {
      exitCode: 0,
      body: {
        status: "APPROVED_AGENTS_LOADED",
        configPath: existing.configPath,
        scope: existing.scope,
        approvedAgents: Object.keys(existing.config.approvedAgents),
        summary: "Approved Agents config already exists. Use oma acpx approve with explicit arguments to change it.",
      },
    };
  }

  const detected = await execute("acpx", ["--help"], process.env);
  const discoveryOutput = `${detected.stdout}\n${detected.stderr}`;
  const declaredAdapters = parseAcpxAgents(discoveryOutput);
  if (detected.exitCode !== 0) {
    return {
      exitCode: 1,
      body: {
        status: "AGENT_ONBOARDING_DISCOVERY_FAILED",
        declaredAdapters,
        availableRoles: ["quick", "deep", "visual"],
        availablePermissions: ["read", "edit"],
        availableScopes: ["project", "global"],
        summary:
          "OMA could not complete ACPX adapter discovery. Declared adapters are candidates only; fix or verify ACPX before approving agents.",
        error: detected.stderr || detected.stdout || "acpx --help failed.",
      },
    };
  }
  const recommendedAgent = declaredAdapters.includes("codex") ? "codex" : declaredAdapters[0];
  const recommendedRoles = recommendedRolesForAgents(declaredAdapters);
  const recommendedApprovalCommands = recommendedApprovalCommandsForAgents(declaredAdapters);
  const recommendedApprovalCommand = recommendedAgent ? recommendedApprovalCommands[recommendedAgent] : undefined;

  return {
    exitCode: 0,
    body: {
      status: "AGENT_ONBOARDING_READY",
      declaredAdapters,
      availableRoles: ["quick", "deep", "visual"],
      availablePermissions: ["read", "edit"],
      availableScopes: ["project", "global"],
      recommendedRoles,
      recommendedApprovalCommands,
      recommendedApprovalCommand,
      summary:
        "Declared ACPX adapters discovered. This does not prove the user can run them; ask which adapters are configured and usable before approving roles, permissions, and scope.",
    },
  };
}

function acpxApproveCommand(args: string[]): CliResult {
  const parsed = parseNamedArgs(args);
  const agent = parsed.agent;
  const role = parsed.role ?? (agent ? recommendedRoleForAgent(agent) : undefined);
  const permissions = parsed.permissions ?? "edit";
  const scope = parsed.scope ?? "project";

  if (!agent || !role || !["quick", "deep", "visual"].includes(role) || !["read", "edit"].includes(permissions) || !["project", "global"].includes(scope)) {
    return {
      exitCode: 1,
      body: {
        status: "INVALID_APPROVAL_ARGUMENTS",
        summary:
          "Usage: oma acpx approve --agent <name> [--role quick|deep|visual] [--permissions read|edit] [--scope project|global].",
      },
    };
  }

  const configPath = scope === "project" ? resolve(PROJECT_APPROVED_AGENTS_PATH) : defaultApprovedAgentsPath();
  const existingApprovedAgents = loadExistingApprovedAgentsForWrite(configPath);
  if (!existingApprovedAgents.ok) {
    return existingApprovedAgents.result;
  }
  const approvedAgents = {
    ...existingApprovedAgents.approvedAgents,
    [agent]: {
      approved: true as const,
      role: role as "quick" | "deep" | "visual",
      permissions: permissions as "read" | "edit",
    },
  };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        approvedAgents,
      },
      null,
      2,
    )}\n`,
  );

  return {
    exitCode: 0,
    body: {
      status: "AGENT_ONBOARDING_COMPLETE",
      configPath,
      scope,
      approvedAgents: Object.keys(approvedAgents),
      summary:
        "Approved Agents persisted from explicit arguments. Skills own the human approval flow; the CLI only writes declared approvals.",
    },
  };
}

function parseAcpxAgents(helpOutput: string): string[] {
  const agents: string[] = [];
  const commandPattern = /^\s{2}([a-z][a-z0-9-]*)\s+\[options\]\s+\[prompt\.\.\.\]\s+Use /gm;
  for (const match of helpOutput.matchAll(commandPattern)) {
    agents.push(match[1]);
  }
  return agents;
}

function loadExistingApprovedAgentsForWrite(
  configPath: string,
): { ok: true; approvedAgents: ApprovedAgentConfig["approvedAgents"] } | { ok: false; result: CliResult } {
  if (!existsSync(configPath)) {
    return { ok: true, approvedAgents: {} };
  }

  const loaded = loadApprovedAgents(configPath);
  if (loaded.status !== "APPROVED_AGENTS_LOADED") {
    return {
      ok: false,
      result: {
        exitCode: 1,
        body: loaded,
      },
    };
  }
  return { ok: true, approvedAgents: loaded.config.approvedAgents };
}

function recommendedRoleForAgent(agent: string): "quick" | "deep" | "visual" {
  if (["cursor", "gemini"].includes(agent)) {
    return "visual";
  }
  if (["pi", "qwen", "kimi", "iflow"].includes(agent)) {
    return "quick";
  }
  return "deep";
}

function recommendedRolesForAgents(agents: string[]): Record<string, "quick" | "deep" | "visual"> {
  return Object.fromEntries(agents.map((agent) => [agent, recommendedRoleForAgent(agent)]));
}

function recommendedApprovalCommandForAgent(agent: string): string {
  return `oma acpx approve --agent ${agent} --role ${recommendedRoleForAgent(agent)} --permissions edit --scope project`;
}

function recommendedApprovalCommandsForAgents(agents: string[]): Record<string, string> {
  return Object.fromEntries(agents.map((agent) => [agent, recommendedApprovalCommandForAgent(agent)]));
}

async function discoverAcpxAgents(
  execute: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    stdio?: "inherit" | "pipe",
  ) => Promise<CommandResult>,
  env: NodeJS.ProcessEnv,
): Promise<Record<string, unknown>> {
  const detected = await execute("acpx", ["--help"], env);
  const discoveryOutput = `${detected.stdout}\n${detected.stderr}`;
  const declaredAdapters = parseAcpxAgents(discoveryOutput);

  if (detected.exitCode !== 0) {
    return {
      status: "AGENT_DISCOVERY_FAILED",
      declaredAdapters,
      error: detected.stderr || detected.stdout || "acpx --help failed.",
      summary:
        "OMA could not inspect declared ACPX adapters. Fix or verify ACPX before approving agents for OMA.",
    };
  }

  return {
    status: "AGENT_DISCOVERY_READY",
    declaredAdapters,
    recommendedRoles: recommendedRolesForAgents(declaredAdapters),
    recommendedApprovalCommands: recommendedApprovalCommandsForAgents(declaredAdapters),
    summary:
      "Declared ACPX adapters discovered. These are candidates only until the user confirms they are configured and approves them for OMA.",
  };
}

function parseNamedArgs(args: string[]): Record<string, string | undefined> {
  const parsed: Record<string, string | undefined> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    parsed[key] = args[index + 1];
    index += 1;
  }
  return parsed;
}

async function installCommand(
  args: string[],
  execute: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    stdio?: "inherit" | "pipe",
  ) => Promise<CommandResult>,
  confirmInstallAcpx: (message: string) => Promise<boolean>,
): Promise<CliResult> {
  const source = resolve(__dirname, "..", "..", "..", "skills");
  const installEnv = cleanNestedNpxEnv(process.env);
  const shouldInspectAgents = args.includes("--inspect-agents") || args.includes("--list-agents");
  const skillCommandArgs = ["skills", "add", source, "--global", "--all", "--full-depth"];
  const skillResult = await execute("npx", skillCommandArgs, installEnv, "inherit");

  const skillInstall = {
    status: skillResult.exitCode === 0 ? "SKILLS_INSTALLED" : "SKILLS_INSTALL_FAILED",
    source,
    command: ["npx", ...skillCommandArgs],
    stdout: skillResult.stdout,
    stderr: skillResult.stderr,
  };

  if (skillResult.exitCode !== 0) {
    return {
      exitCode: skillResult.exitCode,
      body: {
        status: "SKILLS_INSTALL_FAILED",
        source,
        command: skillInstall.command,
        stdout: skillResult.stdout,
        stderr: skillResult.stderr,
        skills: skillInstall,
      },
    };
  }

  const acpxCheckArgs = ["--version"];
  const acpxCheck = await execute("acpx", acpxCheckArgs, installEnv);
  if (acpxCheck.exitCode === 0) {
    const agentDiscovery = shouldInspectAgents ? await discoverAcpxAgents(execute, installEnv) : undefined;
    return {
      exitCode: 0,
      body: {
        status: "OMA_INSTALLED",
        source,
        command: skillInstall.command,
        stdout: skillResult.stdout,
        stderr: skillResult.stderr,
        skills: skillInstall,
        acpx: {
          status: "ACPX_PRESENT",
          command: ["acpx", ...acpxCheckArgs],
          version: acpxCheck.stdout.trim() || acpxCheck.stderr.trim(),
          stdout: acpxCheck.stdout,
          stderr: acpxCheck.stderr,
        },
        ...(agentDiscovery ? { agentDiscovery } : {}),
      },
    };
  }

  const shouldInstallAcpx =
    args.includes("--yes") || args.includes("-y") || (
      !args.includes("--no-acpx") &&
      await confirmInstallAcpx("acpx is not installed. Install it globally with `npm install -g acpx` now? [y/N] ")
    );

  if (!shouldInstallAcpx) {
    return {
      exitCode: 0,
      body: {
        status: "OMA_INSTALLED",
        source,
        command: skillInstall.command,
        stdout: skillResult.stdout,
        stderr: skillResult.stderr,
        skills: skillInstall,
        acpx: {
          status: "ACPX_INSTALL_SKIPPED",
          checkCommand: ["acpx", ...acpxCheckArgs],
          checkStdout: acpxCheck.stdout,
          checkStderr: acpxCheck.stderr,
          summary: "acpx is required only for real ACPX-backed Execute Mode. Install later with `npm install -g acpx`.",
        },
      },
    };
  }

  const acpxInstallArgs = ["install", "-g", "acpx"];
  const acpxInstall = await execute("npm", acpxInstallArgs, installEnv, "inherit");
  const acpxInstallStatus = acpxInstall.exitCode === 0 ? "ACPX_INSTALLED" : "ACPX_INSTALL_FAILED";
  const agentDiscovery = shouldInspectAgents && acpxInstall.exitCode === 0 ? await discoverAcpxAgents(execute, installEnv) : undefined;

  return {
    exitCode: acpxInstall.exitCode,
    body: {
      status: acpxInstall.exitCode === 0 ? "OMA_INSTALLED" : "ACPX_INSTALL_FAILED",
      source,
      command: skillInstall.command,
      stdout: skillResult.stdout,
      stderr: skillResult.stderr,
      skills: skillInstall,
      acpx: {
        status: acpxInstallStatus,
        checkCommand: ["acpx", ...acpxCheckArgs],
        checkStdout: acpxCheck.stdout,
        checkStderr: acpxCheck.stderr,
        command: ["npm", ...acpxInstallArgs],
        stdout: acpxInstall.stdout,
        stderr: acpxInstall.stderr,
      },
      ...(agentDiscovery ? { agentDiscovery } : {}),
    },
  };
}

async function confirmAcpxInstall(message: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await readline.question(message);
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    readline.close();
  }
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

function executeCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdio: "inherit" | "pipe" = "pipe",
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    if (stdio === "pipe") {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
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

async function runCommand(
  args: string[],
  execute: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>,
): Promise<CliResult> {
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

  let acpxMatch: ReturnType<typeof matchApprovedAgent> | undefined;
  if (inspection.task.route.runtime === "acpx") {
    const approvedAgents = loadApprovedAgents();
    if (approvedAgents.status !== "APPROVED_AGENTS_LOADED") {
      return {
        exitCode: approvedAgents.status === "NO_AGENT_ONBOARDING" ? 2 : 1,
        body: approvedAgents,
      };
    }

    acpxMatch = matchApprovedAgent(
      approvedAgents.config,
      inspection.task.route.agent,
      inspection.task.route.role,
    );
    if (acpxMatch.status !== "APPROVED_AGENT_MATCH") {
      return {
        exitCode: 2,
        body: acpxMatch,
      };
    }
  }

  const runId = randomUUID();
  const acpxSessionName = inspection.task.route.runtime === "acpx"
    ? sessionNameForRun(inspection.task.route.sessionName ?? `oma-${inspection.task.id}`, runId)
    : undefined;
  const acpxResult =
    inspection.task.route.runtime === "acpx" && acpxMatch?.status === "APPROVED_AGENT_MATCH"
      ? await runAcpxTask(
          inspection.task.route.agent,
          acpxSessionName ?? `oma-${inspection.task.id}`,
          inspection.task.id,
          runId,
          inspection.task.prompt,
          inspection.task.localOutputs,
          inspection.task.route.timeoutSeconds,
          acpxMatch.permissions,
          execute,
        )
      : undefined;
  const auxiliaryReturn = buildAuxiliaryTaskReturn(loaded.plan, inspection.task, runId);
  let capturedAnswer: string | undefined;
  if (acpxResult) {
    auxiliaryReturn.summary = "Auxiliary Task completed through ACPX Execute Mode.";
    auxiliaryReturn.evidence = auxiliaryReturn.evidence.map((item) =>
      item.kind === "note"
        ? {
            ...item,
            summary: `ACPX execution ran the Auxiliary Task through ${inspection.task.route.agent}: ${inspection.task.title}`,
          }
        : item,
    );
    auxiliaryReturn.followups = [];
    auxiliaryReturn.evidence.push({
      kind: "command",
      summary: summarizeAcpxCommand(acpxResult),
    });
    if (acpxResult.sessionName) {
      auxiliaryReturn.evidence.push({
        kind: "artifact",
        summary: `ACPX sessionName: ${acpxResult.sessionName}`,
        reference: `.oma/artifacts/${inspection.task.id}.json`,
      });
    }
    const trustedSessionHistory = acpxResult.sessionHistory?.exitCode === 0
      ? acpxResult.sessionHistory.stdout
      : undefined;
    const captured = captureSchemaConfirmedAuxiliaryReturn({
      auxiliaryTaskId: inspection.task.id,
      runId,
      sessionHistory: trustedSessionHistory,
      stdout: acpxResult.stdout,
    });
    const mismatchEvidence = captureMismatchedAuxiliaryReturns({
      auxiliaryTaskId: inspection.task.id,
      runId,
      sessionHistory: trustedSessionHistory,
      stdout: acpxResult.stdout,
    }).map((mismatch) => ({
      kind: "note" as const,
      summary: `Ignored Auxiliary Task Return for ${mismatch.auxiliaryTaskId}; expected ${inspection.task.id}.`,
    }));
    const extracted = captured
      ? undefined
      : captureExtractedAuxiliaryFindings({
          runId,
          sessionHistory: trustedSessionHistory,
          stdout: acpxResult.stdout,
        });
    if (captured) {
      capturedAnswer = JSON.stringify(captured, null, 2);
    } else if (extracted) {
      capturedAnswer = extracted.capturedAnswer;
    }
    const acpxFailure = classifyAcpxFailure(acpxResult);
    if (acpxFailure) {
      auxiliaryReturn.status = "failed";
      auxiliaryReturn.verdict = "reject";
      auxiliaryReturn.findings = [];
      auxiliaryReturn.blockers.push(acpxFailure);
      auxiliaryReturn.coordinationAdvice = {
        recommendedAction: "fallback_to_host",
        reason: "ACPX execution failed; the Host Agent should inspect the artifact and decide the next step.",
      };
    } else {
      if (captured) {
        const transportEvidence = auxiliaryReturn.evidence;
        Object.assign(auxiliaryReturn, captured);
        auxiliaryReturn.evidence = [...captured.evidence, ...transportEvidence, ...mismatchEvidence];
      } else {
        auxiliaryReturn.evidence.push(...mismatchEvidence);
        if (extracted) {
          auxiliaryReturn.findings = extracted.findings;
          auxiliaryReturn.status = "completed";
          auxiliaryReturn.verdict = "revise";
          auxiliaryReturn.summary = "Auxiliary Task completed through ACPX Execute Mode with free-form captured findings.";
          auxiliaryReturn.followups = ["Review the captured free-form answer before integrating it into the Host Plan."];
          auxiliaryReturn.coordinationAdvice = {
            recommendedAction: "retry",
            reason: "ACPX produced Host-usable free-form content but no schema-confirmed Auxiliary Task Return.",
          };
        } else {
          auxiliaryReturn.status = "blocked";
          auxiliaryReturn.verdict = "revise";
          auxiliaryReturn.summary = "ACPX Execute Mode completed but OMA could not capture usable auxiliary result content.";
          auxiliaryReturn.findings = [];
          auxiliaryReturn.blockers.push("No usable auxiliary result content was captured from ACPX session history or stdout.");
          auxiliaryReturn.followups = ["Inspect the ACPX session or retry with an explicit Auxiliary Task Return schema request."];
          auxiliaryReturn.coordinationAdvice = {
            recommendedAction: "retry",
            reason: "ACPX transport completed without a schema-confirmed return or usable free-form findings.",
          };
        }
      }
    }
  }
  if (inspection.task.route.runtime !== "acpx") {
    const localOutputResult = writeLocalOutputs(inspection.task.localOutputs);
    if (!localOutputResult.ok) {
      auxiliaryReturn.status = "failed";
      auxiliaryReturn.verdict = "reject";
      auxiliaryReturn.findings = [];
      auxiliaryReturn.blockers.push(localOutputResult.error);
      auxiliaryReturn.coordinationAdvice = {
        recommendedAction: "fallback_to_host",
        reason: "OMA could not write declared local outputs.",
      };
    }
  }
  const artifactResult = writeArtifact(auxiliaryReturn, acpxResult, { capturedAnswer });
  if (!artifactResult.ok) {
    auxiliaryReturn.verdict = auxiliaryReturn.verdict === "reject" ? "reject" : "revise";
    auxiliaryReturn.blockers.push(`Artifact persistence failed for ${artifactResult.path}: ${artifactResult.error}`);
    auxiliaryReturn.evidence = auxiliaryReturn.evidence.filter(
      (item) => !(item.kind === "artifact" && item.reference === artifactResult.path),
    );
    auxiliaryReturn.coordinationAdvice = {
      recommendedAction: auxiliaryReturn.status === "failed" ? "fallback_to_host" : "retry",
      reason: "OMA captured auxiliary result content but could not persist the result artifact for later inspection.",
    };
  }
  if (shouldMarkTaskCompleted(auxiliaryReturn)) {
    markTaskCompleted(planPath, loaded.plan, inspection.task.id);
  }

  return {
    exitCode: 0,
    body: auxiliaryReturn,
  };
}

function sessionNameForRun(baseSessionName: string, runId: string): string {
  return `${baseSessionName}-${runId}`;
}

function shouldMarkTaskCompleted(auxiliaryReturn: AuxiliaryTaskReturn): boolean {
  return auxiliaryReturn.status === "completed"
    && auxiliaryReturn.verdict === "provisional_accept"
    && auxiliaryReturn.blockers.length === 0
    && auxiliaryReturn.coordinationAdvice.recommendedAction === "accept";
}

function markTaskCompleted(planPath: string, plan: OffloadPlan, taskId: string): void {
  const updatedPlan = {
    ...plan,
    tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, status: "completed" as const } : task)),
  };
  writeFileSync(planPath, `${JSON.stringify(updatedPlan, null, 2)}\n`);
}

function classifyAcpxFailure(result: CommandResult): string | undefined {
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0) {
    return result.stderr || result.stdout || "ACPX execution failed.";
  }
  if (/^\[tool\].*\(failed\)[\s\S]{0,1200}Permission confirmation required but no interactive handler is available/im.test(combinedOutput)) {
    return "ACPX reported a tool permission failure: Permission confirmation required but no interactive handler is available.";
  }
  if (/^\[tool\].*\(failed\)/im.test(combinedOutput)) {
    return "ACPX reported a failed tool call.";
  }
  return undefined;
}

function summarizeAcpxCommand(result: CommandResult & { command: string[]; sessionName?: string }): string {
  const command = result.command.includes("-s")
    ? `${result.command.slice(0, result.command.indexOf("-s") + 2).join(" ")} <prompt redacted>`
    : result.command.join(" ");
  const output = summarizeCommandOutput(result.stdout || result.stderr);
  return `ACPX ${command} exited ${result.exitCode}${output ? `: ${output}` : ""}`;
}

function summarizeCommandOutput(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) return "";
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, 8).join("\n").slice(0, 1200);
}

async function runAcpxTask(
  agent: string,
  sessionName: string,
  auxiliaryTaskId: string,
  runId: string,
  prompt: string,
  localOutputs: Array<{ path: string; content: string }> | undefined,
  timeoutSeconds: number | undefined,
  permissions: "read" | "edit",
  execute: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>,
): Promise<CommandResult & { command: string[]; sessionName: string; sessionShow?: CommandResult; sessionHistory?: CommandResult }> {
  const approvalFlag = permissions === "edit" ? "--approve-all" : "--approve-reads";
  const timeout = String(timeoutSeconds ?? 180);
  const ensureArgs = ["--cwd", process.cwd(), agent, "sessions", "ensure", "--name", sessionName];
  const ensureResult = await execute("acpx", ensureArgs, process.env);
  if (ensureResult.exitCode !== 0) {
    return {
      ...ensureResult,
      command: ["acpx", ...ensureArgs],
      sessionName,
    };
  }

  const promptArgs = [
    "--cwd",
    process.cwd(),
    approvalFlag,
    "--timeout",
    timeout,
    agent,
    "-s",
    sessionName,
    buildAcpxPrompt(prompt, auxiliaryTaskId, runId, localOutputs),
  ];
  const result = await execute("acpx", promptArgs, process.env);
  const sessionShow = await execute("acpx", ["--cwd", process.cwd(), agent, "sessions", "show", sessionName], process.env);
  const sessionHistory = await execute(
    "acpx",
    ["--cwd", process.cwd(), agent, "sessions", "history", sessionName, "--limit", "20"],
    process.env,
  );
  return {
    ...result,
    command: ["acpx", ...promptArgs],
    sessionName,
    sessionShow,
    sessionHistory,
  };
}

function buildAcpxPrompt(
  prompt: string,
  auxiliaryTaskId: string,
  runId: string,
  localOutputs: Array<{ path: string; content: string }> | undefined,
): string {
  const fileInstructions = (localOutputs ?? [])
    .map((output) => `Path: ${output.path}\nContent:\n${output.content}`)
    .join("\n---\n");

  const localOutputSection = localOutputs && localOutputs.length > 0
    ? `

Write exactly these workspace-relative files. Do not create unrelated files.

${fileInstructions}
`
    : "";

  return `${prompt}${localOutputSection}

OMA runId: ${runId}

At the end, return a schema-valid JSON object for OMA using this Auxiliary Task Return shape. The final JSON must include:
- "kind": "Auxiliary Task Return"
- "auxiliaryTaskId": ${JSON.stringify(auxiliaryTaskId)}
- "runId": ${JSON.stringify(runId)}
- "status": "completed" | "blocked" | "failed"
- "verdict": "provisional_accept" | "revise" | "reject"
- "hostPlanComplete": false
- "summary", "scope", "evidence", "blockers", "findings", "followups", and "coordinationAdvice"
`;
}

function writeLocalOutputs(outputs: Array<{ path: string; content: string }> | undefined): { ok: true } | { ok: false; error: string } {
  try {
    for (const output of outputs ?? []) {
      const outputPath = normalize(output.path);
      if (!isSafeLocalOutputPath(output.path)) {
        return { ok: false, error: `Refusing to write local output outside the workspace: ${output.path}` };
      }
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output.content);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeArtifact(
  auxiliaryReturn: AuxiliaryTaskReturn,
  acpxResult?: CommandResult & { command: string[]; sessionName?: string; sessionShow?: CommandResult; sessionHistory?: CommandResult },
  capture?: { capturedAnswer?: string },
): { ok: true; path: string } | { ok: false; path: string; error: string } {
  const artifactPath = join(".oma", "artifacts", `${auxiliaryReturn.auxiliaryTaskId}.json`);
  try {
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(
      artifactPath,
      `${JSON.stringify(
        {
          kind: acpxResult ? "ACPX Execution Artifact" : "Fake Local Execution Artifact",
          auxiliaryTaskId: auxiliaryReturn.auxiliaryTaskId,
          summary: auxiliaryReturn.summary,
          capturedAnswer: capture?.capturedAnswer,
          evidence: auxiliaryReturn.evidence,
          findings: auxiliaryReturn.findings,
          acpxResult,
          note: "This artifact keeps long execution detail outside the Host Agent conversation.",
        },
        null,
        2,
      )}\n`,
    );
    return { ok: true, path: artifactPath };
  } catch (error) {
    return { ok: false, path: artifactPath, error: error instanceof Error ? error.message : String(error) };
  }
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
