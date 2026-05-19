# PRD: Rebuild OMA as a Context-Saving Auxiliary Offload Sidecar

## Problem Statement

The current OMA repository contains an older implementation and documentation model that treats OMA too much like a primary execution runtime. That framing conflicts with the actual product need: OMA will be invoked from other agents, but the whole workflow should not move into ACPX. The **Host Agent** must keep the main context, own the **Host Plan**, make **Main Context Decisions**, and integrate results. OMA should only consume an **Offload Plan** made of bounded **Auxiliary Tasks** when delegating that work to ACPX saves context.

Without this rebuild, future implementation will likely keep drifting toward a full agent platform or an oh-my-claudecode clone. That would increase complexity, waste context, and blur ownership between the **Host Agent**, **OMA**, and **ACPX**.

## Solution

Rebuild the repository around the confirmed domain model:

- **Host Agent** owns the main context, **Host Plan**, and final integration.
- **OMA** is a context-saving sidecar that consumes an **Offload Plan**.
- **ACPX** remains the lower-level headless agent transport.
- `oma run` defaults to an **Offload Proposal** and does not call ACPX.
- `oma run --execute` enters **Execute Mode** and may execute an **Auxiliary Task**.
- Every executed task returns a unified **Auxiliary Task Return** with structured **Evidence**.

The first rebuild should be intentionally small: archive the old implementation under `old/`, create a clean TypeScript CLI/core skeleton, implement fake/local Execute Mode, add a minimal ACPX-backed Execute Mode route behind the same contract, and lock the behavior with tests.

## User Stories

1. As a **Host Agent**, I want OMA to stay out of my main context, so that I can preserve the conversation and decision state I already own.
2. As a **Host Agent**, I want to create an **Offload Plan**, so that I can delegate only bounded supporting work.
3. As a **Host Agent**, I want `oma run` to return an **Offload Proposal** by default, so that I can inspect the proposed delegation before any ACPX execution happens.
4. As a **Host Agent**, I want **Execute Mode** to be explicit, so that auxiliary execution cannot unexpectedly consume budget or alter state.
5. As a **Host Agent**, I want each **Auxiliary Task** to declare its context budget, so that I can avoid sending high-context work away from the main agent.
6. As a **Host Agent**, I want each **Offload Proposal** to include the selected route, so that I know which runtime and agent OMA recommends.
7. As a **Host Agent**, I want each **Offload Proposal** to include the prompt or payload that would be sent to ACPX, so that I can review delegation quality.
8. As a **Host Agent**, I want each **Offload Proposal** to include the expected return schema, so that I can know what result shape to expect.
9. As a **Host Agent**, I want `oma run --execute` to support fake/local execution, so that the schema and loop can be validated without ACPX when needed.
10. As a **Host Agent**, I want ACPX spawning behind the same **Execute Mode** contract, so that transport changes do not affect the Host-facing interface.
11. As a **Host Agent**, I want OMA to return an **Auxiliary Task Return**, so that I can integrate results consistently.
12. As a **Host Agent**, I want **Evidence** to be structured, so that I can judge whether the result is trustworthy without reading long logs.
13. As a **Host Agent**, I want `completed` to mean only auxiliary task completion, so that OMA does not claim the **Host Plan** is complete.
14. As a **Host Agent**, I want OMA to separate runtime status from adoption verdict, so that a technically completed task can still be rejected or revised.
15. As a **Host Agent**, I want OMA to report blockers explicitly, so that I can decide whether to ask the user, retry, split the task, or handle it myself.
16. As a **Host Agent**, I want OMA to report modified/read file scope, so that I can understand integration risk.
17. As a **Host Agent**, I want OMA to store long artifacts outside the conversation context, so that I can keep the active context small.
18. As a **Host Agent**, I want OMA to provide a short summary plus artifact references, so that I can inspect details only when needed.
19. As a **Host Agent**, I want OMA to self-schedule only the next offload step, so that it does not take over the **Host Plan**.
20. As a **Host Agent**, I want OMA to return coordination advice, so that I know whether to accept, retry, ask the user, spawn follow-up, or fallback to host.
21. As a developer, I want the old implementation archived under `old/`, so that prior work remains available without shaping the new main code path.
22. As a developer, I want a clean core module for offload planning, so that plan parsing and task selection can be tested in isolation.
23. As a developer, I want a clean core module for proposal generation, so that routing and prompt/payload construction can evolve without changing CLI parsing.
24. As a developer, I want a clean core module for return schema construction, so that every execution path returns the same Host-facing contract.
25. As a developer, I want a small CLI surface, so that early behavior is easy to verify and document.
26. As a developer, I want `oma schema`, so that Host Agents and tests can inspect the current return contract.
27. As a developer, I want unit tests over the offload core, so that the sidecar semantics do not regress back into primary-runtime semantics.
28. As a developer, I want tests to assert missing plan behavior, so that OMA fails safely when no **Offload Plan** exists.
29. As a developer, I want tests to assert all-done behavior, so that OMA stops offload scheduling when no auxiliary work remains.
30. As a developer, I want tests to assert proposal behavior, so that default `oma run` never accidentally executes ACPX.
31. As a developer, I want tests to assert fake Execute Mode behavior, so that the **Auxiliary Task Return** schema is locked before real ACPX integration.
32. As a developer, I want documentation to consistently use **Host Agent**, **Offload Plan**, **Auxiliary Task**, **Offload Proposal**, **Execute Mode**, **Auxiliary Task Return**, and **Evidence**, so that future contributors do not reintroduce ambiguous language.
33. As a future contributor, I want ADRs explaining why `oma run` defaults to proposal and why returns are unified, so that I do not “fix” those decisions back to the wrong model.
34. As a future contributor, I want `skills/oma/SKILL.md` to be thin, so that skill instructions remain an entrypoint rather than the runtime implementation.
35. As a future contributor, I want OMA to avoid full team/swarm and UI/HUD in the MVP, so that the rebuild stays focused on context-saving offload.

