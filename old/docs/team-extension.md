# Team / Swarm Extension Boundary

## Current Phase Decision

`oh-my-acpx` does **not** implement a full `team/swarm` runtime in the current MVP phase.

The current priority remains:

```txt
plan -> routing -> spawn -> fallback -> self-schedule
```

## What Is Included Now

This phase only preserves a **future extension boundary** for team/swarm support:

- room in the product structure for a later coordinated execution surface
- explicit documentation that team/swarm is a later phase, not a hidden in-progress feature
- the rule that future team/swarm work must integrate with `.oma/` instead of introducing a competing state root

## What Is Not Included Now

- no tmux/team runtime
- no parallel lane scheduler
- no worker mailbox protocol
- no multi-pane orchestration UX

## Future Contract

When team/swarm is added later, it should follow these rules:

1. **Reuse `.oma/`**
   - shared plans
   - shared state
   - shared logs / telemetry

2. **Preserve the MVP main loop**
   - team/swarm may coordinate execution lanes
   - but must still feed the same core path:
     `plan -> routing -> spawn -> fallback -> self-schedule`

3. **Remain an additive surface**
   - CLI MVP should still work without team/swarm
   - in-session skill flow should still work without team/swarm

4. **Avoid reference-project overreach**
   - borrow structure and lessons from `oh-my-codex` / `oh-my-claudecode`
   - do not copy their full complexity unless the repository truly needs it

## Recommended Future Shape

If this capability is added later, the lightest compatible shape would be:

- `src/team/` or `src/extensions/team/`
- a documented coordinator interface
- explicit use of `.oma/state/` and `.oma/plans/`

That future work should be planned as a separate phase, with its own PRD and tests.
