---
name: oma
description: Thin Host Agent entrypoint for using OMA as a context-saving auxiliary offload sidecar.
---

# OMA Orchestrator

Use OMA only when you are the **Host Agent** and you want to offload a bounded **Auxiliary Task** while keeping the main context and **Host Plan** in your own session.

## Onboarding Gate

Before creating, modifying, or executing any Offload Plan, the Host Agent must verify that ACPX-backed agents have been approved through the `oma-acpx-init` skill.

Rules:

- If no valid Approved Agents config exists at `~/.oma/config/agents.json` or `.oma/config/agents.json`, must use the `oma-acpx-init` skill before creating an **Offload Plan**.
- Before asking for approval or proposing `oma acpx approve`, summarize the current approval state: project config path/status, global config path/status, existing Approved Agents, and discovered Declared ACPX adapters.
- Treat Declared ACPX adapters as candidates only. They are not user-usable agents until the user confirms they are configured and usable in this environment, then explicitly approves them for OMA.
- When approval is needed, show the current optional choices before recommending a command: candidate adapter names, roles (`quick`, `deep`, `visual`), permissions (`read`, `edit`), and scope (`project`, `global`).
- Do not guess `route.agent` from model preference, defaults, or examples. Plan routes must come from Approved Agents.
- Do not create or rewrite an Offload Plan route until the installed/approved ACPX agents are known.
- Do not run `oma run <plan-path> --execute` until this gate passes.
- `oma setup`, `oma schema`, reading/explaining an existing plan, and pure documentation work are allowed before onboarding.
- A fake-local test plan is allowed before onboarding only when the user explicitly asks for fake-local behavior.

Route selection after onboarding:

- Choose `visual` Approved Agent role for UI, frontend, design implementation, screenshots, and visual verification tasks.
- Choose `deep` Approved Agent role for complex implementation, diagnosis, research, and cross-file work.
- Choose `quick` Approved Agent role for small, low-risk, clearly scoped auxiliary tasks.
- If multiple Approved Agents match the role, prefer the first user-approved agent recorded during onboarding.
- If no Approved Agent matches the task role, return to `oma-acpx-init` and ask whether to approve another agent or role. Do not guess.

## Use OMA When

- You have an **Offload Plan** or can create one from a small slice of the **Host Plan**.
- The task is bounded, packageable, and verifiable without the full conversation.
- A small prompt plus file scope is enough for useful work.
- You want an **Offload Proposal** before execution.

## Do Not Use OMA When

- The decision requires full Host Agent context.
- The task is the whole implementation plan or the final integration decision.
- You need full team/swarm behavior, UI/HUD, broad autopilot, or broad ACPX provider abstraction in the MVP.

## Commands

Use this command flow when the **Host Agent** chooses to use OMA:

```bash
oma setup
oma acpx init
oma acpx approve --agent codex --role deep --permissions edit
oma run .oma/plans/plan.json
oma run .oma/plans/plan.json --execute
oma result show <task-id>
oma schema
```

### `oma setup`

Run once per workspace, or whenever the Host Agent needs the default OMA directory structure.

Expected behavior:

- Creates `.oma/plans/`
- Creates `.oma/artifacts/`
- Creates `.oma/plans/plan.json` if it does not already exist
- Does not call ACPX
- Does not execute an **Auxiliary Task**
- Does not overwrite an existing **Offload Plan**

### `oma run <plan-path>`

Run after writing or updating an **Offload Plan**.

Expected behavior:

- Loads the **Offload Plan**
- Selects only the next pending **Auxiliary Task**
- Returns an **Offload Proposal**
- Includes selected route, context budget, payload, and expected **Auxiliary Task Return** schema
- Does not enter **Execute Mode**
- Does not call ACPX

If no plan exists, treat `NO_PLAN` as a safe stop and create or pass an **Offload Plan**.

If all tasks are done, treat `ALL_DONE` as "no auxiliary work remains"; do not claim the **Host Plan** is complete.

### `oma acpx init`

Use the `oma-acpx-init` skill before creating, modifying, or executing Offload Plans when the project has not approved agents yet. The CLI command itself is non-interactive discovery/status; the skill owns user approval and calls scriptable approval commands.

Expected behavior:

- The skill guides the user through approving ACPX-backed agents for OMA **Auxiliary Tasks**
- `oma acpx init` reports discovery/status and must not prompt
- The Host Agent reports current configuration before asking for changes
- The Host Agent lists available choices before recommending approval
- `oma acpx approve --agent <name> --role <role> --permissions <read|edit>` persists explicit approval
- Writes global Approved Agent config at `~/.oma/config/agents.json`
- Allows project-specific override config at `.oma/config/agents.json`
- Distinguishes declared/configured/verified agents from **Approved Agents**
- Does not execute an **Auxiliary Task**
- Does not mutate an **Offload Plan**

If a plan cannot be created because no installed/approved agent is known, or if `oma run <plan-path> --execute` returns `NO_AGENT_ONBOARDING` or `NO_APPROVED_AGENT`, switch to the `oma-acpx-init` skill instead of guessing an agent.

### `oma run <plan-path> --execute`

Run only after the **Host Agent** has inspected and accepted the **Offload Proposal**.

Expected behavior in this MVP:

- Enters explicit **Execute Mode**
- Uses fake/local execution for `fake-local` routes
- Uses ACPX prompt sessions for `acpx` routes
- Returns a unified **Auxiliary Task Return**
- Performs **Auxiliary Return Capture** from trusted `sessions history` first, then stdout fallback
- Writes long detail and captured answers under `.oma/artifacts/`
- Writes the declared local output files from `localOutputs`
- Records ACPX session evidence for prompt-session executions
- Keeps `status` separate from `verdict`
- Keeps `hostPlanComplete` false

