---
name: oma-acpx-init
description: Use when setting up OMA with ACPX-backed agents, when real ACPX Execute Mode is blocked by NO_AGENT_ONBOARDING or NO_APPROVED_AGENT, or when the user asks to approve, onboard, initialize, or configure ACPX agents for OMA.
---

# OMA ACPX Init

Use this skill when the **Host Agent** needs to connect OMA to ACPX-backed agents for real **Execute Mode**.

This skill owns the human approval workflow. ACPX discovery can show Declared ACPX adapters, but that does not prove those adapters are configured, usable by the user, verified, or approved for OMA. OMA may only execute through **Approved Agents** that the user explicitly allows for specific auxiliary task roles. The CLI must stay non-interactive; use scriptable CLI commands after the skill has gathered approval.

## When To Use

- The user asks to run `oma acpx init`.
- `oma run <plan-path> --execute` returns `NO_AGENT_ONBOARDING`.
- `oma run <plan-path> --execute` returns `NO_APPROVED_AGENT`.
- The user wants OMA to use Codex, Claude, or another ACPX-backed agent for **Auxiliary Tasks**.
- A project needs Approved Agents in the global OMA config or a project override.

Do not use this skill for fake/local routes, schema checks, or normal proposal-only `oma run`.

## Interaction Flow

1. Check whether a project override exists at `.oma/config/agents.json`, then whether global config exists at `~/.oma/config/agents.json`.
2. Always summarize the current configuration before asking the user to approve anything:
   - Project config: `.oma/config/agents.json` exists or missing, plus Approved Agents when present.
   - Global config: `~/.oma/config/agents.json` exists or missing, plus Approved Agents when present.
   - Active source: project override when present, otherwise global config when present, otherwise none.
3. If a valid approval config exists, read the approved agents and summarize them. Do not ask the approval questions again unless the user wants changes.
4. If it is missing, explain the approval boundary:
   - Declared Agent: shown by ACPX help or docs.
   - Configured Agent: present in ACPX configuration.
   - Verified Agent: passed a smoke check in this environment.
   - Approved Agent: explicitly allowed by the user for OMA auxiliary task roles.
5. Run `oma acpx init` to discover Declared ACPX adapters, inspect locally installed client commands, or report existing approvals. This command must not prompt.
6. Show available choices before recommending a command:
   - Installed client commands from `installedClients`: terminal clients found on PATH, such as `codex`, `claude`, `gemini`, `cursor`, `copilot`, `opencode`, `hermes`, and `qodercli`.
   - Recommended commands from `recommendedInstalledApprovalCommands`: one approval command per installed client, each with its own recommended role.
   - Declared ACPX adapters: adapter names returned by `oma acpx init`; these are not necessarily installed or user-usable.
   - Roles: `quick`, `deep`, `visual`.
   - Permissions: `read`, `edit`.
   - Scope: `project`, `global`.
7. Ask the user which installed clients are configured and usable in this environment, then which of those to approve. Recommend one role per approved agent from `recommendedInstalledApprovalCommands`, not one global role for every selected agent, and confirm edit/read permissions and project/global scope.
8. Run `oma acpx approve --agent <name> --role <role> --permissions <read|edit> --scope <project|global>` for each approved agent.
9. Confirm that `.oma/config/agents.json` or `~/.oma/config/agents.json` was written.
10. If the original task was blocked, retry `oma run <plan-path> --execute`.

## Approval Guidance

Use concise questions. The user should not need to understand internal routing fields.

- First show the current configuration and available choices.
- Include installed client command names, Declared ACPX adapter names, role options, permission options, and scope options.
- State that Declared ACPX adapters and installed client commands are only candidates, not proof of user access.
- If there is only one installed client, ask whether it is configured and usable before asking whether to approve it.
- If there are multiple installed clients, ask the user to choose one or more client names from `installedClients`.
- Include Declared ACPX adapters as secondary candidates only when the user says an adapter is usable despite no matching installed client command.
- Recommend one role per selected agent: `quick`, `deep`, or `visual`. Do not flatten all selected agents to a single shared role.
- Prefer `recommendedInstalledApprovalCommands` when showing default approval commands. Fall back to `recommendedApprovalCommands` only for secondary Declared ACPX adapter candidates.
- Ask once whether selected agents may edit files. Default is edit.
- Ask whether approval should be project-only or global. Default is project unless the user explicitly wants the same approval across projects.

