import type { AuxiliaryTaskReturnSchema } from "./types";

export function describeAuxiliaryTaskReturnSchema(): AuxiliaryTaskReturnSchema {
  return {
    kind: "Auxiliary Task Return Schema",
    requiredFields: [
      "kind",
      "status",
      "verdict",
      "hostPlanComplete",
      "auxiliaryTaskId",
      "runId",
      "summary",
      "scope",
      "evidence",
      "blockers",
      "findings",
      "followups",
      "coordinationAdvice",
    ],
    statusValues: ["completed", "blocked", "failed"],
    verdictValues: ["provisional_accept", "revise", "reject"],
    statusSemantics: {
      completed:
        "The Auxiliary Task completed; this does not mean the Host Plan is complete.",
    },
  };
}
