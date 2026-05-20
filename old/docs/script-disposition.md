# Script Disposition Matrix

This document captures the current decision for each legacy script in `oh-my-acpx`.

## Core rule

> **Keep scripts, move logic.**

Meaning:
- scripts may stay as compatibility entrypoints
- new runtime logic should continue moving into `src/core/*` or `src/integrations/*`
- validation-oriented scripts may remain as research / regression assets

## Matrix

| Script | Current role | Keep? | Target state |
|---|---|---|---|
| `scripts/runtime-router.js` | Compatibility route lookup wrapper | Temporary | Replaceable by `oax route`; removable later |
| `scripts/self-schedule.js` | Compatibility self-schedule entrypoint | Yes | Keep as thin shim over scheduler + openclaw integration |
| `scripts/stall-detector.js` | Compatibility stall / recovery wrapper | Yes | Keep as thin shim while recovery logic keeps moving into `src/core/recovery` |
| `scripts/relay-fallback.js` | Compatibility relay diagnosis / watch wrapper | Yes | Keep as thin shim while fallback logic keeps moving into `src/core/fallback` |
| `scripts/send-feishu-notification.js` | Compatibility notification wrapper | Yes | Keep as very thin shim over `src/integrations/notifications` |
| `scripts/test-runtime-stability.sh` | Verification asset | Yes | Keep as validation script |
| `scripts/test-multi-turn-orchestration.sh` | Verification asset | Yes | Keep as validation script |
| `scripts/test-sessions-history-recovery.sh` | Verification asset | Yes | Keep as validation script |

## Categories

### Compatibility shims
These stay for migration safety or external workflow compatibility:

- `runtime-router.js`
- `self-schedule.js`
- `stall-detector.js`
- `relay-fallback.js`
- `send-feishu-notification.js`

Rule:
- do not keep adding core business logic here unless it is a short-lived migration shim

### Validation assets
These are not product runtime entrypoints:

- `test-runtime-stability.sh`
- `test-multi-turn-orchestration.sh`
- `test-sessions-history-recovery.sh`

Rule:
- preserve them as regression / research tooling

## Product direction

Long-term direction:

- `.oma/` = product state root
- `oax` = operator surface
- `skills/acp-orchestrator/` = session/workflow surface
- `scripts/` = compatibility or validation layer

So the intended steady state is:

> **CLI and runtime modules become primary; scripts become compatibility or validation layers.**
