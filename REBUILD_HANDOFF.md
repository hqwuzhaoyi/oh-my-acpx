# oh-my-acpx Rebuild Handoff

Copy this brief into a new agent window to continue the rebuild.

## Message to send in the new window

```text
继续重建 /Users/admin/workspace/oh-my-acpx。

背景：
我要求把旧内容全部移动到 old/，然后按新的产品定位重写仓库。上一个窗口已经开始执行，当前状态可能是：
- 旧内容大部分已移动到 old/
- 根目录已新建 package.json、tsconfig.json、.gitignore
- 已新建 CONTEXT.md
- 已新建 docs/adr/0001-oma-run-defaults-to-offload-proposal.md
- 已新建 docs/adr/0002-use-unified-auxiliary-task-return-schema.md
- 已创建部分目录：src/core/offload、src/cli、tests/unit、docs/adr、.oma/plans、.oma/artifacts、skills/acp-orchestrator
请先检查现状，不要假设全部完成。

新的产品定位：
oh-my-acpx / OMA 是 Host Agent 的 context-saving auxiliary offload sidecar，不是 ACPX 替代品，也不是全流程 agent runtime。

核心边界：
1. Host Agent owns main context and Host Plan.
2. OMA only consumes an Offload Plan.
3. OMA only offloads bounded Auxiliary Tasks to ACPX when doing so saves context.
4. `oma run` 默认只产出 Offload Proposal，不执行 ACPX。
5. `oma run --execute` 才进入 Execute Mode，可调用 ACPX。
6. OMA 必须返回统一结构化 Auxiliary Task Return。
7. `completed` 只表示 auxiliary task completed，不表示 Host Plan completed。
8. 不做 full team/swarm、UI/HUD、大而全 autopilot。

请完成重建：
- 保留 old/ 作为旧实现归档，不要动 .git。
- 重写 README.md，说明 OMA sidecar 定位、最小使用方式、能力边界。
- 写 skills/acp-orchestrator/SKILL.md，作为薄入口，告诉 Host Agent 什么时候调用 OMA、什么时候不要调用。
- 实现最小 TypeScript 核心：
  - src/core/offload/types.ts
  - src/core/offload/plan.ts
  - src/core/offload/proposal.ts
  - src/core/offload/return.ts
  - src/core/offload/index.ts
- 实现 CLI：
  - src/cli/index.ts
  - `oma setup`
  - `oma run [plan-path]`
  - `oma run [plan-path] --execute`
  - `oma schema`
- 默认 `oma run` 输出 OFFLOAD_READY proposal。
- `--execute` 先做 fake/local execute，不真实调用 ACPX；生成 Auxiliary Task Return，方便先打通 schema。
- 添加 .oma/plans/plan.json 示例。
- 添加 tests/unit/offload.test.ts，覆盖：
  - missing plan -> NO_PLAN
  - all tasks done -> ALL_DONE
  - pending task -> OFFLOAD_READY proposal
  - --execute fake path -> Auxiliary Task Return completed
  - completed 不代表 Host Plan completed
- 跑：
  - npm install 如需要
  - npm run build
  - npm run typecheck
  - npm test
- 最终汇报 changed files、验证结果、剩余风险。

注意：
不要把旧代码再搬回来当主体。old/ 是归档。
不要继续沿用“主执行链 runtime”语义；全部用 Host Agent / Offload Plan / Auxiliary Task / Offload Proposal / Auxiliary Task Return 语义。
```

## Short version

```text
继续重建 /Users/admin/workspace/oh-my-acpx：旧内容已/应归档到 old/，按 OMA = Host Agent 的 context-saving auxiliary offload sidecar 重写仓库。实现最小 TS CLI：oma setup、oma run 默认输出 Offload Proposal、oma run --execute fake 执行并输出 Auxiliary Task Return、oma schema；补 README、SKILL.md、CONTEXT.md、ADR、示例 plan、单测；跑 build/typecheck/test。不要恢复旧主体，不要把 OMA 设计成全流程 ACPX runtime。
```

## Current confirmed product language

- **Host Agent** owns the main context, Host Plan, and final integration.
- **OMA** consumes an Offload Plan and offloads bounded Auxiliary Tasks.
- **ACPX** is lower-level headless agent transport.
- `oma run` defaults to an **Offload Proposal**.
- `oma run --execute` enters **Execute Mode**.
- OMA returns a unified **Auxiliary Task Return**.
- `completed` only means auxiliary task completed.

## Verification checklist

Run before reporting done:

```bash
npm run build
npm run typecheck
npm test
node dist/src/cli/index.js setup
node dist/src/cli/index.js run .oma/plans/plan.json
node dist/src/cli/index.js run .oma/plans/plan.json --execute
node dist/src/cli/index.js schema
```
