# OMA

OMA is a context-saving auxiliary offload sidecar for a **Host Agent**. The **Host Agent** keeps the main context, owns the **Host Plan**, makes **Main Context Decisions**, and integrates results. OMA only consumes an **Offload Plan** made of bounded **Auxiliary Tasks** when delegating that work can save context.

OMA is not the primary execution runtime, not an ACPX replacement, and not a full team/swarm system.

## Naming

- **OMA** is the project and product name.
- **`oma`** is the CLI command used to operate OMA.
- **`oma`** is the package name.

## Quick Start

```bash
npm install
npm run build
node dist/src/cli/index.js setup
node dist/src/cli/index.js install
node dist/src/cli/index.js acpx init
node dist/src/cli/index.js run .oma/plans/plan.json
node dist/src/cli/index.js run .oma/plans/plan.json --execute
node dist/src/cli/index.js result show <task-id>
node dist/src/cli/index.js schema
```

After installing the package binary, the same flow is:

```bash
oma setup
oma install
oma acpx init
oma run .oma/plans/plan.json
oma run .oma/plans/plan.json --execute
oma result show <task-id>
oma schema
```

`oma run` returns an **Offload Proposal** by default. It does not call ACPX.

`oma run --execute` enters **Execute Mode**. It can use fake/local execution for declared local outputs, or an `acpx` route to delegate the Auxiliary Task through ACPX and return an **Auxiliary Task Return** with command evidence.

For ACPX routes, run `oma acpx init` and approve an **Approved Agent** before Execute Mode. ACPX routes may set `route.timeoutSeconds`; if omitted, OMA uses 180 seconds. OMA captures schema-valid **Auxiliary Task Returns** first, then clear final assistant answers from trusted session history, and keeps complete captured content available through `oma result show <task-id>`.

`oma install` starts the interactive `skills` installer for every skill under `skills/` by running `npx skills@latest add <oma>/skills --full-depth -f`.

## Offload Plan

The default example lives at `.oma/plans/plan.json`.

An **Offload Plan** is the OMA-readable slice of work selected by the **Host Agent**. It is not the **Host Plan** and should contain only bounded **Auxiliary Tasks** with enough context to run independently.

Each **Auxiliary Task** declares:

- `contextBudget`
- selected `route`
- prompt/payload for the runtime
- expected return contract
- read and modified file scope when known

An `acpx` route may include `sessionName` for persistent ACPX sessions and `timeoutSeconds` for long-running bounded work.

## Return Contract

Executed work returns one **Auxiliary Task Return** with:

- `status`
- `verdict`
- `summary`
- `scope`
- `evidence`
- `blockers`
- `findings`
- `followups`
- `coordinationAdvice`

`status: "completed"` only means the **Auxiliary Task** completed. It does not mean the **Host Plan** is complete.

Long artifacts belong under `.oma/artifacts/` and should be referenced from the return instead of pasted into the Host Agent conversation.

## Companion Capabilities

`capabilities/acpx-tui` is linked as a companion ACPX session operator console.

It improves OMA's ACPX workflow by making sessions observable and recoverable: developers can inspect ACPX session state, watch event streams, send prompts, and resume into an agent session when an auxiliary execution needs human inspection or handoff.

It is not part of the core `oma run` decision loop. OMA remains proposal-first, the **Host Agent** still owns the **Host Plan**, and the TUI does not turn OMA into a full workflow runtime.

Clone with submodules when you want the TUI available:

```bash
git submodule update --init --recursive
```

## Boundaries

In scope for this MVP:

- proposal-first `oma run`
- interactive installation for all skills under `skills/` with `oma install`
- explicit `oma run --execute` with fake/local or ACPX-backed routes
- unified **Auxiliary Task Return**
- `oma result show <task-id>` for **Auxiliary Result Inspection**
- `oma schema`
- small TypeScript core modules and CLI

Out of scope for this MVP:

- broad ACPX provider abstraction
- full team/swarm orchestration
- UI/HUD in OMA core
- broad autopilot behavior
- ownership of the **Host Plan**
