export type AuxiliaryTaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export interface ContextBudget {
  maxTokens: number;
  rationale: string;
}

export interface OffloadRoute {
  runtime: string;
  agent: string;
  role?: string;
  sessionName?: string;
  timeoutSeconds?: number;
}

export interface AuxiliaryTask {
  id: string;
  title: string;
  status: AuxiliaryTaskStatus;
  contextBudget: ContextBudget;
  route: OffloadRoute;
  prompt: string;
  expectedReturn?: string;
  readFiles?: string[];
  modifiedFiles?: string[];
  localOutputs?: Array<{
    path: string;
    content: string;
  }>;
}

export interface OffloadPlan {
  version: number;
  objective: string;
  tasks: AuxiliaryTask[];
}

export interface ApprovedAgentConfig {
  version: number;
  approvedAgents: Record<
    string,
    {
      approved: true;
      role: "quick" | "deep" | "visual";
      permissions: "read" | "edit";
    }
  >;
}

export type LoadOffloadPlanResult =
  | {
      status: "PLAN_LOADED";
      plan: OffloadPlan;
      planPath: string;
    }
  | {
      status: "NO_PLAN" | "INVALID_PLAN";
      summary: string;
      planPath: string;
      errors: string[];
    };

export type InspectOffloadPlanResult =
  | {
      status: "OFFLOAD_READY";
      summary: string;
      task: AuxiliaryTask;
    }
  | {
      status: "ALL_DONE";
      summary: string;
    };

export interface AuxiliaryTaskReturnSchema {
  kind: "Auxiliary Task Return Schema";
  requiredFields: string[];
  statusValues: string[];
  verdictValues: string[];
  statusSemantics: {
    completed: string;
  };
}

export interface OffloadProposal {
  kind: "Offload Proposal";
  status: "OFFLOAD_READY";
  executeMode: false;
  planObjective: string;
  auxiliaryTask: {
    id: string;
    title: string;
    status: AuxiliaryTaskStatus;
    contextBudget: ContextBudget;
  };
  selectedRoute: OffloadRoute;
  payload: {
    prompt: string;
    taskId: string;
    mode: "proposal";
  };
  expectedReturnSchema: AuxiliaryTaskReturnSchema;
  coordinationAdvice: {
    recommendedAction: "execute" | "revise" | "fallback_to_host";
    reason: string;
  };
}

export interface OffloadBatchProposal {
  kind: "Offload Batch Proposal";
  status: "OFFLOAD_BATCH_READY";
  executeMode: false;
  planObjective: string;
  requestedTaskIds: string[];
  parallelism: number;
  tasks: Array<{
    id: string;
    title: string;
    status: AuxiliaryTaskStatus;
    contextBudget: ContextBudget;
    selectedRoute: OffloadRoute;
    payload: {
      prompt: string;
      taskId: string;
      mode: "proposal";
    };
  }>;
  expectedReturnSchema: AuxiliaryTaskReturnSchema;
  warnings: string[];
  coordinationAdvice: {
    recommendedAction: "execute" | "revise" | "fallback_to_host";
    reason: string;
  };
}

export interface Evidence {
  kind: "note" | "artifact" | "command" | "file";
  summary: string;
  reference?: string;
}

export interface AuxiliaryTaskReturn {
  kind: "Auxiliary Task Return";
  status: "completed" | "blocked" | "failed";
  verdict: "provisional_accept" | "revise" | "reject";
  hostPlanComplete: false;
  auxiliaryTaskId: string;
  runId: string;
  summary: string;
  scope: {
    readFiles: string[];
    modifiedFiles: string[];
    artifactRefs: string[];
  };
  evidence: Evidence[];
  blockers: string[];
  findings: string[];
  followups: string[];
  coordinationAdvice: {
    recommendedAction: "accept" | "retry" | "ask_user" | "spawn_followup" | "fallback_to_host";
    reason: string;
  };
}

export interface AuxiliaryTaskBatchReturn {
  kind: "Auxiliary Task Batch Return";
  status: "completed" | "partial" | "failed";
  hostPlanComplete: false;
  batchRunId: string;
  requestedTaskIds: string[];
  parallelism: number;
  artifactRef: string;
  results: Array<{
    auxiliaryTaskId: string;
    status: AuxiliaryTaskReturn["status"];
    verdict: AuxiliaryTaskReturn["verdict"];
    summary: string;
    artifact: string;
    coordinationAdvice: AuxiliaryTaskReturn["coordinationAdvice"];
    blockers: string[];
    return?: AuxiliaryTaskReturn;
  }>;
  warnings: string[];
  blockers: string[];
  coordinationAdvice: {
    recommendedAction: "accept" | "retry" | "ask_user" | "spawn_followup" | "fallback_to_host";
    reason: string;
  };
}
