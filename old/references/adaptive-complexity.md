# Adaptive Complexity（自适应复杂度）

Determines process depth (L1-L4) for each story before execution begins. Routes simple tasks to lightweight flows and complex tasks to full quality gates.

**Audience:** acp-orchestrator about to execute a story from `.oma/plans/plan.json`.

**Goal:** Select the right process depth for a story so simple tasks run fast and complex tasks get proper quality gates.

## Why This Exists

Without complexity-aware routing, every story either gets the full ceremony (contract negotiation, evaluation, iteration) which wastes time on simple tasks, or gets minimal process which misses quality issues on complex tasks. Matching process depth to task difficulty is the single biggest efficiency lever in the harness.

## Complexity Levels

| Level | Criteria | Flow | Agent |
|---|---|---|---|
| L1 Simple | Single-file, docs, config, comments | Execute, verify, done | trae / codex |
| L2 Standard | Standard CRUD, regular features, tests | Methodology, verify, evaluate, done | codex |
| L3 Complex | Multi-file, architecture decisions, complex refactor | Contract, methodology, evaluate, done | codex / claude |
| L4 Critical | Core architecture, high-risk, user demands quality | Contract, iterative refinement (max 3 rounds), done | claude |

## Decision Rules

Evaluate in this order (first match wins):

```
1. category is "quick" or "writing"           -> L1
2. iterative:true or category is "ultrabrain"  -> L4
3. acceptanceCriteria count >= 4 OR files >= 3 -> L3
4. acceptanceCriteria count <= 2 AND single-file -> L1
5. default                                     -> L2
```

The category field comes from the orchestrator's task classification during plan creation (see agent-routing.md). If no category is set, infer from the story title and acceptance criteria.

### Quick Reference

| Signal | Level |
|---|---|
| Docs, comments, config changes | L1 |
| 1-2 acceptance criteria, single file | L1 |
| Standard feature implementation | L2 |
| 4+ acceptance criteria | L3 |
| 3+ files affected | L3 |
| `iterative: true` in plan.json | L4 |
| Core architecture decision | L4 |
| User says "do this well" or "design carefully" | L4 |
| Uncertain | L2 (safe default) |

## What Each Level Invokes

### L1 Simple
1. Spawn agent, execute directly
2. Objective verification (tests/build pass)
3. Mark passes:true

Skips: contract negotiation, structured evaluation, iteration

### L2 Standard
1. Inject methodology (TDD / brainstorming / debugging per story type)
2. Spawn agent, execute
3. Objective verification
4. Structured evaluation (see `references/generator-evaluator.md`)
5. PASS: done. FAIL: one fix round, then done.

### L3 Complex
1. Acceptance contract negotiation (see `references/acceptance-contract.md`)
2. Methodology execution
3. Objective verification
4. Structured evaluation
5. PASS: done. FAIL: fix and re-evaluate.

### L4 Critical
1. Acceptance contract negotiation
2. Iterative refinement (see `references/iterative-refinement.md`): methodology, evaluate, feedback loop, max 3 rounds, score >= 4.0 target
3. Done

## Complexity Escalation

During execution, if evidence suggests higher complexity than initially assessed:

| Signal | Action |
|---|---|
| L1 story fails evaluation | Escalate to L2, add structured evaluation |
| L2 story fails after fix round | Escalate to L3, add contract negotiation |
| L3 story touches core architecture | Escalate to L4, enable iterative refinement |

Complexity only escalates, never downgrades. This prevents oscillation and ensures quality issues get progressively more attention.

## Common Mistakes

- Running L4 on every story (wastes time and ACP budget)
- Running L1 on architecture decisions (misses quality issues that compound)
- Defaulting to L1 when uncertain (L2 is the safe default because it includes evaluation)
- Skipping escalation when a story fails (failure is a signal that the process was too light)
