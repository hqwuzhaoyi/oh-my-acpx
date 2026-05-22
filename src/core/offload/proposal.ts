import { describeAuxiliaryTaskReturnSchema } from "./schema";
import type { AuxiliaryTask, OffloadBatchProposal, OffloadPlan, OffloadProposal } from "./types";

export function buildOffloadProposal(
  plan: OffloadPlan,
  task: AuxiliaryTask,
): OffloadProposal {
  return {
    kind: "Offload Proposal",
    status: "OFFLOAD_READY",
    executeMode: false,
    planObjective: plan.objective,
    auxiliaryTask: {
      id: task.id,
      title: task.title,
      status: task.status,
      contextBudget: task.contextBudget,
    },
    selectedRoute: task.route,
    payload: {
      prompt: task.prompt,
      taskId: task.id,
      mode: "proposal",
    },
    expectedReturnSchema: describeAuxiliaryTaskReturnSchema(),
    coordinationAdvice: {
      recommendedAction: "execute",
      reason: "Review this Offload Proposal, then rerun with --execute if the Host Agent accepts the delegation.",
    },
  };
}

export function buildOffloadBatchProposal(
  plan: OffloadPlan,
  tasks: AuxiliaryTask[],
  parallelism: number,
  warnings: string[] = [],
): OffloadBatchProposal {
  return {
    kind: "Offload Batch Proposal",
    status: "OFFLOAD_BATCH_READY",
    executeMode: false,
    planObjective: plan.objective,
    requestedTaskIds: tasks.map((task) => task.id),
    parallelism,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      contextBudget: task.contextBudget,
      selectedRoute: task.route,
      payload: {
        prompt: task.prompt,
        taskId: task.id,
        mode: "proposal",
      },
    })),
    expectedReturnSchema: describeAuxiliaryTaskReturnSchema(),
    warnings,
    coordinationAdvice: {
      recommendedAction: "execute",
      reason: "Review this Offload Batch Proposal, then rerun with --execute if the Host Agent accepts the batch delegation.",
    },
  };
}
