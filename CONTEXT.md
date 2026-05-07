# OMA Context

OMA is a context-saving auxiliary orchestration sidecar for host agents. It exists to offload isolated supporting work to ACPX without moving the whole workflow into ACPX.

## Naming

- **OMA** is the project and product name.
- **`oma`** is the CLI command used to operate OMA.
- **`oma`** is the package name.

## Language

**oma**:
The CLI command for operating **OMA**.
_Avoid_: product name, domain model name

**Host Agent**:
The agent that owns the main task context, decision loop, and final integration of results.
_Avoid_: Main runtime, ACPX controller

**OMA**:
A context-saving sidecar that routes isolated auxiliary tasks from the **Host Agent** to ACPX-backed execution and returns structured results.
_Avoid_: ACPX replacement, full execution runtime, oh-my-claudecode clone

**ACPX**:
The lower-level headless agent transport used by **OMA** for sessions, queued prompts, structured output, cancellation, history, and agent adapters.
_Avoid_: Workflow brain, planner, story owner

**Auxiliary Task**:
A bounded, packageable, verifiable task that can be offloaded away from the **Host Agent** because it has low dependency on the host's full conversation context.
_Avoid_: Main task, whole workflow, primary implementation thread

**Main Context Decision**:
A decision that depends on the **Host Agent**'s full conversation context, user intent, cross-task trade-offs, or final integration responsibility.
_Avoid_: Auxiliary task, delegated decision

**Host Plan**:
The main plan owned by the **Host Agent**, including user intent, trade-offs, story decomposition, and final completion decisions.
_Avoid_: OMA plan, ACPX plan

**Offload Plan**:
An OMA-readable execution slice containing **Auxiliary Tasks** that the **Host Agent** has chosen to delegate.
_Avoid_: Single source of truth, full project plan

**Offload Proposal**:
A structured recommendation from **OMA** describing the next **Auxiliary Task**, selected route, context budget, execution payload, and expected result shape without starting ACPX execution.
_Avoid_: Execution result, completed task

**Execute Mode**:
The explicit mode where **OMA** is allowed to spawn an **Auxiliary Task** through **ACPX** and monitor/fallback the result.
_Avoid_: Default run, proposal mode

**Auxiliary Task Return**:
The structured result contract returned by **OMA** after executing an **Auxiliary Task**, including status, verdict, summary, scope, evidence, blockers, findings, followups, and host coordination advice.
_Avoid_: Free-form worker summary, final host answer

**Evidence**:
A structured proof item that lets the **Host Agent** decide whether an **Auxiliary Task Return** can be trusted and integrated.
_Avoid_: Vague confidence statement, unverified claim

**Companion Capability**:
A separately bounded tool or package distributed with **OMA** to support ACPX workflows without becoming part of OMA's core offload decision loop.
_Avoid_: Core runtime, auxiliary task, execute mode

**OMA Skill**:
A skill shipped under OMA's `skills/` directory for installation into an agent skill registry.
_Avoid_: Auxiliary Task, Companion Capability, runtime plugin

**ACPX Session Operator Console**:
A **Companion Capability** that lets operators inspect, resume, and interact with ACPX sessions created outside or alongside OMA.
_Avoid_: OMA UI, Host Agent replacement, workflow brain

## Relationships

- The **Host Agent** owns the **Host Plan** and all **Main Context Decisions**.
- **OMA** consumes an **Offload Plan**, not the full **Host Plan**.
- `oma run` produces an **Offload Proposal** by default.
- `oma run --execute` enters **Execute Mode** and may call **ACPX**.
- **OMA** returns an **Auxiliary Task Return** to the **Host Agent**.
- `completed` in an **Auxiliary Task Return** only means the auxiliary task completed; it does not mean the **Host Plan** is complete.
- `oma install` starts the external `skills` installer for all **OMA Skills**; it does not read an **Offload Plan** or enter **Execute Mode**.
- A **Companion Capability** may improve observation or operation around ACPX, but it does not own the **Host Plan** or replace the **Host Agent**.
- `acpx-tui` is the current **ACPX Session Operator Console** and lives outside OMA's TypeScript core.

## Example dialogue

> **Dev:** "Should OMA take over the whole implementation once a plan exists?"
> **Domain expert:** "No. The **Host Agent** keeps the main context and owns the **Host Plan**. **OMA** only consumes an **Offload Plan** made of **Auxiliary Tasks** when doing so saves context."

## Flagged ambiguities

- "Execution runtime" was too broad. Resolved: **OMA** is not the owner of all execution; it is a context-saving sidecar.
- "Plan" was too broad. Resolved: the **Host Agent** owns the **Host Plan**; **OMA** consumes an **Offload Plan** only.
- "Run" was ambiguous. Resolved: default `oma run` proposes offload; only **Execute Mode** may call **ACPX**.
- "Sub-capability" was too broad. Resolved: `acpx-tui` is a **Companion Capability**, specifically an **ACPX Session Operator Console**, not an **Auxiliary Task** or OMA core runtime.
- "Install" was ambiguous. Resolved: `oma install` installs **OMA Skills** into an agent skill registry; it is not **Execute Mode** and does not spawn **ACPX**.
