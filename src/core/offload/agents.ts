import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { ApprovedAgentConfig } from "./types";

export const PROJECT_APPROVED_AGENTS_PATH = ".oma/config/agents.json";
export const APPROVED_AGENT_ROLES = ["quick", "deep", "visual"] as const;

export function defaultApprovedAgentsPath(): string {
  return join(process.env.OMA_HOME ?? join(homedir(), ".oma"), "config", "agents.json");
}

export type LoadApprovedAgentsResult =
  | {
      status: "APPROVED_AGENTS_LOADED";
      config: ApprovedAgentConfig;
      configPath: string;
      scope: "project" | "global" | "explicit";
    }
  | {
      status: "NO_AGENT_ONBOARDING" | "INVALID_APPROVED_AGENTS";
      summary: string;
      configPath: string;
      checkedPaths?: string[];
      errors: string[];
    };

export function loadApprovedAgents(configPath?: string): LoadApprovedAgentsResult {
  if (configPath) {
    return loadApprovedAgentsFromPath(resolve(configPath), "explicit");
  }

  const candidates = [
    { path: resolve(PROJECT_APPROVED_AGENTS_PATH), scope: "project" as const },
    { path: defaultApprovedAgentsPath(), scope: "global" as const },
  ];
  const existing = candidates.find((candidate) => existsSync(candidate.path));

  if (existing) {
    return loadApprovedAgentsFromPath(existing.path, existing.scope);
  }

  return {
    status: "NO_AGENT_ONBOARDING",
    configPath: defaultApprovedAgentsPath(),
    checkedPaths: candidates.map((candidate) => candidate.path),
    summary:
      "Real ACPX execution requires Approved Agents from the global OMA config, or a project override at .oma/config/agents.json. Run oma acpx init first.",
    errors: [`Missing Approved Agents config. Checked: ${candidates.map((candidate) => candidate.path).join(", ")}`],
  };
}

function loadApprovedAgentsFromPath(
  resolvedPath: string,
  scope: "project" | "global" | "explicit",
): LoadApprovedAgentsResult {
  try {
    const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
    const errors = validateApprovedAgents(parsed);

    if (errors.length > 0) {
      return {
        status: "INVALID_APPROVED_AGENTS",
        configPath: resolvedPath,
        checkedPaths: [resolvedPath],
        summary: "The Approved Agents config is not valid.",
        errors,
      };
    }

    return {
      status: "APPROVED_AGENTS_LOADED",
      configPath: resolvedPath,
      scope,
      config: parsed as ApprovedAgentConfig,
    };
  } catch (error) {
    return {
      status: "INVALID_APPROVED_AGENTS",
      configPath: resolvedPath,
      checkedPaths: [resolvedPath],
      summary: "The Approved Agents config could not be parsed.",
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export type MatchApprovedAgentResult =
  | {
      status: "APPROVED_AGENT_MATCH";
      agent: string;
      role: string;
      permissions: "read" | "edit";
    }
  | {
      status: "NO_APPROVED_AGENT";
      summary: string;
      agent: string;
      role: string;
      errors: string[];
    };

export function matchApprovedAgent(
  config: ApprovedAgentConfig,
  agentName: string,
  role = "deep",
): MatchApprovedAgentResult {
  const approvedAgent = config.approvedAgents[agentName];

  if (!approvedAgent || !approvedAgent.approved || approvedAgent.role !== role) {
    return {
      status: "NO_APPROVED_AGENT",
      agent: agentName,
      role,
      summary: `No Approved Agent matches agent "${agentName}" for Auxiliary Task role "${role}". Run oma acpx init to approve a matching agent.`,
      errors: [`No approved agent named ${agentName} has role ${role}.`],
    };
  }

  return {
    status: "APPROVED_AGENT_MATCH",
    agent: agentName,
    role,
    permissions: approvedAgent.permissions,
  };
}

function validateApprovedAgents(value: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return ["Approved Agents config must be a JSON object."];
  }

  if (value.version !== 1) {
    errors.push("Approved Agents config version must be 1.");
  }

  if (!isRecord(value.approvedAgents)) {
    errors.push("Approved Agents config approvedAgents must be an object.");
    return errors;
  }

  for (const [agentName, agent] of Object.entries(value.approvedAgents)) {
    if (!isRecord(agent)) {
      errors.push(`Approved Agent ${agentName} must be an object.`);
      continue;
    }
    if (agent.approved !== true) {
      errors.push(`Approved Agent ${agentName} approved must be true.`);
    }
    if (!APPROVED_AGENT_ROLES.includes(String(agent.role) as (typeof APPROVED_AGENT_ROLES)[number])) {
      errors.push(`Approved Agent ${agentName} role must be one of: ${APPROVED_AGENT_ROLES.join(", ")}.`);
    }
    if (!["read", "edit"].includes(String(agent.permissions))) {
      errors.push(`Approved Agent ${agentName} permissions must be read or edit.`);
    }
  }

  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
