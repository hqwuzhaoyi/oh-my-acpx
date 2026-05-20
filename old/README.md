# 参考资料 / 设计依据

- 底层能力：<https://raw.githubusercontent.com/openclaw/acpx/refs/heads/main/skills/acpx/SKILL.md>
- 最佳 skill 使用方式：<https://github.com/mattpocock/skills>
- 业内较好的方案：<https://github.com/yeachan-heo/oh-my-claudecode>
- 业内较好的方案：<https://github.com/code-yeongyu/oh-my-openagent>

# Oh My ACPX 🦞

> Plan-driven agent execution loop built on top of ACPX.

**Oh My ACPX (OMA)** 是 ACPX 之上的计划驱动型 agent 执行闭环。ACPX 负责底层 headless agent transport：session、queue、structured output、history、cancel、agent registry 等。OMA 负责上层 workflow brain：给定一个 plan，自动 routing、spawn、fallback、self-schedule，直到 story 完成或明确阻塞。

当前项目不定义为 ACPX 替代品，也不定义为 oh-my-claudecode 复制品；它的 MVP 只承诺一件事：**把 `plan → routing → spawn → fallback → self-schedule` 主执行链做成可测试、可恢复、可验证的闭环。**

详细定位见：[`docs/product-positioning.md`](docs/product-positioning.md)。

## 最小使用方式

### 1. 初始化

```bash
npm install
npm run setup
```

这会初始化：

```txt
.oma/
├── plans/
├── state/
├── logs/
├── telemetry/
├── context/
├── interviews/
└── specs/
```

### 2. 查看路由

```bash
oax route --category standard
```

### 3. 检查计划推进状态

```bash
oax run .oma/plans/plan.json
```

### 4. 环境诊断

```bash
oax doctor
```

### 5. relay 诊断

```bash
oax diagnose relay --stream-log <path>
oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>
oax diagnose stall .oma/plans/plan.json
```

### 6. 会话内继续

在宿主会话里，`acp-orchestrator` 负责读写 `.oma/` 下的计划、状态和上下文产物。

例如：

```text
继续执行 .oma/plans/plan.json
```

## 核心能力矩阵

| 能力 | 当前定位 | 当前支持度 | 用户入口 |
|---|---|---|---|
| `plan` | 任务源与状态源；把需求落成 `.oma/plans/plan.json`，供后续执行循环消费 | **已支持** | `.oma/plans/plan.json`、`oax run`、会话内“继续执行 …” |
| `ralph` | 默认的持续推进执行循环；围绕 `plan -> routing -> spawn -> fallback -> self-schedule` 反复推进，直到完成或明确阻塞 | **已支持** | 当前执行主路径、兼容脚本、CLI/operator 配合 |
| `diagnose` | 面向 operator 的诊断层；帮助用户诊断 relay / stall，而不是直接盲目重试 | **已支持** | `oax diagnose relay`、`oax diagnose relay --watch`、`oax diagnose stall` |
| `team` | 未来的并行协作执行层；把实现 / 测试 / 文档等拆 lane 协同推进 | **仅保留扩展边界** | 当前以 `docs/team-extension.md` 说明边界，后续再扩展 |

一句话心智：

> **plan 是任务源，ralph 是默认执行循环，diagnose 是运维诊断层，team 是后续并行扩展层。**

## 当前产品骨架

- `src/core/router`：任务分类 → runtime/agent/fallback 决策
- `src/core/fallback`：relay 日志解析与诊断
- `src/core/scheduler`：plan 检查与 next story 选择
- `src/cli`：`setup / route / doctor / run`
- `tests/unit`：router / fallback / scheduler 验证

## 脚本处置矩阵

关于“这些脚本还需要吗”的正式答案见：

- `docs/script-disposition.md`

当前策略是：

> **保留脚本，迁出逻辑。**

## 当前非目标

- 不做 UI/HUD 等可视化体验层
- 不做参考项目那种完整复杂的 team/swarm 实现
- 不复制 oh-my-codex / oh-my-claudecode 的全部模式体系

## 工作原理

```txt
用户/skill 入口
  ↓
.oma/plans/plan.json
  ↓
src/core/scheduler 选择 next story
  ↓
src/core/router 选择 runtime / agent / fallback policy
  ↓
ACPX 或兼容 agent path 执行
  ↓
src/core/fallback / src/core/recovery 诊断 terminal / stalled / waiting / blocked
  ↓
self-schedule 下一轮，直到 completed 或 blocked
```

当前仓库已经不再把核心逻辑继续堆在根 `SKILL.md`：
- 根 `SKILL.md`：兼容入口 shim
- `skills/acp-orchestrator/SKILL.md`：skill surface
- `src/core/*`：运行时核心
- `src/cli/*`：operator surface

