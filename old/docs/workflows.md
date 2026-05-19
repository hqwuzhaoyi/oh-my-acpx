# Workflows

## Product Workflow Definition

OMA is the workflow brain above ACPX. The skill layer introduces the workflow, `.oma/plans/plan.json` carries canonical state, `src/core/*` decides progress, and ACPX or compatible agent paths perform the actual execution.

## MVP Workflow

The current MVP workflow is:

```txt
plan -> routing -> spawn -> fallback -> self-schedule
```

The redesign is successful only if this chain can move a story to:
- completed
- or explicitly blocked

## CLI Workflow

```bash
npm install
npm run setup
oax route --category standard
oax run .oma/plans/plan.json
oax doctor
oax diagnose relay --stream-log <path>
oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>
oax diagnose stall .oma/plans/plan.json
```

## Core Capability Model

| Capability | Role in oh-my-acpx | Current Phase |
|---|---|---|
| `plan` | Canonical task source under `.oma/plans/plan.json` | Active |
| `ralph` | Default persistence loop for executing the main chain to completion/blocker | Active |
| `diagnose` | Operator diagnostics for relay and stall states | Active |
| `team` | Future multi-lane coordination layer | Deferred / boundary only |

## In-session Workflow

Use the orchestration skill to continue work against `.oma/`.

Example:

```text
继续执行 .oma/plans/plan.json
```

## Compatibility Workflow

Legacy scripts remain available during migration:

- `scripts/runtime-router.js`
- `scripts/self-schedule.js`

Their role is compatibility only.
New logic should move into `src/`.

See also:
- `docs/script-disposition.md`

## Not in Current Workflow Scope

- full team/swarm runtime
- UI/HUD
- full parity with oh-my-codex / oh-my-claudecode mode surfaces

If team/swarm support is introduced later, it should be treated as an extension on top of
the MVP flow, not as a replacement for the current closed-loop path.