## Implementation Decisions

- Archive the previous repository contents under `old/` and treat that directory as reference material only.
- Keep the new repository root focused on the OMA sidecar model.
- Use `CONTEXT.md` as the canonical glossary for the new language.
- Keep ADRs for the two important product boundaries: default proposal mode and unified auxiliary task returns.
- Build the core as deep modules with small interfaces:
  - Offload plan loading and task selection.
  - Offload proposal construction.
  - Auxiliary task return construction and schema description.
  - CLI command dispatch.
- Define an **Offload Plan** as the OMA-readable execution slice, not the **Host Plan**.
- Define **Auxiliary Task** status separately from Host-level story status.
- Define `oma run` as proposal-only by default.
- Define `oma run --execute` as explicit **Execute Mode**.
- **Execute Mode** supports fake/local execution and a minimal ACPX-backed route behind the same contract.
- Define a unified **Auxiliary Task Return** contract with at least status, verdict, summary, scope, evidence, blockers, findings, followups, and coordination advice.
- Separate runtime `status` from adoption `verdict`.
- Ensure `completed` means auxiliary completion only.
- Store large execution artifacts under `.oma/artifacts/` rather than inline in the main conversation.
- Keep `skills/oma/SKILL.md` as a thin Host Agent entrypoint.
- Avoid reintroducing full team/swarm, UI/HUD, or autopilot concepts into the MVP.

## Testing Decisions

Tests should exercise external behavior and stable contracts rather than implementation details. A good test should verify what a Host Agent can rely on: command output shape, terminal states, schema fields, and safe default behavior.

Modules to test:

- Offload plan loading and inspection.
- Offload proposal generation.
- Auxiliary task return generation.
- CLI command behavior for setup, run, execute, and schema.

Required coverage:

- Missing **Offload Plan** returns `NO_PLAN`.
- All auxiliary tasks completed returns `ALL_DONE`.
- Pending auxiliary task returns `OFFLOAD_READY` with an **Offload Proposal**.
- Default `oma run` does not enter **Execute Mode**.
- `oma run --execute` returns a completed **Auxiliary Task Return** using fake/local execution or an ACPX-backed route.
- `completed` in the return explicitly does not mean the **Host Plan** is complete.
- `oma schema` exposes the current **Auxiliary Task Return** contract.

Prior art exists in the archived implementation under `old/tests/` for CLI behavior and unit-style validation, but the new tests should use the new sidecar vocabulary and avoid relying on old main-runtime semantics.

## Out of Scope

- Broad ACPX provider abstraction work.
- Full team/swarm orchestration.
- UI/HUD.
- Analytics or cost dashboards.
- A broad autopilot mode.
- Taking ownership of the **Host Plan**.
- Claiming Host-level completion from OMA.
- Reusing the old code as the new main implementation.
- Large provider abstraction work.
- GitHub issue automation beyond submitting this PRD.

## Further Notes