兼容目标仍然保留：已有 OpenClaw skill 安装路径可以继续工作，但新逻辑应进入 `src/`。

## 快速开始

### 前置要求

1. [OpenClaw](https://openclaw.ai) 已安装且 gateway 运行中
2. ACP 已启用（`openclaw.json` 中 `acp.allowedAgents` 已配置，见下方）
3. acpx 插件已启用（`plugins.entries.acpx.enabled: true`，`permissionMode: "approve-all"`）
4. 至少一个 coding agent 可用（claude / codex / trae）

### 安装

**方式 1：symlink 到 skills 目录（推荐）**

```bash
# 克隆项目
git clone https://github.com/openclaw/oh-my-acpx.git

# 创建 symlink，OpenClaw 自动发现
ln -s "$(pwd)/oh-my-acpx" ~/.openclaw/skills/acp-orchestrator
```

**方式 2：放入 workspace（自动发现）**

```bash
# 如果项目已在 agent 的 workspace 目录下，SKILL.md 会被自动发现
# 例如放在 ~/.openclaw/workspace/oh-my-acpx/
```

**方式 3：手动复制**

```bash
# 复制整个项目到 skills 目录
cp -r oh-my-acpx ~/.openclaw/skills/acp-orchestrator
```

### 验证安装

```bash
openclaw skills list | grep acp-orchestrator
# 应显示: acp-orchestrator  ready  ...
```

### 配置 openclaw.json（必须）

**`sessions_spawn` 的 ACP agent 白名单由 `acp.allowedAgents` 控制**，不是 `agents.list`。必须显式配置，否则 `sessions_spawn` 只能看到 `main`。

```json
// ~/.openclaw/openclaw.json
{
  "acp": {
    "defaultAgent": "codex",
    "allowedAgents": ["claude", "codex", "trae", "gemini"]
  },
  "plugins": {
    "entries": {
      "acpx": {
        "enabled": true,
        "config": {
          "permissionMode": "approve-all"
        }
      }
    }
  }
}
```

> **注意**：`permissionMode` 默认是 `approve-reads`，ACP agent 执行写/执行操作时会报 `Permission denied`。必须设为 `approve-all`。

配置后重启 OpenClaw：

```bash
pkill -f openclaw && openclaw serve --daemon
```

### 配置 acpx（如需自定义 agent）

内置 agent（claude / codex / gemini）无需额外配置。`trae` 是否内置取决于 acpx 版本：

- 较旧版本：需要在 `~/.acpx/config.json` 手动添加 `agents.trae`
- 新版本（含 Trae built-in）：可直接 `acpx trae ...`

如需添加 trae-cli 或其他自定义 agent：

```bash
# 复制配置模板
cp config/acpx-config.json ~/.acpx/config.json
# 或完整版（含路由分类和 fallback 配置）
cp config/acpx-config-full.json ~/.acpx/config.json
```

## 使用

skill 安装后，在对话中使用触发词即可激活：

```
用户：用多个 agent 并行创建一个博客系统
用户：分派任务，前端 React，后端 Node.js
用户：multi-agent orchestrate this project
```

或者在对话中直接引用 skill 的能力：

```
用户：创建一个博客系统，前端 React，后端 Node.js，带测试

→ agent 自动按 SKILL.md 规则执行：
  架构设计 → claude (subagent, 稳定)
  后端 API → codex (acp, 能力强)
  前端 UI → trae (acp, 快速)
  测试    → codex (acp)
```

### 混合运行时策略

这是本项目的核心改进。基于[稳定性调研报告](docs/research/runtime-stability-research-report-2026-03-22.md)：

| 任务类型 | 运行时 | 原因 |
|---|---|---|
| 规划 / 调研 / 汇总 | `subagent` | 完成通告 ≥99% 稳定 |
| 编码 / 重构 / 修改 | `acp` + `streamTo:"parent"` | coding harness 能力更强 |

ACP relay stall 时自动降级：

```
acp + streamTo:parent → child 结果回捞 → direct acpx → subagent
```

## 类别路由

| 类别 | 任务类型 | Agent | 运行时 |
|---|---|---|---|
| ultrabrain | 复杂架构、深度推理 | claude | subagent |
| deep | 多文件重构 | claude | subagent |
| visual-engineering | 前端 UI、CSS | trae | acp |
| standard | 常规开发、CRUD | codex | acp |
| quick | 单文件、小修改 | trae | acp |
| writing | 文档、注释 | trae | subagent |
| explore | 代码搜索、调研 | codex | subagent |

## Agent 能力对比

| 特性 | trae | codex | claude |
|---|---|---|---|
| **能力** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **速度** | ⚡⚡⚡ | ⚡⚡ | ⚡ |
| **中文优化** | ✅ | ❌ | ❌ |
| **复杂架构** | ❌ | ⚠️ | ✅ |
| **快速原型** | ✅ | ✅ | ⚠️ (overkill) |

| Agent | 内置 | 需要配置 |
|---|---|---|
| claude / codex / gemini / copilot / kimi / qwen / cursor | ✅ | ❌ |
| **trae** | 版本相关（旧版❌ / 新版✅） | 旧版需在 `~/.acpx/config.json` 配置，详见 `docs/acpx-agent-config.md` |
| **pi** | ❌ | ✅ 需要在 `~/.acpx/config.json` 中配置 |

### Trae CLI 快速配置（兼容写法）

如果你所在环境的 acpx 还未内置 `trae`，加上这段即可：

```json
{
  "agents": {
    "trae": {
      "command": "trae-cli acp serve"
    }
  }
}
```

验证命令：

```bash
acpx --approve-all trae exec "Reply exactly: TRAE_OK"
```

## 项目结构

```
oh-my-acpx/
├── SKILL.md                  # 兼容入口（thin shim）
├── README.md
├── package.json
├── tsconfig.json
├── .oma/                     # 产品状态根（plans/state/logs/telemetry/context/specs）
├── skills/
│   └── acp-orchestrator/     # 正式 skill surface
├── src/
│   ├── cli/                  # oax operator surface
│   ├── core/                 # router / fallback / scheduler / recovery
│   └── integrations/         # notifications / openclaw / telemetry
├── tests/
│   ├── unit/
│   └── fixtures/
├── config/
│   ├── acpx-config.json      # acpx 基础配置模板
│   └── acpx-config-full.json # 完整配置（含路由分类和 fallback）
├── references/               # 方法论 / 参考文档
│   ├── usage-modes.md        # 5 种使用模式 + 3 种运行环境
│   ├── agent-routing.md      # Agent 能力分层、路由表、对比
│   ├── acp-fallback.md       # ACP relay stall 5 步兜底流程
│   ├── config.md             # openclaw.json / acpx 配置 + 排错
│   └── examples.md           # 实战示例 + spawn 方法论注入
├── scripts/                  # compatibility / validation layer
│   ├── self-schedule.js      # 兼容壳层
│   ├── relay-fallback.js     # 兼容壳层
│   ├── runtime-router.js     # 可被 oax route 取代的兼容入口
│   ├── stall-detector.js     # 兼容壳层
│   └── test-*.sh            # 验证资产
├── examples/
│   ├── quick-task.md
│   ├── parallel-task.md
│   └── waterfall-task.md
└── docs/
    ├── architecture.md
    ├── config.md
    ├── workflows.md
    ├── team-extension.md
    ├── script-disposition.md
    └── research/
```

## 架构

```
OpenClaw core → acpx plugin (extension) → acpx CLI → ACP JSON-RPC → coding agent
                     ↑
              ~/.openclaw/extensions/acpx/
```

当前产品结构的职责分工是：

- `skills/`：会话/workflow 入口
- `src/core/*`：可测试的执行内核
- `src/integrations/*`：外部系统与副作用集成
- `scripts/`：兼容壳层或验证资产
- `.oma/`：计划、状态、日志与上下文产物

不需要修改 OpenClaw 核心或 acpx 插件。等上游 RFC #49782（统一 relay 方案）落地后，去掉 SKILL.md 中的兜底指令即可。

## 调试工具

优先使用 `oax` 作为 operator surface，只有兼容/研究场景才直接调用 `scripts/`：

```bash
# 推荐：operator surface
oax route --category standard
oax run .oma/plans/plan.json
oax diagnose relay --stream-log <path>
oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>
oax diagnose stall .oma/plans/plan.json

# 兼容 / 研究：直接脚本
node scripts/relay-fallback.js --watch --stream-log <path> --timeout 75
node scripts/runtime-router.js --category standard
bash scripts/test-runtime-stability.sh
bash scripts/test-runtime-stability.sh --test 3  # 单跑第 3 项
```

## 已知问题

- **ACP relay 间歇性 stall**：`streamTo:"parent"` 时 parent 只收到 `start` + `stall`，无 `done`。child 实际已完成。已通过混合策略 + 降级兜底缓解。跟踪上游 [#49782](https://github.com/openclaw/openclaw/issues/49782)。
- **混合 E2E 多步工作流**：单次 agent turn 时间不足时，subagent 规划 → acp 编码的两步流程可能需要拆成多次 turn。

## 致谢

- 基于 [OpenClaw](https://openclaw.ai) ACP runtime
- 使用 [acpx](https://github.com/openclaw/acpx) 作为 ACP 客户端

## License

MIT
