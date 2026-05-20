# oh-my-acpx Architecture

## Product Definition

**Oh My ACPX (OMA) is a plan-driven agent execution loop built on top of ACPX.**

ACPX is the lower-level headless agent transport: sessions, queues, structured output, cancellation, history, and agent registry/config behavior. OMA is the workflow brain above that transport. Given a plan, OMA decides what should happen next, which runtime/agent should receive the work, how to diagnose failures, and when to stop.

The current redesign focuses on one outcome:

> make `plan -> routing -> spawn -> fallback -> self-schedule` a real closed loop.

This repository is intentionally **not** trying to clone the full complexity of oh-my-codex or oh-my-claudecode in the current phase. It borrows their product layering, not their full mode surface.

See also: `docs/product-positioning.md`.

## Product Surfaces

### 1. CLI surface

Minimal operator commands:

```bash
oax setup
oax route --category standard
oax doctor
oax run .oma/plans/plan.json
oax diagnose relay --stream-log <path>
oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>
oax diagnose stall .oma/plans/plan.json
```

## Core Capability Layers

- **Plan layer** — `.oma/plans/plan.json` as the canonical task/state source
- **Ralph layer** — persistent execution loop over the main orchestration chain
- **Diagnose layer** — operator-facing relay/stall inspection commands
- **Team layer** — explicitly deferred extension boundary, documented but not fully implemented in this MVP

Responsibilities:
- initialize `.oma/`
- inspect route decisions
- check local environment/config
- inspect plan progress

### 2. In-session skill surface

The orchestration skill remains the in-session entrypoint.

Responsibilities:
- continue orchestration from the host conversation
- read and write `.oma/` plans, state, logs, and context artifacts
- bridge host workflow instructions to runtime behavior

## State Root

`oh-my-acpx` uses **`.oma/`** as its runtime state root.

```txt
.oma/
├── plans/
├── state/
├── logs/
├── telemetry/
├── context/
├── interviews/
└── specs/
```

Design rule:
- do **not** reuse `.omx/` as the product state directory
- do **not** maintain a second parallel primary runtime root

## Runtime Core

### `src/core/router`
- maps category -> runtime/agent/fallback decision

### `src/core/fallback`
- parses relay logs
- diagnoses completed / stalled / error / waiting states

### `src/core/scheduler`
- inspects plan files
- selects next story
- produces self-schedule continuation messages

## Compatibility Strategy

Old scripts under `scripts/` are being moved toward compatibility shims.

Target rule:
- new logic belongs in `src/`
- old scripts either delegate to compiled core modules or get removed later

## Non-goals for the current phase

- full team/swarm orchestration runtime
- UI/HUD
- full provider/runtime abstraction parity with reference projects

See also:
- `docs/team-extension.md` for the future team/swarm boundary contract
