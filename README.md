# Oh My ACPX 🦞

> Multi-agent orchestration skill for OpenClaw ACP runtime.

**Oh My ACPX** 是一个 OpenClaw skill，实现多 agent 智能调度——根据任务类型自动选择最佳运行时和 agent（trae / codex / claude），并内置 ACP relay stall 的降级兜底。

## 工作原理

```
你的对话 → OpenClaw 加载 acp-orchestrator skill
                     ↓
            agent 按 SKILL.md 中的规则执行：
            ├── 规划/调研 → sessions_spawn(runtime:"subagent")  ← 完成通告稳定
            ├── 编码/重构 → sessions_spawn(runtime:"acp")       ← 能力更强
            └── relay stall → sessions_history() 回捞 → acpx → subagent 降级
```

核心逻辑全部内联在 `SKILL.md` 中，agent 读取后自动执行，完全兼容 OpenClaw 官方插件体系，无外部依赖。

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

这是本项目的核心改进。基于[稳定性调研报告](docs/runtime-stability-research-report-2026-03-22.md)：

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
├── SKILL.md                  # Skill 定义（OpenClaw 加载这个文件）
├── README.md                 # 本文件
├── config/
│   ├── acpx-config.json      # acpx 基础配置模板
│   └── acpx-config-full.json # 完整配置（含路由分类和 fallback）
├── scripts/                  # 工具脚本
│   ├── self-schedule.js      # 自调度检查（每个 turn 结束前运行，运行时依赖）
│   ├── relay-fallback.js     # ACP relay 兜底诊断（人工调试用）
│   ├── runtime-router.js     # 路由规则查询（人工调试用）
│   └── test-runtime-stability.sh  # 稳定性测试套件
├── examples/
│   ├── quick-task.md
│   ├── parallel-task.md
│   └── waterfall-task.md
└── docs/
    ├── agents.md
    ├── best-practices.md
    ├── acp-relay-fallback.md
    ├── acpx-agent-config.md
    └── runtime-stability-research-report-2026-03-22.md
```

## 架构

```
OpenClaw core → acpx plugin (extension) → acpx CLI → ACP JSON-RPC → coding agent
                     ↑
              ~/.openclaw/extensions/acpx/
```

`SKILL.md` 作为 orchestrator agent 的行为指令被加载。Agent 读取后：
- 按路由表选择 runtime 和 agent
- 调用 `sessions_spawn` / `sessions_yield` 执行任务
- relay stall 时按降级链路自动恢复

不需要修改 OpenClaw 核心或 acpx 插件。等上游 RFC #49782（统一 relay 方案）落地后，去掉 SKILL.md 中的兜底指令即可。

## 调试工具

`scripts/` 目录下的工具用于**人工诊断**，不是运行时依赖：

```bash
# 诊断 relay 状态
node scripts/relay-fallback.js --stream-log <path>

# 实时监控 + 自动兜底
node scripts/relay-fallback.js --watch --stream-log <path> --timeout 75

# 查询路由规则
node scripts/runtime-router.js --category standard

# 跑稳定性测试套件
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
