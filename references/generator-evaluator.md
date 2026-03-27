# Generator-Evaluator Pattern

Independent quality evaluation after story implementation. Enforces generator != evaluator separation with structured scoring.

**Audience:** acp-orchestrator executing plan.json stories at L2+ complexity.

**Goal:** Evaluate a completed story's output independently from the implementing agent, producing a structured score that determines PASS/FAIL.

## Why This Exists

Without independent evaluation, implementing agents self-assess as "done" when acceptance criteria appear met from their perspective. In practice, this misses edge cases, boundary conditions, and subtle quality issues roughly 30-40% of the time. Separating generator from evaluator catches these gaps before they compound across dependent stories.

## Core Principles

1. **Forced separation** - The evaluator must be a different spawn than the implementer. This means a different agent ID (e.g., implementer=codex, evaluator=claude), not just a different session of the same agent, because same-model evaluations tend toward leniency.
2. **Structured scoring** - Dimension-weighted 1-5 scores, not vibes. The structure forces the evaluator to examine each aspect rather than giving a holistic "looks good."
3. **Anti-leniency prompt** - Evaluators default to generous scoring. The prompt counteracts this by framing the role as "find problems" and anchoring 3 as the baseline for "acceptable."
4. **Orchestrator final say** - Even after evaluator PASS, the orchestrator independently checks acceptance criteria. This catches evaluator blind spots.

## Scoring Dimensions by Story Type

| Story Type | Dimensions |
|---|---|
| Feature implementation | Correctness(40%) + Code quality(30%) + Edge cases(20%) + Maintainability(10%) |
| Architecture design | Soundness(35%) + Extensibility(25%) + Simplicity(25%) + Risk identification(15%) |
| Bug fix | Root cause accuracy(40%) + Fix completeness(30%) + Regression risk(20%) + Test coverage(10%) |
| Refactor | Behavior preservation(40%) + Structure improvement(30%) + Test coverage(20%) + Simplicity(10%) |

## Execution

### Step 1: Spawn evaluator

Choose an evaluator agent that is different from the implementer. Preferred pairing: if implementer is codex, evaluator is claude (stronger reasoning catches more issues). If implementer is claude, evaluator is codex (different perspective).

```
sessions_spawn({
  agentId: "<different-from-implementer>",
  task: "Evaluate this story's output as an independent reviewer.
    Story: {id} - {title}
    acceptanceCriteria: {criteria}
    Files changed: {files}

    Score each dimension 1-5 with specific evidence:
    {insert dimensions from table above based on story type}

    Scale: 5=exceeds expectations, 4=fully meets, 3=meets with minor gaps, 2=clear problems, 1=unacceptable
    If your gut says 'fine', that's probably a 3, not a 4. Your job is to find problems.

    Output format:
    SCORE: {weighted total}
    VERDICT: PASS | FAIL
    DETAILS:
    - {dimension}: {score} - {specific evidence with file:line references}
    ISSUES:
    - {concrete fix suggestion with file and line number}"
})
```

### Step 2: Process result

- Weighted score >= 3.0: PASS, mark `passes: true`
- Weighted score < 3.0: FAIL, inject evaluator feedback into next implementation task
- After fix: re-evaluate. Max 2 fix rounds (3rd round forces PASS with issues logged in notes)

The 3.0 threshold means "every dimension at least acceptable." Below 3.0 indicates at least one dimension has clear problems that would affect dependent stories.

### Step 3: Orchestrator cross-check

Even on PASS, orchestrator verifies:
- Each acceptance criterion satisfied (check against list, not agent's claim)
- Objective verification passed (test/build green)
- No unaddressed ISSUES from evaluator

## Skip Conditions

- Documentation stories (quick/writing category)
- L1 simple tasks (single-file config/comment changes)

## Common Mistakes

- Using the same agent ID for implementation and evaluation (defeats the purpose)
- Evaluator giving holistic feedback like "overall good" without per-dimension scores
- Orchestrator trusting implementer's claim of "all criteria met" without independent check
- Evaluator feedback saying "improve this" instead of "file.js:47 missing timeout handling"
