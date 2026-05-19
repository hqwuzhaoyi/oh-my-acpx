# Configuration

## Runtime State Root

oh-my-acpx uses:

```txt
.oma/
```

This is the only product state root for the redesigned runtime.

## Repository Config Files

Current repository config references:

- `config/acpx-config.json`
- `config/acpx-config-full.json`

These are still useful reference inputs while the runtime is being restructured.

## Planned Configuration Surfaces

### CLI/runtime config
Future runtime loading should converge toward a structured config loader in `src/config/`.

Expected domains:
- default agent
- category routing
- runtime defaults
- fallback policy
- telemetry

### Notification config
Notification credentials must come from environment/config injection, not hardcoded values.

Current environment expectation for Feishu helper script:

```txt
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_DEFAULT_CHAT_ID   # optional
```

## Operator Commands

```bash
oax setup
oax doctor
oax route --category standard
oax run .oma/plans/plan.json
oax diagnose relay --stream-log <path>
oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>
oax diagnose stall .oma/plans/plan.json
```