This PRD intentionally shifts OMA away from “primary execution runtime” language. The product should be understood as a Host-facing sidecar that saves context by handling bounded auxiliary work through ACPX.

The oh-my-claudecode research showed that its result model is distributed across state files, worker summaries, outbox messages, and reviewer verdict JSON. OMA should not copy that shape. Since OMA returns work to a **Host Agent**, it needs one unified structured return contract that is cheap to integrate.

The current repository may be partially rebuilt already. Before implementation, inspect the root directory and `old/` rather than assuming the archive step or skeleton step is complete.

## Command Surface

The command surface should stay small and Host-agent oriented. Commands exist to help the **Host Agent** inspect, propose, explicitly execute, validate, and retrieve auxiliary offload work. They must not imply that OMA owns the **Host Plan**.

### MVP Commands

#### `oma setup`

Initializes the OMA sidecar workspace.

Expected responsibilities:

- Create `.oma/` if missing.
- Create `.oma/plans/` for **Offload Plans**.
- Create `.oma/artifacts/` for large auxiliary outputs.
- Create `.oma/logs/` and `.oma/telemetry/` when needed.
- Avoid mutating the **Host Plan**.

#### `oma acpx init`

Discovers ACPX onboarding status and candidate adapters without mutating plans or prompting.

Expected responsibilities:

- Report existing project or global **Approved Agents**.
- Discover declared ACPX adapters when available.
- Explain that discovered adapters are candidates only.
- Recommend scriptable `oma acpx approve` commands when approval is missing.
- Avoid creating the OMA workspace directories; that is `oma setup`.

#### `oma run [plan-path]`

Inspects an **Offload Plan** and returns an **Offload Proposal** by default.

Expected behavior:

- Do not call ACPX.
- Select the next pending **Auxiliary Task**.
- Produce route information, context budget, execution payload, and expected return schema.
- Return `NO_PLAN` when the **Offload Plan** is missing.
- Return `ALL_DONE` when there are no pending auxiliary tasks.
- Return `OFFLOAD_READY` when there is a task ready for optional execution.

#### `oma run [plan-path] --execute`

Explicitly enters **Execute Mode** for the next **Auxiliary Task**.

Expected behavior:

- Use fake/local execution for `fake-local` routes.
- Call ACPX for `acpx` routes.
- Return an **Auxiliary Task Return** using the Host-facing `kind: "Auxiliary Task Return"` contract.
- Make clear that `status=completed` only means auxiliary completion.

#### `oma schema`

Prints the current Host-facing **Auxiliary Task Return** contract.

Expected responsibilities:

- Describe the **Auxiliary Task Return** shape.
- Include allowed status, verdict, evidence, blocker, and next-action enums.

### Second-Stage Commands

These should come after MVP behavior is stable.

#### `oma plan init`

Creates a starter **Offload Plan**.

Expected behavior:

- Generate `.oma/plans/plan.json`.
- Optionally accept a short task description.
- Produce a safe example **Auxiliary Task**.

#### `oma plan validate [plan-path]`

Validates an **Offload Plan** before proposal or execution.

Expected checks:

- Task IDs are present and unique.
- Task kind is known or explicitly custom.
- Context budget is present.
- Expected output is declared.
- Status values are valid.
- Scope constraints are structurally valid.

#### `oma next [plan-path]`

Returns only the next pending **Auxiliary Task** without producing a full **Offload Proposal**.

Expected use:

- Quick Host Agent inspection.
- Lightweight scripting.

### Third-Stage Commands

These are useful after real execution and artifacts exist.

#### `oma diagnose task <task-id>`

Diagnoses a specific auxiliary task result.

Expected checks:

- Missing return file.
- Malformed **Auxiliary Task Return**.
- Missing or weak **Evidence**.
- Blocked state.
- Failed execution.
- Unsafe integration recommendation.

#### `oma diagnose relay --stream-log <path>`

Diagnoses ACPX relay execution once real ACPX integration exists.

Expected checks:

- Stalled relay.
- Completed relay.
- Error relay.
- Waiting relay.
- Recoverable child logs.

#### `oma artifact list <task-id>`

Lists artifacts for an **Auxiliary Task**.

#### `oma artifact show <task-id> <name>`

Prints or locates one artifact without pushing all long content into the Host Agent context.

### ACPX Execute Mode Route

ACPX execution is available only in explicit Execute Mode when the selected **Auxiliary Task** route declares `runtime: "acpx"`:

```bash
oma run .oma/plans/plan.json --execute
```

Rules:

- ACPX execution must never become the default behavior of `oma run`.
- The route's runtime and agent must not change the **Auxiliary Task Return** schema.
- Any ACPX-specific logs should be artifacts or diagnostics, not the primary Host-facing result.

### Command Prioritization

MVP required:

```bash
oma acpx init
oma setup
oma run [plan-path]
oma run [plan-path] --execute
oma schema
```

Second stage:

```bash
oma plan init
oma plan validate [plan-path]
oma next [plan-path]
```

Third stage:

```bash
oma diagnose task <task-id>
oma diagnose relay --stream-log <path>
oma artifact list <task-id>
oma artifact show <task-id> <name>
```

ACPX route:

```bash
oma run [plan-path] --execute
```

## Agent Onboarding: `oma acpx init`

OMA must not infer user approval from ACPX discovery output. `acpx --help` can show declared adapters, and `acpx config show` can show configured adapters, but neither proves that the **Host Agent** should use those adapters for offload work.

The first-use onboarding surface should be the `oma-acpx-init` skill, exposed to users through the `oma acpx init` command flow.

### Purpose

`oma acpx init` confirms which ACPX-backed agents the user allows OMA to use for **Auxiliary Tasks** and persists that decision for the project.

### First-use flow

1. Detect declared ACPX adapter names when available.
2. Inspect ACPX configuration when available.
3. Optionally run smoke checks when the user wants verification.
4. Explain that declared/configured agents are not automatically approved.
5. Ask the user which agents OMA may use, then recommend one auxiliary role for each approved agent.
6. Persist the result to project `.oma/config/agents.json` by default, with global `~/.oma/config/agents.json` reserved for explicitly shared approvals.

### Persisted configuration

The persisted configuration should distinguish user approval from discovery:

```json
{
  "version": 1,
  "approvedAgents": {
    "codex": {
      "approved": true,
      "role": "deep",
      "permissions": "edit"
    }
  }
}
```

### Runtime rules

- OMA may recommend or execute only through user-approved agents.
- `acpx --help` output is discovery input only.
- ACPX config output is discovery input only.
- If neither global `~/.oma/config/agents.json` nor project `.oma/config/agents.json` exists, real ACPX **Execute Mode** must stop with `NO_AGENT_ONBOARDING`.
- Fake/local execution may still be used for schema testing without approved agents.
- If no approved agent matches a task role, OMA must return `NO_APPROVED_AGENT` rather than guessing.
- Approved Agent roles are `quick`, `deep`, and `visual`.
- `permissions: "edit"` maps to ACPX `--approve-all`; `permissions: "read"` maps to ACPX `--approve-reads`.

### Suggested supporting CLI commands

The primary onboarding experience is the `oma acpx init` skill, but CLI helpers may exist later:

```bash
oma agents list
oma agents recommend --task-kind <kind>
oma agents verify <agent-id>
```

These helpers should not replace user approval captured by `oma acpx init`.

## Skill Installation Surface

OMA also needs an installation command for **OMA Skills**. This is distinct from **Execute Mode** and from **Offload Plan** execution.

### `oma install`

Installs or updates OMA-provided skills into the user's agent skill registry.

Expected behavior:

- Install **OMA Skills** such as the OMA orchestration entrypoint and `oma acpx init` onboarding skill.
- Avoid reading or modifying any **Offload Plan**.
- Avoid spawning ACPX.
- Avoid implying Host Plan ownership.

Rules:

- `oma install` is for skills and registry setup only.
- `oma install` must not behave like `oma run`.
- `oma install` must not enter **Execute Mode**.

## Companion Capability: ACPX Session Operator Console

OMA may ship or link **Companion Capabilities** that support ACPX workflows without becoming part of OMA's core offload decision loop.

The current companion is `acpx-tui`, linked under `capabilities/acpx-tui` as an independently versioned ACPX session operator console.

Expected purpose:

- Inspect ACPX sessions.
- Resume or interact with ACPX sessions when appropriate.
- Improve operator visibility around ACPX-backed auxiliary execution.

Boundaries:

- `acpx-tui` is not the **Host Agent**.
- `acpx-tui` does not own the **Host Plan**.
- `acpx-tui` is not part of `oma run` proposal selection.
- `acpx-tui` must not turn OMA into a full workflow runtime.

## Naming Decisions

- Product name: **OMA**.
- CLI command: `oma`.
- Package name: `oma`.
- Archived legacy implementation remains under `old/` and may contain obsolete command references.
- New root documentation and code must use `oma` consistently as the CLI name.
