# OMA (`oh-my-acpx`)

[English](./README.md) | [简体中文](./README.zh-CN.md)

Install `oh-my-acpx`, run `oma install`, then let your agent use the installed OMA skills to offload bounded auxiliary work through ACPX when it is worth saving main-context space.

[![npm version](https://img.shields.io/npm/v/oh-my-acpx)](https://www.npmjs.com/package/oh-my-acpx) [![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

OMA is a context-saving auxiliary sidecar for a **Host Agent**. The Host Agent keeps the main context, owns the Host Plan, makes the main decisions, and integrates results. OMA only consumes small, bounded Auxiliary Tasks when delegating that work can help.

Most users should think of OMA as **agent-installed skills + a small runtime**, not as a CLI surface to operate manually all day.

## Recommended Default Flow

If you want the default OMA experience, start here:

```bash
npm install -g oh-my-acpx
oma install
```

Then work normally inside your agent:

```text
$oma "Use OMA for this task when offloading can save context."
$oma-acpx-init "Approve ACPX-backed agents when real ACPX execution is needed."
```

That is the main path. The skills guide onboarding, planning, approvals, execution, and result handling; the `oma` CLI is the small runtime behind those skills.

## Quick Start

### Requirements

- Node.js 20+
- An agent environment that can use installed skills
- ACPX only if you want ACPX-backed execution

### Install

```bash
npm install -g oh-my-acpx
oma install
```

`oma install` installs every bundled skill under `skills/` globally by running:

```bash
npx skills add <oh-my-acpx>/skills --global --all --full-depth
```

It also checks whether `acpx` is available and runs `npm install -g acpx` when the command is missing. Single-skill install is not supported by this command.

### Source Checkout

```bash
npm install
npm run build
npm install -g .
oma install
```

For package smoke checks:

```bash
npm pack
npm install -g ./oh-my-acpx-*.tgz
oma --version
oma install
```

## What OMA Is For

Use OMA when a task is:

- bounded enough to package as an Auxiliary Task
- useful without the full Host Agent conversation
- worth delegating to save main-context space
- verifiable before the Host Agent integrates the result

Do not use OMA when the work needs the full Host Plan context, when the task is the final integration decision, or when you want a broad team/swarm/autopilot system.

## A Simple Mental Model

OMA does **not** replace your agent.

It adds a small offload layer:

- **Host Agent** owns the main task, decisions, and final integration
- **OMA skills** help the Host Agent decide when and how to offload
- **OMA runtime** reads bounded Offload Plans and returns structured results
- **ACPX-backed agents** are optional execution backends for approved Auxiliary Tasks
- **`.oma/`** stores plans, approvals, artifacts, and runtime state when used

An **Offload Plan** is the small task packet the Host Agent gives to OMA. An **Auxiliary Task** is one independent, verifiable piece of work. An **Auxiliary Task Return** is the structured result the Host Agent uses to decide what to integrate.

## Common In-Agent Surfaces

| Surface | Use it for |
| --- | --- |
| `$oma "..."` | deciding whether to offload bounded auxiliary work and driving the OMA flow |
| `$oma-acpx-init "..."` | approving ACPX-backed agents for real execution |
| `/skills` | browsing installed OMA skills when your agent supports skill discovery |

Most day-to-day OMA use should start from `$oma`. Use `$oma-acpx-init` when execution is blocked by missing or insufficient ACPX approvals, or when a project needs to approve agents for OMA.

## Advanced / Operator Surfaces

These commands are useful for skills, debugging, and operator workflows, but they are not the main onboarding path.

```bash
oma setup
oma acpx init
oma acpx approve --agent codex --role deep --permissions edit --scope project
oma run .oma/plans/plan.json
oma run .oma/plans/plan.json --execute
oma result show <task-id>
oma schema
```

Key boundaries:

- `oma run` returns an Offload Proposal by default and does not call ACPX.
- `oma run --execute` is explicit Execute Mode.
- ACPX-backed execution requires Approved Agents.
- `oma result show <task-id>` inspects captured Auxiliary Task results.
- `oma schema` exposes the runtime return contract for operators and tests.

The package includes a tracked `bin/oma` wrapper and chmods `dist/src/cli/index.js` during `npm run build` so npm shims can execute the CLI.

## Optional ACPX Console

`capabilities/acpx-tui` is an optional companion console for inspecting and recovering ACPX sessions. It is not part of the core `oma run` decision loop, and it does not make OMA the owner of the Host Plan.

Clone with submodules when you want the TUI available:

```bash
git submodule update --init --recursive
```

## Boundaries

In scope for this MVP:

- agent-driven OMA skills
- `oma install` for bundled skill installation
- proposal-first `oma run`
- explicit `oma run --execute` with fake/local or ACPX-backed routes
- unified Auxiliary Task Return artifacts
- small TypeScript core modules and CLI

Out of scope for this MVP:

- broad ACPX provider abstraction
- full team/swarm orchestration
- UI/HUD in OMA core
- broad autopilot behavior
- ownership of the Host Plan

## Documentation

- [OMA ACPX init](./docs/oma-acpx-init.md)
- [ADR 0001: proposal-first run](./docs/adr/0001-oma-run-defaults-to-offload-proposal.md)
- [ADR 0002: unified auxiliary return schema](./docs/adr/0002-use-unified-auxiliary-task-return-schema.md)
- [ADR 0003: ACPX TUI as companion capability](./docs/adr/0003-link-acpx-tui-as-companion-capability.md)
- [ADR 0004: schema-confirmed provisional accept](./docs/adr/0004-require-schema-confirmed-results-for-provisional-accept.md)
- [ADR 0005: capture auxiliary results separately from artifacts](./docs/adr/0005-capture-auxiliary-results-separately-from-artifacts.md)
