# Acceptance Contract（验收契约协商）

Pre-implementation alignment for L3/L4 stories. Spawns implementing agent to confirm understanding before writing code.

**Audience:** acp-orchestrator preparing to spawn implementation for complex stories.

**Goal:** Confirm the implementing agent's understanding of a story before any code is written, catching misalignment early to prevent costly rework.

## Why This Exists

When acceptance criteria are written by the orchestrator (or user), they often contain implicit assumptions. The implementing agent fills gaps with its own assumptions, which may diverge. A 30-second confirmation round catches misalignment that would otherwise cost a full implementation-evaluate-rework cycle. This is especially valuable for L3/L4 stories where rework is expensive.

## Flow

### Step 1: Spawn confirmation (no code)

```
sessions_spawn({
  agentId: "<agent>",
  task: "Before implementing, confirm your understanding:
    Story: {id} - {title}
    acceptanceCriteria: {criteria}

    Answer these 4 questions only:
    1. How will you implement this? (1-2 sentences)
    2. Are any acceptance criteria missing or ambiguous? List suggestions.
    3. Which files will you touch?
    4. Any risks or dependencies?

    Do not write code. Only answer these questions."
})
```

### Step 2: Orchestrator reviews response

| Situation | Action |
|---|---|
| Understanding correct | Update criteria if agent suggested good additions, then spawn implementation |
| Understanding off | Correct and re-confirm (max 1 correction round) |
| Major misunderstanding | Escalate: re-split the story or clarify requirements with user |
| Agent suggested useful additions | Adopt into plan.json acceptanceCriteria |

### Step 3: Proceed to implementation

Spawn the implementation task. Include the confirmed approach and any updated criteria in the task description so the agent has full context.

## When to Use

- L3 complex tasks (multi-file changes, architecture decisions)
- L4 critical tasks (core architecture, high-risk)
- Stories with 4+ acceptance criteria
- Agent encountering this module for the first time

## When to Skip

- Quick/writing category stories (docs, comments, config)
- Acceptance criteria already include file paths or function signatures (specific enough)
- Same agent just completed a related story (already has context)
- L1 simple tasks

## Common Mistakes

- Running contract negotiation on every story (wastes time on simple tasks)
- Letting the confirmation turn into a long discussion (4 questions, short answers, max 1 correction)
- Agent starts writing code during confirmation (the "do not write code" instruction must be explicit)
- Ignoring agent's suggested additions to criteria (good suggestions should be adopted)
