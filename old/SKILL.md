---
name: acp-orchestrator
description: "Use when user requests multi-agent task execution, parallel coding, or task decomposition across agents. Triggers: '用多个agent', '并行处理', '分派任务', 'multi-agent', 'parallel agents', 'orchestrate', 'oh my acpx', '帮我拆任务', 'dispatch to agents'."
---

# acp-orchestrator

This root `SKILL.md` is the **compatibility entrypoint** for installs that still load the repository root as the active skill.

Canonical product structure now lives at:
- `skills/acp-orchestrator/SKILL.md` — skill surface
- `src/core/` — runtime core
- `src/cli/` — operator surface
- `.oma/` — local runtime state root

## Current Product Goal

Given a plan at `.oma/plans/plan.json`, the system should drive:

`plan -> routing -> spawn -> fallback -> self-schedule`

until each story is either:
- **completed**, or
- **explicitly blocked**

## Preferred Local Flow

1. Install dependencies:

```bash
npm install
```

2. Initialize the local state root:

```bash
npm run setup
```

3. Create or update:

```text
.oma/plans/plan.json
```

4. Run the minimal operator flow:

```bash
node dist/src/cli/index.js run .oma/plans/plan.json
```

5. Continue inside the host session via the skill surface:

```text
继续执行 .oma/plans/plan.json
```

## Compatibility Notes

- This root file remains intentionally **thin**.
- Do **not** continue moving core product logic into `SKILL.md`.
- Old scripts in `scripts/` are compatibility shims around compiled runtime modules in `dist/src/*`.
- The product state root is **`.oma/`**, not `.omx/`.
- This phase does **not** include a full `team/swarm` runtime implementation.
- `UI/HUD` remains out of scope for the current MVP.

## Structure Intent

- `skills/` → workflow entrypoints
- `src/` → runtime logic
- `tests/` → regression protection
- `docs/` → architecture, config, workflows
- `.oma/` → plans, state, logs, telemetry, context, specs
