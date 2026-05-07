import type { AuxiliaryTask, AuxiliaryTaskReturn, OffloadPlan } from "./types";

export function buildAuxiliaryTaskReturn(
  plan: Pick<OffloadPlan, "objective">,
  task: AuxiliaryTask,
): AuxiliaryTaskReturn {
  return {
    kind: "Auxiliary Task Return",
    status: "completed",
    verdict: "provisional_accept",
    hostPlanComplete: false,
    auxiliaryTaskId: task.id,
    summary:
      "Auxiliary Task completed through fake/local Execute Mode. Real ACPX spawning is intentionally out of scope for this rebuild.",
    scope: {
      readFiles: task.readFiles ?? [],
      modifiedFiles: task.modifiedFiles ?? [],
      artifactRefs: [`.oma/artifacts/${task.id}.json`],
    },
    evidence: [
      {
        kind: "note",
        summary: `Fake/local execution validated the Auxiliary Task Return shape for: ${task.title}`,
      },
      {
        kind: "artifact",
        summary: "Long-form execution details should live outside active Host Agent context.",
        reference: `.oma/artifacts/${task.id}.json`,
      },
    ],
    blockers: [],
    findings: [`Offload Plan objective preserved for Host Agent integration: ${plan.objective}`],
    followups: ["Replace fake/local execution with ACPX transport behind the same Execute Mode contract."],
    coordinationAdvice: {
      recommendedAction: "accept",
      reason:
        "The Host Agent may integrate this auxiliary result if the evidence is sufficient; OMA is not claiming Host Plan completion.",
    },
  };
}
