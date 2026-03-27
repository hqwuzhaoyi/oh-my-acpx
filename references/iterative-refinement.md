# Iterative Refinement（迭代精炼）

Multi-round generate-evaluate cycles for high-risk stories marked `iterative:true` in plan.json. Depends on generator-evaluator for each round's scoring.

**Audience:** acp-orchestrator handling stories with `"iterative": true` in plan.json.

**Goal:** Improve high-risk story output through multiple generate-evaluate rounds, stopping when quality is sufficient or diminishing returns are reached.

## Why This Exists

Single-pass implementation works for most stories, but high-risk stories (core architecture, complex multi-file changes) benefit from iterative improvement. The key insight: evaluator feedback from round N, when injected into round N+1's task, produces measurably better output because the implementer addresses specific gaps rather than guessing. However, returns diminish after 2-3 rounds, and ACP costs accumulate, so the loop must have hard stops.

## When to Enable

Mark `"iterative": true` in plan.json when any of these apply:

| Condition | Example |
|---|---|
| Core architecture decision affecting downstream stories | Data model design, auth architecture |
| User explicitly requests high quality | "do this well", "design carefully" |
| Complex change spanning 3+ files | Large-scale refactor |
| Previous similar story failed evaluation | Second attempt |

## Iteration Flow

1. Spawn implementation agent with methodology (TDD/brainstorming/debugging as appropriate)
2. Run generator-evaluator for structured scoring (see `references/generator-evaluator.md`)
3. Check score against thresholds:
   - Score >= 4.0: Done. Quality exceeds baseline.
   - Score 3.0-3.9: Iterate if rounds remain.
   - Score < 3.0: Iterate (clear problems need fixing).
4. If iterating: inject evaluator's DETAILS and ISSUES into next round's task
5. Re-implement, re-evaluate
6. Repeat until done or stopped

### Stopping Conditions

| Condition | Action | Why |
|---|---|---|
| Score >= 4.0 | Complete, mark passes:true | Quality bar met |
| 3 rounds reached | Force complete, log remaining issues in notes | Diminishing returns beyond 3 rounds; ACP cost constraint |
| Round N score <= round N-1 score | Stop, accept current result | No improvement means the feedback isn't actionable or the agent hit its ceiling |
| ACP timeout or cost limit | Stop, log reason | Resource constraint |

The 3-round cap exists because empirically, round 3 rarely improves more than 0.3 points over round 2, while costing a full implementation + evaluation cycle.

## Feedback Injection (Critical)

Each round's evaluator feedback must be specific and injected verbatim into the next task:

```
sessions_spawn({
  agentId: "<same-agent-as-previous-round>",
  task: "Continue improving {story.title}.

  Previous evaluation feedback (fix each item):
  - Correctness(3/5): file.js:47 missing timeout handling for network errors
  - Edge cases(2/5): empty array input causes NPE at processor.js:12
  - Code quality(4/5): clear naming, but handleSubmit is 80 lines - extract validation

  Address each issue and explain what you changed for each one."
})
```

Keep the same agent across rounds to preserve context about the codebase and previous changes.

## plan.json Fields

```json
{
  "id": "S-001",
  "title": "Design data model",
  "iterative": true,
  "iterationCount": 0,
  "lastScore": null,
  "iterationHistory": []
}
```

Update after each round:
```json
{
  "iterationCount": 2,
  "lastScore": 3.8,
  "iterationHistory": [
    { "round": 1, "score": 3.2, "verdict": "FAIL" },
    { "round": 2, "score": 3.8, "verdict": "PASS" }
  ]
}
```

## Relationship to Generator-Evaluator

- Generator-evaluator handles single-round evaluation for any story
- Iterative-refinement wraps generator-evaluator in a multi-round loop
- Normal stories: generator-evaluator once, PASS/FAIL
- Iterative stories: generator-evaluator per round, loop until threshold

## Common Mistakes

- Vague feedback like "make it better" (feedback must reference specific files, lines, issues)
- Iterating every story (only stories with `iterative: true`)
- Switching agents between rounds (loses context about previous changes)
- No stopping condition (always cap at 3 rounds, stop on score plateau)
