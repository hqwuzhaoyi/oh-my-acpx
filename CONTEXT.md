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

**ACPX Transport Completion**:
The state where an ACPX command exits successfully after delivering or observing a prompt session, without proving the **Auxiliary Task** produced an adoptable result.
_Avoid_: Auxiliary task completion, accepted result

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

**Auxiliary Return Capture**:
The process where **OMA** captures Host-usable task content from ACPX stdout, session history, or a schema-valid auxiliary agent response after **Execute Mode**.
_Avoid_: Artifact write, transport success, raw transcript dump

**Auxiliary Result Inspection**:
The OMA CLI capability that lets the **Host Agent** retrieve the complete captured auxiliary content and evidence for a task without manually browsing artifact files.
_Avoid_: Manual artifact spelunking, transcript hidden behind path-only references

**Result Trust Boundary**:
The OMA rule that captured auxiliary content must be labelled by confidence level before the **Host Agent** decides whether to integrate it.
_Avoid_: Treating every ACPX completion as accepted work, silent trust upgrade

**Hard Execution Failure**:
An ACPX execution failure that invalidates captured result trust, such as session creation failure, non-zero prompt exit, or explicit permission/tool execution failure.
_Avoid_: Missing artifact, history retrieval gap, weak evidence

**Adoptable Auxiliary Result**:
An **Auxiliary Task Return** whose status, verdict, evidence, and findings are sufficient for the **Host Agent** to decide whether to integrate the auxiliary work.
_Avoid_: Transport success, raw session transcript

**Schema-Confirmed Auxiliary Result**:
An **Auxiliary Task Return** emitted by an auxiliary agent and validated against OMA's return contract, allowing **OMA** to report `verdict=provisional_accept`.
_Avoid_: Free-form findings, transcript summary

**Extracted Auxiliary Findings**:
Useful findings derived from an auxiliary agent's final free-form answer when no valid **Schema-Confirmed Auxiliary Result** is present.
_Avoid_: Provisional accept result, raw transcript

**Evidence**:
A structured proof item that lets the **Host Agent** decide whether an **Auxiliary Task Return** can be trusted and integrated.
_Avoid_: Vague confidence statement, unverified claim

**Approved Agent**:
An ACPX-backed agent that the user has explicitly allowed OMA to use for specific auxiliary roles through `oma acpx init`.
_Avoid_: Declared agent, merely configured agent

