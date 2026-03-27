# Story Completion Report（完成汇报）

Generates structured completion reports after each story finishes. Provides consistent progress tracking with agent, runtime, duration, score, and verification details.

**Audience:** acp-orchestrator that has just completed or failed a story.

**Goal:** Produce a consistent, structured report for each story so the user (and orchestrator) can track progress, spot patterns, and make informed decisions about remaining work.

## Why This Exists

Without structured reports, story completion is a black box: the orchestrator marks passes:true but the user has no visibility into what happened, how long it took, which agent was used, or what issues remain. Structured reports also feed the project retrospective, enabling data-driven improvements to agent selection and methodology choices.

## Report Template (PASS)

Output immediately after marking `passes: true`:

```
## S-{id}: {title}

| Field | Value |
|---|---|
| Agent | {agentId} |
| Runtime | {runtime} (acp / subagent / acpx fallback) |
| Complexity | {L1-L4} |
| Methodology | {TDD / brainstorming / debugging / none} |
| Duration | {duration or "N/A" if unavailable} |
| Evaluation score | {score} ({verdict}) |
| Iteration rounds | {count, if iterative} |

### Changes
- {file1}: {what changed}
- {file2}: {what changed}

### Verification
- Tests: {pass/fail, count}
- Build: {pass/fail}
- Lint: {pass/fail}

### Notes
{Remaining issues, special circumstances, or "None"}
```

Duration: use the elapsed time between spawn and completion if available from ACP timing data. If not available, write "N/A" rather than guessing.

## Report Template (FAIL)

```
## S-{id}: {title} - FAIL

| Field | Value |
|---|---|
| Agent | {agentId} |
| Failure reason | {evaluation failed / tests failed / ACP timeout / ...} |
| Evaluation score | {score} |
| Rounds attempted | {count} |

### Issues
{Specific problems from evaluator feedback}

### Recommended action
{Upgrade agent / split story / manual intervention}
```

## Project Summary

After all stories complete, output a project-level summary:

```
## Project Summary: {project}

| Metric | Value |
|---|---|
| Total stories | {total} |
| Passed | {passed} |
| Failed | {failed} |
| Total duration | {sum or "N/A"} |
| Average score | {mean of evaluated stories} |

### Agent distribution
- claude: {count} stories, avg score {avg}
- codex: {count} stories, avg score {avg}
- trae: {count} stories, avg score {avg}

### Methodology effectiveness
- TDD: {count} stories, avg score {avg}
- brainstorming: {count} stories, avg score {avg}

### Patterns observed
- Stories with most iteration rounds: {list}
- Lowest-scoring agent: {agent, avg}
- Most common failure reason: {reason}
```

The "patterns observed" section helps the orchestrator (and user) improve agent selection and methodology choices for future projects.

## plan.json Integration

Write report data to the story's completionReport field:

```json
{
  "id": "S-001",
  "passes": true,
  "completionReport": {
    "agent": "codex",
    "runtime": "acp",
    "complexity": "L2",
    "methodology": "TDD",
    "duration": "45s",
    "score": 3.8,
    "verdict": "PASS",
    "files": ["src/api/users.js", "tests/users.test.js"],
    "verification": { "tests": "12/12", "build": "pass", "lint": "pass" }
  }
}
```

## Timing

- Output the report immediately after each story completes (do not batch)
- FAIL stories also get reports (with failure details)
- Iterative stories report after the final round (include iteration history)
- Project summary only after all stories are done
