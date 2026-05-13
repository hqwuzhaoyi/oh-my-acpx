#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";

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
      return installCommand(rest, options.executeCommand ?? executeCommand);
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
  const declaredAdapters = parseAcpxAgents(detected.stdout || detected.stderr);

  return {
    exitCode: 0,
    body: {
      status: "AGENT_ONBOARDING_READY",
      declaredAdapters,
      availableRoles: ["quick", "deep", "visual"],
      availablePermissions: ["read", "edit"],
      availableScopes: ["project", "global"],
      recommendedRoles: Object.fromEntries(declaredAdapters.map((agent) => [agent, recommendedRoleForAgent(agent)])),
      recommendedApprovalCommand: "oma acpx approve --agent codex --role deep --permissions edit",
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
  const scope = parsed.scope ?? "global";

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
  const approvedAgents = {
    ...existingApprovedAgents,
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

function loadExistingApprovedAgentsForWrite(configPath: string): ApprovedAgentConfig["approvedAgents"] {
  if (!existsSync(configPath)) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as ApprovedAgentConfig;
  return parsed.approvedAgents ?? {};
}

function recommendedRoleForAgent(agent: string): "quick" | "deep" | "visual" {
  if (["cursor"].includes(agent)) {
    return "visual";
  }
  if (["pi", "qwen", "kimi", "iflow"].includes(agent)) {
    return "quick";
  }
  return "deep";
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
  _args: string[],
  execute: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    stdio?: "inherit" | "pipe",
  ) => Promise<CommandResult>,
): Promise<CliResult> {
  const source = resolve(__dirname, "..", "..", "..", "skills");
  const commandArgs = ["skills@latest", "add", source, "--full-depth", "-f"];
  const commandResult = await execute("npx", commandArgs, cleanNestedNpxEnv(process.env), "inherit");

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

  const acpxResult =
    inspection.task.route.runtime === "acpx" && acpxMatch?.status === "APPROVED_AGENT_MATCH"
      ? await runAcpxTask(
          inspection.task.route.agent,
          inspection.task.route.sessionName ?? `oma-${inspection.task.id}`,
          inspection.task.id,
          inspection.task.prompt,
          inspection.task.localOutputs,
          inspection.task.route.timeoutSeconds,
          acpxMatch.permissions,
          execute,
        )
      : undefined;
  const auxiliaryReturn = buildAuxiliaryTaskReturn(loaded.plan, inspection.task);
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
      summary: `ACPX ${acpxResult.command.join(" ")} exited ${acpxResult.exitCode}: ${acpxResult.stdout || acpxResult.stderr}`,
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
      sessionHistory: trustedSessionHistory,
      stdout: acpxResult.stdout,
    });
    const mismatchEvidence = captureMismatchedAuxiliaryReturns({
      auxiliaryTaskId: inspection.task.id,
      sessionHistory: trustedSessionHistory,
      stdout: acpxResult.stdout,
    }).map((mismatch) => ({
      kind: "note" as const,
      summary: `Ignored Auxiliary Task Return for ${mismatch.auxiliaryTaskId}; expected ${inspection.task.id}.`,
    }));
    auxiliaryReturn.evidence.push(...mismatchEvidence);
    const extracted = captured
      ? undefined
      : captureExtractedAuxiliaryFindings({
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
        Object.assign(auxiliaryReturn, captured);
        auxiliaryReturn.evidence = [...captured.evidence, ...mismatchEvidence];
      } else {
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
    writeLocalOutputs(inspection.task.localOutputs);
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
  if (auxiliaryReturn.status === "completed") {
    markTaskCompleted(planPath, loaded.plan, inspection.task.id);
  }

  return {
    exitCode: 0,
    body: auxiliaryReturn,
  };
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
  if (/Permission confirmation required but no interactive handler is available/i.test(combinedOutput)) {
    return "ACPX reported a tool permission failure: Permission confirmation required but no interactive handler is available.";
  }
  return undefined;
}

async function runAcpxTask(
  agent: string,
  sessionName: string,
  auxiliaryTaskId: string,
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
    buildAcpxPrompt(prompt, auxiliaryTaskId, localOutputs),
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

function buildAcpxPrompt(prompt: string, auxiliaryTaskId: string, localOutputs: Array<{ path: string; content: string }> | undefined): string {
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

At the end, return a schema-valid JSON object for OMA using this Auxiliary Task Return shape. The final JSON must include:
- "kind": "Auxiliary Task Return"
- "auxiliaryTaskId": ${JSON.stringify(auxiliaryTaskId)}
- "status": "completed" | "blocked" | "failed"
- "verdict": "provisional_accept" | "revise" | "reject"
- "hostPlanComplete": false
- "summary", "scope", "evidence", "blockers", "findings", "followups", and "coordinationAdvice"
`;
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
