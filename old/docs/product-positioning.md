# Product Positioning

## One-line Definition

**Oh My ACPX (OMA) is a plan-driven agent execution loop built on top of ACPX.**

ACPX provides the low-level headless transport for agent sessions. OMA provides the workflow brain above it: given a plan, OMA routes work, spawns execution, diagnoses failures, falls back when needed, and self-schedules the next step until each story is completed or explicitly blocked.

In Chinese:

> **OMA 是 ACPX 之上的计划驱动型 agent 执行闭环。**
>
> ACPX 负责把 prompt 稳定送到 agent；OMA 负责判断下一步该做什么、找谁做、失败后怎么恢复、什么时候停止。

## Why This Project Exists

The missing layer is not another agent transport and not another large workflow prompt collection. The missing layer is a small runtime that can close the engineering loop:

```txt
plan -> routing -> spawn -> fallback -> self-schedule
```

The project is successful when a structured plan can be advanced to one of two terminal outcomes:

- `completed` — the story is done and has evidence
- `blocked` — the story cannot safely continue and the blocker is explicit

## Reference Model

### ACPX: Lower-level capability

ACPX is the bottom layer. It gives OMA access to headless agent execution primitives such as persistent sessions, queued prompts, named parallel sessions, structured output, cancellation, session history, and agent registry/config behavior.

OMA should use those primitives rather than duplicate them.

### mattpocock/skills: Skill shape

The skill surface should stay small, composable, and easy to adapt. A skill should express when and how to enter the workflow; it should not become the runtime implementation.

For OMA this means:

- root `SKILL.md` remains a compatibility entrypoint
- `skills/acp-orchestrator/SKILL.md` is the canonical skill surface
- core behavior belongs in `src/core/*`
- operator commands belong in `src/cli/*`

### oh-my-claudecode: Product inspiration, not implementation scope

oh-my-claudecode shows that agent orchestration benefits from named workflows, persistent execution loops, team-style coordination, and operator feedback. OMA should borrow that product layering, but not copy the full platform complexity into the MVP.

In the current phase, full `team/swarm`, UI/HUD, analytics, and broad provider orchestration are deferred.

## Product Boundaries

### OMA is

- a plan-driven execution runtime
- a workflow brain over ACPX
- a CLI + skill surface around `.oma/` state
- a small closed-loop orchestrator for story progress
- a foundation for future team/swarm execution

### OMA is not

- an ACPX replacement
- a direct oh-my-claudecode clone
- a general skill marketplace
- a UI/HUD product in the MVP
- a full multi-provider orchestration platform in the MVP

## Layering

```txt
Skill Layer
  User-facing workflow entrypoints and host-session instructions

Plan Layer
  .oma/plans/plan.json as the canonical story and status source

Runtime Loop Layer
  plan -> routing -> spawn -> fallback -> self-schedule

ACPX Integration Layer
  acpx session, prompt, queue, cancellation, history, and JSON-output primitives

Operator Layer
  oax setup / run / route / doctor / diagnose
```

## Core Concepts

| Concept | Definition |
|---|---|
| `.oma/` | The only product runtime state root for OMA |
| `plan` | Canonical task/story source consumed by the runtime loop |
| `story` | The smallest unit that can be advanced to completed or blocked |
| `route` | Selection of runtime, agent, fallback policy, and execution shape |
| `spawn` | Starting work through ACPX or a compatible local agent path |
| `fallback` | Diagnosing stalled, failed, waiting, or ambiguous execution states |
| `self-schedule` | Selecting the next story/step or stopping with a terminal state |
| `ralph` | The persistence loop persona/compatibility name over the runtime loop |
| `team` | A future parallel execution extension, not the MVP's main path |

## MVP Promise

The MVP should make these commands coherent and evidence-backed:

```bash
oax setup
oax run .oma/plans/plan.json
oax route --category standard
oax diagnose relay --stream-log <path>
oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>
oax diagnose stall .oma/plans/plan.json
```

The main acceptance criterion is not the number of modes. It is whether `oax run` and the in-session skill path can advance a plan story through routing, execution, fallback, and self-scheduling until the story is completed or explicitly blocked.