**oma acpx init**:
The first-use onboarding skill that confirms and persists **Approved Agents** for the current project.
_Avoid_: Automatic ACPX detection, every-run confirmation

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
- `oma run --execute` enters **Execute Mode** and may call **ACPX** for `acpx` routes.
- ACPX-backed **Execute Mode** should request a schema-valid **Auxiliary Task Return** in the delegated prompt, but **OMA** must still perform **Auxiliary Return Capture** when the auxiliary agent responds free-form.
- **ACPX Transport Completion** may provide **Evidence**, but it is not by itself an **Adoptable Auxiliary Result**.
- **Auxiliary Return Capture** is required after ACPX-backed **Execute Mode** and is independent of whether a long artifact file was written successfully.
- **Auxiliary Return Capture** prefers schema-valid session history, then schema-valid stdout, then free-form session history, then free-form stdout.
- **Auxiliary Result Inspection** must make the full captured content retrievable by CLI even when the Host-facing **Auxiliary Task Return** only includes concise findings.
- **Auxiliary Result Inspection** should use the **Auxiliary Task** identity as the primary lookup key instead of requiring artifact file paths.
- **Auxiliary Result Inspection** should default to the complete captured answer content, with raw transport logs available only through an explicit full-detail option.
- **Auxiliary Result Inspection** may limit very large terminal output, but truncation must be explicit and provide a path to retrieve or write the complete captured answer.
- **Extracted Auxiliary Findings** should preserve both concise Host-facing findings and the complete captured answer for later **Auxiliary Result Inspection**.
- The **Result Trust Boundary** separates transport success, captured free-form findings, schema-confirmed returns, and Host adoption decisions.
- A **Schema-Confirmed Auxiliary Result** may be captured from a fenced JSON block or embedded JSON object, but only if the complete object validates against OMA's return contract.
- A captured **Schema-Confirmed Auxiliary Result** must match the active **Auxiliary Task** identity; mismatched task identity is evidence, not an adoptable return.
- When multiple schema-valid returns are present, **Auxiliary Return Capture** uses the last one that matches the active **Auxiliary Task** identity.
- A **Hard Execution Failure** overrides captured schema or free-form content and should return a failed/rejected **Auxiliary Task Return**.
- A **Schema-Confirmed Auxiliary Result** may produce `verdict=provisional_accept`.
- **Extracted Auxiliary Findings** produce `status=completed` with `verdict=revise` when ACPX produced Host-usable content but no schema-confirmed return.
- Missing requested artifact files do not erase captured **Extracted Auxiliary Findings**; they should be surfaced as evidence gaps or followups.
- Artifact persistence failure must not erase captured content, but it prevents `verdict=provisional_accept` because **Auxiliary Result Inspection** may not be able to retrieve the full evidence later.
- **OMA** returns an **Auxiliary Task Return** to the **Host Agent**.
- `completed` in an **Auxiliary Task Return** only means the auxiliary task completed; it does not mean the **Host Plan** is complete.
- `oma install` starts the external `skills` installer for all **OMA Skills**; it does not read an **Offload Plan** or enter **Execute Mode**.
- A **Companion Capability** may improve observation or operation around ACPX, but it does not own the **Host Plan** or replace the **Host Agent**.
- `acpx-tui` is the current **ACPX Session Operator Console** and lives outside OMA's TypeScript core.

## Example dialogue

> **Dev:** "Should OMA take over the whole implementation once a plan exists?"
> **Domain expert:** "No. The **Host Agent** keeps the main context and owns the **Host Plan**. **OMA** only consumes an **Offload Plan** made of **Auxiliary Tasks** when doing so saves context."

> **Dev:** "ACPX exited 0 but the artifact file was not written. Should OMA return nothing?"
> **Domain expert:** "No. **Auxiliary Return Capture** should still return captured session content as **Extracted Auxiliary Findings** with `verdict=revise`; only a **Schema-Confirmed Auxiliary Result** can cross the **Result Trust Boundary** into `verdict=provisional_accept`."

## Flagged ambiguities

- "Execution runtime" was too broad. Resolved: **OMA** is not the owner of all execution; it is a context-saving sidecar.
- "Plan" was too broad. Resolved: the **Host Agent** owns the **Host Plan**; **OMA** consumes an **Offload Plan** only.
- "Run" was ambiguous. Resolved: default `oma run` proposes offload; only **Execute Mode** may call **ACPX**.
- "`acpx exit 0`" was ambiguous. Resolved: it is **ACPX Transport Completion**, not proof that an **Auxiliary Task** produced an **Adoptable Auxiliary Result**.
- "Artifact output" was ambiguous. Resolved: artifact writing preserves evidence, while **Auxiliary Return Capture** determines what content **OMA** returns to the **Host Agent**.
- "Artifact reference" was ambiguous. Resolved: references keep the Host-facing return small, but **Auxiliary Result Inspection** must provide direct CLI access to the complete captured content.
- "No schema" was ambiguous. Resolved: no schema-confirmed return with usable free-form findings is `completed`/`revise`, while `blocked` is reserved for no usable captured content.
- "Result" was ambiguous. Resolved: ACPX transport output, captured findings, schema-confirmed returns, and Host-adopted results are distinct confidence levels across the **Result Trust Boundary**.
- "Sub-capability" was too broad. Resolved: `acpx-tui` is a **Companion Capability**, specifically an **ACPX Session Operator Console**, not an **Auxiliary Task** or OMA core runtime.
- "Install" was ambiguous. Resolved: `oma install` installs **OMA Skills** into an agent skill registry; it is not **Execute Mode** and does not spawn **ACPX**.
