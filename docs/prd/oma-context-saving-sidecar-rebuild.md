# PRD: Rebuild OMA as a Context-Saving Auxiliary Offload Sidecar

## Problem Statement

The current OMA repository contains an older implementation and documentation model that treats OMA too much like a primary execution runtime. That framing conflicts with the actual product need: OMA will be invoked from other agents, but the whole workflow should not move into ACPX. The **Host Agent** must keep the main context, own the **Host Plan**, make **Main Context Decisions**, and integrate results. OMA should only consume an **Offload Plan** made of bounded **Auxiliary Tasks** when delegating that work to ACPX saves context.

Without this rebuild, future implementation will likely keep drifting toward a full agent platform or an oh-my-claudecode clone. That would increase complexity, waste context, and blur ownership between the **Host Agent**, **OMA**, and **ACPX**.

## Solution

Rebuild the repository around the confirmed domain model:

- **Host Agent** owns the main context, **Host Plan**, and final integration.
- **OMA** is a context-saving sidecar that consumes an **Offload Plan**.
- **ACPX** remains the lower-level headless agent transport.
- `oma run` defaults to an **Offload Proposal** and does not call ACPX.
- `oma run --execute` enters **Execute Mode** and may execute an **Auxiliary Task**.
- Every executed task returns a unified **Auxiliary Task Return** with structured **Evidence**.

The first rebuild should be intentionally small: archive the old implementation under `old/`, create a clean TypeScript CLI/core skeleton, implement fake/local Execute Mode before real ACPX spawning, and lock the new behavior with tests.

## User Stories

1. As a **Host Agent**, I want OMA to stay out of my main context, so that I can preserve the conversation and decision state I already own.
2. As a **Host Agent**, I want to create an **Offload Plan**, so that I can delegate only bounded supporting work.
3. As a **Host Agent**, I want `oma run` to return an **Offload Proposal** by default, so that I can inspect the proposed delegation before any ACPX execution happens.
4. As a **Host Agent**, I want **Execute Mode** to be explicit, so that auxiliary execution cannot unexpectedly consume budget or alter state.
5. As a **Host Agent**, I want each **Auxiliary Task** to declare its context budget, so that I can avoid sending high-context work away from the main agent.
6. As a **Host Agent**, I want each **Offload Proposal** to include the selected route, so that I know which runtime and agent OMA recommends.
7. As a **Host Agent**, I want each **Offload Proposal** to include the prompt or payload that would be sent to ACPX, so that I can review delegation quality.
8. As a **Host Agent**, I want each **Offload Proposal** to include the expected return schema, so that I can know what result shape to expect.
9. As a **Host Agent**, I want `oma run --execute` to initially support fake/local execution, so that the schema and loop can be validated before real ACPX integration.
10. As a **Host Agent**, I want real ACPX spawning to be added behind the same **Execute Mode** contract later, so that transport changes do not affect the Host-facing interface.
11. As a **Host Agent**, I want OMA to return an **Auxiliary Task Return**, so that I can integrate results consistently.
12. As a **Host Agent**, I want **Evidence** to be structured, so that I can judge whether the result is trustworthy without reading long logs.
13. As a **Host Agent**, I want `completed` to mean only auxiliary task completion, so that OMA does not claim the **Host Plan** is complete.
14. As a **Host Agent**, I want OMA to separate runtime status from adoption verdict, so that a technically completed task can still be rejected or revised.
15. As a **Host Agent**, I want OMA to report blockers explicitly, so that I can decide whether to ask the user, retry, split the task, or handle it myself.
16. As a **Host Agent**, I want OMA to report modified/read file scope, so that I can understand integration risk.
17. As a **Host Agent**, I want OMA to store long artifacts outside the conversation context, so that I can keep the active context small.
18. As a **Host Agent**, I want OMA to provide a short summary plus artifact references, so that I can inspect details only when needed.
19. As a **Host Agent**, I want OMA to self-schedule only the next offload step, so that it does not take over the **Host Plan**.
20. As a **Host Agent**, I want OMA to return coordination advice, so that I know whether to accept, retry, ask the user, spawn follow-up, or fallback to host.
21. As a developer, I want the old implementation archived under `old/`, so that prior work remains available without shaping the new main code path.
22. As a developer, I want a clean core module for offload planning, so that plan parsing and task selection can be tested in isolation.
23. As a developer, I want a clean core module for proposal generation, so that routing and prompt/payload construction can evolve without changing CLI parsing.
24. As a developer, I want a clean core module for return schema construction, so that every execution path returns the same Host-facing contract.
25. As a developer, I want a small CLI surface, so that early behavior is easy to verify and document.
26. As a developer, I want `oma schema`, so that Host Agents and tests can inspect the current return contract.
27. As a developer, I want unit tests over the offload core, so that the sidecar semantics do not regress back into primary-runtime semantics.
28. As a developer, I want tests to assert missing plan behavior, so that OMA fails safely when no **Offload Plan** exists.
29. As a developer, I want tests to assert all-done behavior, so that OMA stops offload scheduling when no auxiliary work remains.
30. As a developer, I want tests to assert proposal behavior, so that default `oma run` never accidentally executes ACPX.
31. As a developer, I want tests to assert fake Execute Mode behavior, so that the **Auxiliary Task Return** schema is locked before real ACPX integration.
32. As a developer, I want documentation to consistently use **Host Agent**, **Offload Plan**, **Auxiliary Task**, **Offload Proposal**, **Execute Mode**, **Auxiliary Task Return**, and **Evidence**, so that future contributors do not reintroduce ambiguous language.
33. As a future contributor, I want ADRs explaining why `oma run` defaults to proposal and why returns are unified, so that I do not “fix” those decisions back to the wrong model.
34. As a future contributor, I want `skills/oma-orchestrator/SKILL.md` to be thin, so that skill instructions remain an entrypoint rather than the runtime implementation.
35. As a future contributor, I want OMA to avoid full team/swarm and UI/HUD in the MVP, so that the rebuild stays focused on context-saving offload.

