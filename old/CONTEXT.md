# Oh My ACPX Context

Oh My ACPX (OMA) is a context-saving auxiliary orchestration layer for host agents. It exists to offload isolated supporting work to ACPX without moving the whole agent workflow into ACPX.

## Language

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

**Offload Story**:
A story or sub-story inside an **Offload Plan** that **OMA** may route, spawn, diagnose, and report back on.
_Avoid_: Main story owner, final completion decision

**Self-schedule**:
OMA's internal selection of the next **Offload Story**, retry, fallback, or stop state within an **Offload Plan**.
_Avoid_: Host project scheduler, main workflow owner

**Offload Proposal**:
A structured recommendation from **OMA** describing the next **Auxiliary Task**, selected route, context budget, execution payload, and expected result shape without starting ACPX execution.
_Avoid_: Execution result, completed task

**Execute Mode**:
The explicit mode where **OMA** is allowed to spawn an **Auxiliary Task** through **ACPX** and monitor/fallback the result.
_Avoid_: Default run, proposal mode

**Auxiliary Task Return**:
The structured result contract returned by **OMA** after proposing or executing an **Auxiliary Task**, including status, verdict, summary, scope, evidence, blockers, findings, followups, and host coordination advice.
_Avoid_: Free-form worker summary, final host answer

**Evidence**:
A structured proof item that lets the **Host Agent** decide whether an **Auxiliary Task Return** can be trusted and integrated.
_Avoid_: Vague confidence statement, unverified claim

## Relationships

- A **Host Agent** may call **OMA** when an **Auxiliary Task** can save context.
- **OMA** may use **ACPX** to execute an **Auxiliary Task** through a suitable agent/runtime.
- **ACPX** returns execution output to **OMA**; **OMA** returns result, evidence, or blocker back to the **Host Agent**.
- The **Host Agent** remains responsible for **Main Context Decisions** and final integration.
- An **Auxiliary Task** is suitable for **OMA** only when its input can be packaged and its output can be verified without the host's full conversation context.
- **Main Context Decisions** must stay with the **Host Agent** and should not be delegated to **ACPX**.
- The **Host Agent** owns the **Host Plan**.
- **OMA** consumes an **Offload Plan**, not the full **Host Plan**.
- An **Offload Story** can be advanced by **OMA**, but final project/story completion remains a **Host Agent** decision.
- **Self-schedule** schedules the next offload step inside an **Offload Plan**; it does not schedule the **Host Plan**.
- **Self-schedule** terminates by returning result, evidence, or blocker to the **Host Agent**.
- `oax run` produces an **Offload Proposal** by default.
- `oax run --execute` enters **Execute Mode** and may spawn work through **ACPX**.
- **OMA** returns an **Auxiliary Task Return** to the **Host Agent** rather than a free-form worker summary.
- An **Auxiliary Task Return** separates runtime `status` from adoption `verdict`.
- `completed` in an **Auxiliary Task Return** only means the auxiliary task completed; it does not mean the **Host Plan** is complete.
- **Evidence** must be structured enough for the **Host Agent** to evaluate and integrate the result with low context overhead.

## Example dialogue

> **Dev:** "Should `oax run` take over the whole implementation once a plan exists?"
> **Domain expert:** "No. The **Host Agent** keeps the main context and owns the **Host Plan**. **OMA** only consumes an **Offload Plan** made of **Auxiliary Tasks** when doing so saves context."

## Flagged ambiguities

- "Execution runtime" was previously used too broadly. Resolved: **OMA** is not the owner of all execution; it is a context-saving sidecar for offloading auxiliary work.
- "Task" was previously overloaded. Resolved: **Auxiliary Tasks** can be offloaded; **Main Context Decisions** stay with the **Host Agent**.
- "Plan" was previously too broad. Resolved: the **Host Agent** owns the **Host Plan**; **OMA** consumes an **Offload Plan** only.
- "Self-schedule" was previously ambiguous. Resolved: it only schedules the next offload step, not the host project's next decision.
- "Run" was previously ambiguous. Resolved: default `oax run` proposes offload; only explicit **Execute Mode** may call **ACPX**.
- "Return" was previously underspecified. Resolved: **OMA** should return a unified **Auxiliary Task Return** with structured **Evidence**, not a free-form worker message.