Interactive prompt example:

```text
Current configuration:
- Project config: missing `.oma/config/agents.json`
- Global config: missing `~/.oma/config/agents.json`
- Approved Agents: none

Available choices:
- Installed client commands: codex, claude, gemini, cursor, copilot, opencode, hermes, qodercli
- Declared ACPX adapters: codex, claude, gemini, cursor, qwen, kimi, iflow, droid, pi, qoder
- Roles: quick, deep, visual
- Permissions: read, edit
- Scope: project, global

Recommended installed-client approvals:
- codex -> deep: oma acpx approve --agent codex --role deep --permissions edit --scope project
- claude -> deep: oma acpx approve --agent claude --role deep --permissions edit --scope project
- gemini -> visual: oma acpx approve --agent gemini --role visual --permissions edit --scope project
- cursor -> visual: oma acpx approve --agent cursor --role visual --permissions edit --scope project
- copilot -> deep: oma acpx approve --agent copilot --role deep --permissions edit --scope project
- opencode -> deep: oma acpx approve --agent opencode --role deep --permissions edit --scope project
- hermes -> deep: oma acpx approve --agent hermes --role deep --permissions edit --scope project
- qodercli -> quick: oma acpx approve --agent qodercli --role quick --permissions edit --scope project

These installed client commands and adapter names are candidates only; they do not prove user access.
Which installed clients are configured and usable here, and which roles, permissions, and scope should OMA approve for Auxiliary Tasks?
```

After the user approves, write the approval through the non-interactive CLI:

```bash
oma acpx approve --agent claude --role deep --permissions edit --scope project
oma acpx approve --agent gemini --role visual --permissions edit --scope project
```

Role meanings:

- `quick`: small, low-risk, clearly scoped auxiliary tasks.
- `deep`: auxiliary tasks needing more reasoning, research, diagnosis, or cross-file understanding.
- `visual`: frontend, UI/UX, visual implementation, screenshot verification.

Default recommendations:

- `cursor`, `gemini` -> `visual`
- `pi`, `qwen`, `kimi`, `iflow`, `qodercli` -> `quick`
- `claude`, `codex`, `copilot`, `opencode`, `hermes`, `droid`, and unknown agents -> `deep`

Permissions:

- `edit` maps to ACPX `--approve-all`.
- `read` maps to ACPX `--approve-reads`.
- Default to `edit`, but let the user mark specific agents as read-only.

## Commands

If `acpx` is not installed, ask the user to run `oma install` first. In interactive terminals, `oma install` asks whether to install `acpx` globally with `npm install -g acpx`; non-interactive runs skip ACPX installation unless `--yes` is passed. The user can also install ACPX directly with `npm install -g acpx`.

Build first if the workspace is using source directly:

```bash
npm run build
```

Run onboarding:

```bash
oma acpx init
```

If the package binary is not installed, use the built CLI:

```bash
node dist/src/cli/index.js acpx init
```

Persist an explicit approval:

```bash
oma acpx approve --agent codex --role deep --permissions edit --scope project
```

If the package binary is not installed, use the built CLI:

```bash
node dist/src/cli/index.js acpx approve --agent codex --role deep --permissions edit --scope project
```

Verify the persisted config:

```bash
cat .oma/config/agents.json
```

Retry real ACPX execution when needed:

```bash
oma run .oma/plans/plan.json --execute
```

## Persisted Shape

Expected `.oma/config/agents.json` for the default project-scoped approval:

```json
{
  "version": 1,
  "approvedAgents": {
    "codex": {
      "approved": true,
      "role": "deep",
      "permissions": "edit"
    }
  }
}
```

## Runtime Results

Handle these results directly:

- `NO_AGENT_ONBOARDING`: run this onboarding flow before real ACPX execution.
- `NO_APPROVED_AGENT`: ask whether to approve a matching agent/role, then run `oma acpx approve` if approved.
- `INVALID_APPROVED_AGENTS`: inspect the reported config path; do not guess or silently repair approvals.

Fake/local execution may still run without Approved Agents. Real ACPX execution must not.

Global approvals may still live at `~/.oma/config/agents.json` when the user intentionally wants the same approvals across projects.
