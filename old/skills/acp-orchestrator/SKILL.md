---
name: acp-orchestrator
description: Product-structured skill entry for the oh-my-acpx orchestration runtime.
---

# acp-orchestrator

This directory is the new structural home for the orchestration skill surface.

Compatibility note:
- the repository root `SKILL.md` remains the active compatibility entrypoint for existing installs
- this `skills/acp-orchestrator/` path marks the product-oriented structure going forward

Target user flow:
1. `npm install`
2. `npm run setup`
3. create or update `.oma/plans/plan.json`
4. `oax run .oma/plans/plan.json` (or `node dist/src/cli/index.js run .oma/plans/plan.json`)
5. continue orchestration from the in-session skill against `.oma/`

Structure intent:
- `skills/` for workflow entrypoints
- `src/` for runtime core
- `tests/` for verification
- `.oma/` for local runtime state