## Implementation Decisions

- Archive the previous repository contents under `old/` and treat that directory as reference material only.
- Keep the new repository root focused on the OMA sidecar model.
- Use `CONTEXT.md` as the canonical glossary for the new language.
- Keep ADRs for the two important product boundaries: default proposal mode and unified auxiliary task returns.
- Build the core as deep modules with small interfaces:
  - Offload plan loading and task selection.
  - Offload proposal construction.
  - Auxiliary task return construction and schema description.
  - CLI command dispatch.
- Define an **Offload Plan** as the OMA-readable execution slice, not the **Host Plan**.
- Define **Auxiliary Task** status separately from Host-level story status.
- Define `oma run` as proposal-only by default.
- Define `oma run --execute` as explicit **Execute Mode**.
- In the first rebuild, **Execute Mode** should use fake/local execution only. Real ACPX integration should come later behind the same contract.
- Define a unified **Auxiliary Task Return** contract with at least status, verdict, summary, scope, evidence, blockers, findings, followups, and coordination advice.
- Separate runtime `status` from adoption `verdict`.
- Ensure `completed` means auxiliary completion only.
- Store large execution artifacts under `.oma/artifacts/` rather than inline in the main conversation.
- Keep `skills/oma-orchestrator/SKILL.md` as a thin Host Agent entrypoint.
- Avoid reintroducing full team/swarm, UI/HUD, or autopilot concepts into the MVP.

## Testing Decisions

Tests should exercise external behavior and stable contracts rather than implementation details. A good test should verify what a Host Agent can rely on: command output shape, terminal states, schema fields, and safe default behavior.

Modules to test:

- Offload plan loading and inspection.
- Offload proposal generation.
- Auxiliary task return generation.
- CLI command behavior for setup, run, execute, and schema.

Required coverage:

- Missing **Offload Plan** returns `NO_PLAN`.
- All auxiliary tasks completed returns `ALL_DONE`.
- Pending auxiliary task returns `OFFLOAD_READY` with an **Offload Proposal**.
- Default `oma run` does not enter **Execute Mode**.
- `oma run --execute` returns a completed **Auxiliary Task Return** using fake/local execution.
- `completed` in the return explicitly does not mean the **Host Plan** is complete.
- `oma schema` exposes the current **Auxiliary Task Return** contract.

Prior art exists in the archived implementation under `old/tests/` for CLI behavior and unit-style validation, but the new tests should use the new sidecar vocabulary and avoid relying on old main-runtime semantics.

## Out of Scope

- Real ACPX spawning in the first rebuild.
- Full team/swarm orchestration.
- UI/HUD.
- Analytics or cost dashboards.
- A broad autopilot mode.
- Taking ownership of the **Host Plan**.
- Claiming Host-level completion from OMA.
- Reusing the old code as the new main implementation.
- Large provider abstraction work.
- GitHub issue automation beyond submitting this PRD.

## Further Notes

This PRD intentionally shifts OMA away from “primary execution runtime” language. The product should be understood as a Host-facing sidecar that saves context by handling bounded auxiliary work through ACPX.

The oh-my-claudecode research showed that its result model is distributed across state files, worker summaries, outbox messages, and reviewer verdict JSON. OMA should not copy that shape. Since OMA returns work to a **Host Agent**, it needs one unified structured return contract that is cheap to integrate.

The current repository may be partially rebuilt already. Before implementation, inspect the root directory and `old/` rather than assuming the archive step or skeleton step is complete.
