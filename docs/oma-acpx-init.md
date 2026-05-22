# `oma acpx init`

`oma acpx init` is the first-use discovery surface for connecting OMA to ACPX-backed agents.

Human approval lives in the `oma-acpx-init` skill. The CLI stays non-interactive and exposes scriptable helpers for discovery and persistence.

## Why this exists

OMA must not assume that an agent listed by ACPX is usable or approved.

There are different levels of agent knowledge:

- **Declared Agent**: an adapter name shown by ACPX help or documentation.
- **Configured Agent**: an agent present in ACPX configuration.
- **Verified Agent**: an agent that passed a smoke test in the current environment.
- **Approved Agent**: an agent the user explicitly allowed OMA to use for specific auxiliary roles.

OMA may only recommend or execute through **Approved Agents**.

## Flow

The onboarding flow should:

1. Detect ACPX if available.
2. Inspect ACPX-declared agents from the current CLI discovery surface.
3. Optionally run manual smoke checks for candidate agents before approval.
4. Explain that declared/configured/verified does not equal approved.
5. Ask the user which agents OMA may use in the skill, not in the CLI.
6. Recommend one auxiliary task role for each approved agent, such as `claude -> deep` and `gemini -> visual`, instead of using one global role across every selected agent.
7. Write the result through `oma acpx approve --agent <name> --role <role> --permissions <read|edit> --scope <project|global>`.

`oma acpx init` must not prompt. It returns existing approvals or discovered ACPX agents, plus PATH-inspected `installedClients`, per-agent `recommendedRoles`, `recommendedApprovalCommands`, and `recommendedInstalledApprovalCommands`. Installed client discovery checks known terminal client commands including `codex`, `claude`, `gemini`, `cursor`, `copilot`, `opencode`, `hermes`, and `qodercli`. Current CLI discovery is intentionally conservative: it does not prove that a declared or locally installed adapter is configured, authenticated, or usable.

## Persisted config

By default, `oma acpx approve` writes project approvals to `.oma/config/agents.json`. Use `--scope global` only when the same ACPX approval should intentionally apply across projects.

Example:

```json
{
  "version": 1,
  "approvedAgents": {
    "codex": {
      "approved": true,
      "role": "deep",
      "permissions": "edit"
    },
    "claude": {
      "approved": true,
      "role": "deep",
      "permissions": "read"
    },
    "gemini": {
      "approved": true,
      "role": "visual",
      "permissions": "edit"
    }
  }
}
```

## Runtime rules

- `oma run` may produce an **Offload Proposal** without approved agents.
- Real ACPX execution requires a matching **Approved Agent**.
- If neither global `~/.oma/config/agents.json` nor project `.oma/config/agents.json` exists, real ACPX execution must return `NO_AGENT_ONBOARDING`.
- If no approved agent matches the requested role, OMA must return `NO_APPROVED_AGENT`.
- Approved Agent roles are `quick`, `deep`, and `visual`.
- `permissions: "edit"` maps to ACPX `--approve-all`; `permissions: "read"` maps to ACPX `--approve-reads`.
- Some agents implement read-only inspection through shell tools; approve those agents with `permissions: "edit"` when `--approve-reads` produces non-interactive permission failures.
- Fake/local execution may still be used for schema and development tests without approved agents.

## Non-goals

`oma acpx init` does not:

- execute an **Auxiliary Task**;
- read or mutate an **Offload Plan**;
- claim the **Host Plan** is complete;
- treat ACPX help output as permission;
- prompt the user directly;
- repeatedly ask the same approval questions after config is persisted.
