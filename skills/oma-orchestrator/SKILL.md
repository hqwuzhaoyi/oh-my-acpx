---
name: oma
description: Thin Host Agent entrypoint for using OMA as a context-saving auxiliary offload sidecar.
---

# OMA Orchestrator

Use OMA only when you are the **Host Agent** and you want to offload a bounded **Auxiliary Task** while keeping the main context and **Host Plan** in your own session.

## Use OMA When

- You have an **Offload Plan** or can create one from a small slice of the **Host Plan**.
- The task is bounded, packageable, and verifiable without the full conversation.
- A small prompt plus file scope is enough for useful work.
- You want an **Offload Proposal** before execution.

## Do Not Use OMA When

- The decision requires full Host Agent context.
- The task is the whole implementation plan or the final integration decision.
- You need full team/swarm behavior, UI/HUD, broad autopilot, or real ACPX spawning in the MVP.

## Commands

Use this command flow when the **Host Agent** chooses to use OMA:

```bash
oma setup
oma run .oma/plans/plan.json
oma run .oma/plans/plan.json --execute
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

### `oma run <plan-path> --execute`

Run only after the **Host Agent** has inspected and accepted the **Offload Proposal**.

Expected behavior in this MVP:

- Enters explicit **Execute Mode**
- Uses fake/local execution only
- Does not spawn real ACPX yet
- Returns a unified **Auxiliary Task Return**
- Writes long detail under `.oma/artifacts/`
- Writes the declared local output files from `localOutputs`
- Keeps `status` separate from `verdict`
- Keeps `hostPlanComplete` false

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
    "runtime": "fake-local",
    "agent": "frontend-builder"
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
