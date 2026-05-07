import { describeAuxiliaryTaskReturnSchema } from "./schema";
import type { AuxiliaryTask, OffloadPlan, OffloadProposal } from "./types";

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
