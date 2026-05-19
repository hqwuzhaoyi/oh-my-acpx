import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";

import type {
  AuxiliaryTask,
  InspectOffloadPlanResult,
  LoadOffloadPlanResult,
  OffloadPlan,
} from "./types";

export const DEFAULT_OFFLOAD_PLAN_PATH = ".oma/plans/plan.json";

export function loadOffloadPlan(planPath = DEFAULT_OFFLOAD_PLAN_PATH): LoadOffloadPlanResult {
  const resolvedPath = resolve(planPath);

  if (!existsSync(resolvedPath)) {
    return {
      status: "NO_PLAN",
      planPath: resolvedPath,
      summary: "No Offload Plan exists at the requested path.",
      errors: [`Missing Offload Plan: ${resolvedPath}`],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
    const errors = validateOffloadPlan(parsed);

    if (errors.length > 0) {
      return {
        status: "INVALID_PLAN",
        planPath: resolvedPath,
        summary: "The Offload Plan is not valid.",
        errors,
      };
    }

    return {
      status: "PLAN_LOADED",
      planPath: resolvedPath,
      plan: parsed as OffloadPlan,
    };
  } catch (error) {
    return {
      status: "INVALID_PLAN",
      planPath: resolvedPath,
      summary: "The Offload Plan could not be parsed.",
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function inspectOffloadPlan(plan: OffloadPlan): InspectOffloadPlanResult {
  const task = plan.tasks.find((candidate) => candidate.status === "pending");

  if (!task) {
    return {
      status: "ALL_DONE",
      summary: "No pending Auxiliary Tasks remain in the Offload Plan.",
    };
  }

  return {
    status: "OFFLOAD_READY",
    summary: `Next Auxiliary Task is ${task.id}.`,
    task,
  };
}

function validateOffloadPlan(value: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return ["Offload Plan must be a JSON object."];
  }

  if (typeof value.version !== "number") {
    errors.push("Offload Plan version must be a number.");
  }

  if (typeof value.objective !== "string" || value.objective.length === 0) {
    errors.push("Offload Plan objective must be a non-empty string.");
  }

  if (!Array.isArray(value.tasks)) {
    errors.push("Offload Plan tasks must be an array.");
    return errors;
  }

  value.tasks.forEach((task, index) => {
    errors.push(...validateAuxiliaryTask(task, index));
  });

  return errors;
}

function validateAuxiliaryTask(value: unknown, index: number): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return [`Auxiliary Task ${index} must be an object.`];
  }

  const task = value as Partial<AuxiliaryTask>;
  if (typeof task.id !== "string" || task.id.length === 0) {
    errors.push(`Auxiliary Task ${index} id must be a non-empty string.`);
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(task.id)) {
    errors.push(`Auxiliary Task ${index} id must be a safe single path segment.`);
  }
  if (typeof task.title !== "string" || task.title.length === 0) {
    errors.push(`Auxiliary Task ${index} title must be a non-empty string.`);
  }
  if (!["pending", "in_progress", "completed", "blocked"].includes(String(task.status))) {
    errors.push(`Auxiliary Task ${index} status is invalid.`);
  }
  if (!isRecord(task.contextBudget) || typeof task.contextBudget.maxTokens !== "number") {
    errors.push(`Auxiliary Task ${index} contextBudget.maxTokens must be a number.`);
  }
  if (!isRecord(task.contextBudget) || typeof task.contextBudget.rationale !== "string") {
    errors.push(`Auxiliary Task ${index} contextBudget.rationale must be a string.`);
  }
  if (!isRecord(task.route) || typeof task.route.runtime !== "string") {
    errors.push(`Auxiliary Task ${index} route.runtime must be a string.`);
  }
  if (!isRecord(task.route) || typeof task.route.agent !== "string") {
    errors.push(`Auxiliary Task ${index} route.agent must be a string.`);
  }
  if (
    isRecord(task.route)
    && task.route.timeoutSeconds !== undefined
    && (!Number.isFinite(task.route.timeoutSeconds) || task.route.timeoutSeconds <= 0)
  ) {
    errors.push(`Auxiliary Task ${index} route.timeoutSeconds must be a positive number when provided.`);
  }
  if (typeof task.prompt !== "string" || task.prompt.length === 0) {
    errors.push(`Auxiliary Task ${index} prompt must be a non-empty string.`);
  }
  if (task.localOutputs !== undefined) {
    if (!Array.isArray(task.localOutputs)) {
      errors.push(`Auxiliary Task ${index} localOutputs must be an array.`);
    } else {
      task.localOutputs.forEach((output, outputIndex) => {
        if (!isRecord(output)) {
          errors.push(`Auxiliary Task ${index} localOutputs.${outputIndex} must be an object.`);
          return;
        }
        if (typeof output.path !== "string" || output.path.length === 0) {
          errors.push(`Auxiliary Task ${index} localOutputs.${outputIndex}.path must be a non-empty string.`);
        } else if (!isSafeLocalOutputPath(output.path)) {
          errors.push(`Auxiliary Task ${index} localOutputs.${outputIndex}.path must stay inside the workspace.`);
        }
        if (typeof output.content !== "string") {
          errors.push(`Auxiliary Task ${index} localOutputs.${outputIndex}.content must be a string.`);
        }
      });
    }
  }

  return errors;
}

export function isSafeLocalOutputPath(path: string): boolean {
  const normalized = normalize(path);
  return !isAbsolute(normalized) && normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