### `oma result show <task-id>`

Use this after Execute Mode when the **Host Agent** needs the complete captured answer without manually browsing `.oma/artifacts/`.

Expected behavior:

- Looks up the result by **Auxiliary Task** identity.
- Returns `kind: "Auxiliary Result Inspection"`, `capturedAnswer`, concise `findings`, and `evidence`.
- Does not include raw `acpxResult` unless `--full` is passed.
- Rejects unsafe task ids, malformed artifact JSON, and artifact identity mismatches with structured errors.

Use `--full` only when the Host Agent needs raw transport evidence:

```bash
oma result show <task-id> --full
```

## ACPX Session Discipline

For `acpx` routes, use persistent ACPX prompt sessions so the work is observable in `~/.acpx/sessions/`.

Rules:

- Do not use `exec` for OMA **Auxiliary Tasks**. `exec` is a one-shot temporary ACP session and does not preserve persistent session state.
- Create or reuse a named ACPX session before sending the prompt.
- Use a stable session name, preferably from `route.sessionName`; otherwise derive `oma-<auxiliary-task-id>`.
- Use `route.timeoutSeconds` when provided; otherwise OMA uses the default ACPX prompt timeout of 180 seconds.
- Send the task prompt through `-s <session-name>` or `--session <session-name>`.
- After execution, collect `sessions show <session-name>` and `sessions history <session-name>` output when available.
- Write `sessionName`, session metadata, history summary, command evidence, stdout, and stderr into `.oma/artifacts/<task-id>.json`.
- Trust `sessions history` for capture only when the history command exits successfully; otherwise use stdout fallback.
- If session creation or prompting fails, return a `failed` **Auxiliary Task Return** instead of claiming completion.

Expected command shape:

```bash
acpx --cwd <workspace> <agent> sessions ensure --name <session-name>
acpx --cwd <workspace> --approve-all --timeout <route.timeoutSeconds-or-180> <agent> -s <session-name> "<prompt>"
acpx --cwd <workspace> <agent> sessions show <session-name>
acpx --cwd <workspace> <agent> sessions history <session-name> --limit 20
```

Use `--approve-reads` instead of `--approve-all` when the Approved Agent permission is `read`.

## Auxiliary Return Capture

Use these rules when interpreting `oma run --execute` results:

- Prefer a schema-valid **Auxiliary Task Return** for the active `auxiliaryTaskId` from trusted session history, then stdout.
- If multiple matching schema returns exist, use the last matching return.
- Treat mismatched `auxiliaryTaskId` returns as evidence only; never adopt them.
- If no schema return exists, accept free-form content only from a clear final answer, such as the last `assistant final` block or the last timestamped `assistant` entry in trusted `sessions history`.
- Do not trust noisy transcript/log content without a final assistant answer marker as free-form findings.
- Do not treat generic ACPX transport stdout or incomplete schema-like JSON fragments as **Extracted Auxiliary Findings**.
- Preserve `capturedAnswer` for `oma result show` even when the Host-facing return is `failed`/`reject`.

## Result Trust Boundary

Hard execution failures override result trust:

- Permission/tool failures and non-zero prompt execution return `status=failed` and `verdict=reject`.
- Do not expose extracted free-form findings as trusted Host-facing findings on hard failures.
- Keep captured content inspectable through `oma result show <task-id>` when artifact persistence succeeds.
- If artifact persistence fails after capture, return the captured content to the Host Agent but downgrade away from `provisional_accept`.

For file creation tasks, the **Host Agent** must put every file OMA should create in the **Offload Plan** under `localOutputs`. Do not create those files by hand and then claim OMA created them.

Minimal file-writing **Auxiliary Task** shape:

```json
{
  "id": "react-demo-app",
  "title": "Build a React demo app",
  "status": "pending",
  "contextBudget": {
    "maxTokens": 3000,
    "rationale": "The file outputs are fully declared in the Offload Plan."
  },
  "route": {
    "runtime": "acpx",
    "agent": "codex",
    "role": "deep",
    "sessionName": "oma-react-demo-app",
    "timeoutSeconds": 300
  },
  "prompt": "Create the declared React demo files.",
  "expectedReturn": "AuxiliaryTaskReturn",
  "modifiedFiles": [
    "examples/react-demo/package.json",
    "examples/react-demo/src/App.tsx"
  ],
  "localOutputs": [
    {
      "path": "examples/react-demo/package.json",
      "content": "{...package json...}\n"
    },
    {
      "path": "examples/react-demo/src/App.tsx",
      "content": "export function App() { return <main>OMA demo</main>; }\n"
    }
  ]
}
```

`localOutputs` only supports workspace-relative paths. OMA refuses absolute paths and parent-directory escapes.

### `oma schema`

Run when the **Host Agent**, tests, or documentation need to inspect the current **Auxiliary Task Return** contract.

Expected behavior:

- Prints the required return fields
- Documents valid status and verdict values
- States that `completed` means auxiliary completion only, not **Host Plan** completion

## Host Agent Responsibilities

- Keep the main context and **Host Plan**.
- Decide whether the **Offload Proposal** is acceptable.
- Decide whether to run `--execute`.
- Integrate or reject the **Auxiliary Task Return**.
- Ask the user, retry, split work, spawn follow-up, or fallback to host work based on coordination advice.

OMA must not self-schedule beyond the next pending **Auxiliary Task** and must not claim Host-level completion.
