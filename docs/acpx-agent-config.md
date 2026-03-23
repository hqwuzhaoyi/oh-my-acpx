# ACPX Agent 配置指南

完整的 acpx agent 配置文档，覆盖所有主流 coding agent。

## 目录

- [配置文件位置](#配置文件位置)
- [配置格式](#配置格式)
- [内置 Agent](#内置-agent)
- [自定义 Agent](#自定义-agent)
- [常见问题](#常见问题)

---

## 配置文件位置

acpx 读取配置的顺序（后者覆盖前者）：

1. **全局配置**: `~/.acpx/config.json`
2. **项目配置**: `<project>/.acpxrc.json`
3. **命令行参数**: `acpx --option value`

推荐：全局配置放在 `~/.acpx/config.json`，项目特定配置放在 `.acpxrc.json`。

---

## 配置格式

```json
{
  "defaultAgent": "codex",
  "defaultPermissions": "approve-all",
  "nonInteractivePermissions": "deny",
  "authPolicy": "skip",
  "ttl": 300,
  "timeout": null,
  "format": "text",
  "agents": {
    "agent-name": {
      "command": "command-to-start-acp-server",
      "description": "可选描述"
    }
  }
}
```

---

## 内置 Agent

以下 agent **无需配置**，acpx 已内置：

### 1. Claude Code

```bash
# 使用方式
acpx claude "你的任务"
acpx claude exec "一次性任务"
acpx claude sessions new
```

**内置命令**: `npx -y @zed-industries/claude-agent-acp`

**特点**:
- ⭐⭐⭐⭐⭐ 能力最强
- 深度推理、复杂架构
- 需要 Anthropic API key

**前置要求**:
```bash
# 配置 Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

### 2. Codex (OpenAI)

```bash
# 使用方式
acpx codex "你的任务"
acpx codex exec "一次性任务"
```

**内置命令**: `npx @zed-industries/codex-acp`

**特点**:
- ⭐⭐⭐ 能力平衡
- 常规开发、API 实现
- 需要 OpenAI API key

**前置要求**:
```bash
# 配置 OpenAI API key
export OPENAI_API_KEY="sk-..."
```

---

### 3. Gemini CLI

```bash
# 使用方式
acpx gemini "你的任务"
```

**内置命令**: `gemini --acp`

**前置要求**:
```bash
# 安装 Gemini CLI
npm install -g @anthropic-ai/gemini-cli

# 配置 Google API key
export GOOGLE_API_KEY="..."
```

---

### 4. Cursor

```bash
# 使用方式
acpx cursor "你的任务"
```

**内置命令**: `cursor-agent acp`

**前置要求**:
- 安装 Cursor IDE
- Cursor CLI 在 PATH 中

---

### 5. GitHub Copilot

```bash
# 使用方式
acpx copilot "你的任务"
```

**内置命令**: `copilot --acp --stdio`

**前置要求**:
```bash
# 安装 GitHub Copilot CLI
npm install -g @githubnext/github-copilot-cli

# 登录
gh auth login
```

---

### 6. Kimi CLI

```bash
# 使用方式
acpx kimi "你的任务"
```

**内置命令**: `kimi acp`

**前置要求**:
```bash
# 安装 Kimi CLI
pip install kimi-cli

# 配置 Moonshot API key
export MOONSHOT_API_KEY="..."
```

---

### 7. Qwen Code

```bash
# 使用方式
acpx qwen "你的任务"
```

**内置命令**: `qwen --acp`

**前置要求**:
```bash
# 安装 Qwen Code
pip install qwen-code

# 配置阿里云 API key
export DASHSCOPE_API_KEY="..."
```

---

### 8. OpenCode

```bash
# 使用方式
acpx opencode "你的任务"
```

**内置命令**: `npx -y opencode-ai acp`

---

### 9. Kilocode

```bash
# 使用方式
acpx kilocode "你的任务"
```

**内置命令**: `npx -y @kilocode/cli acp`

---

### 10. Kiro

```bash
# 使用方式
acpx kiro "你的任务"
```

**内置命令**: `kiro-cli acp`

---

### 11. Droid (Factory)

```bash
# 使用方式
acpx droid "你的任务"
# 或
acpx factory-droid "你的任务"
```

**内置命令**: `droid exec --output-format acp`

---

### 12. iFlow

```bash
# 使用方式
acpx iflow "你的任务"
```

**内置命令**: `iflow --experimental-acp`

---

## 自定义 Agent

### Trae CLI (ByteDance)

Trae 的配置与 acpx 版本有关：

- **稳定版 acpx（当前多数环境）**：通常需要手动配置 `agents.trae`
- **包含 Trae built-in 的分支/新版本**：可直接 `acpx trae ...`，无需手动配置

#### A) 稳定版 acpx：手动配置（推荐兼容写法）

```json
// ~/.acpx/config.json
{
  "agents": {
    "trae": {
      "command": "trae-cli acp serve"
    }
  }
}
```

#### B) built-in 版本 acpx：可选清理

当你确认所用 acpx 已内置 `trae -> trae-cli acp serve` 后，`agents.trae` 可删除。

**前置要求**:
```bash
# 安装 trae-cli (根据官方文档)
# 配置登录
trae-cli config edit
```

**使用方式**:
```bash
acpx trae "你的任务"
acpx --approve-all trae exec "创建一个 vite 项目"
```

---

### Pi Coding Agent

**需要手动配置**:

```json
// ~/.acpx/config.json
{
  "agents": {
    "pi": {
      "command": "npx -y pi-acp"
    }
  }
}
```

**前置要求**:
```bash
npm install -g @mariozechner/pi-coding-agent
```

---

### 自定义本地 Agent

如果你想接入自己的 ACP server：

```json
// ~/.acpx/config.json
{
  "agents": {
    "my-agent": {
      "command": "/path/to/my-acp-server --mode stdio"
    }
  }
}
```

**使用方式**:
```bash
acpx my-agent "任务"
```

---

### 临时使用未配置的 Agent

无需修改配置文件，直接使用 `--agent` 参数：

```bash
acpx --agent "trae-cli acp serve" "你的任务"
acpx --agent "./bin/my-agent" "任务"
```

---

## 完整配置示例

### 示例 1：基础配置（使用内置 agent）

```json
{
  "defaultAgent": "codex",
  "defaultPermissions": "approve-all",
  "nonInteractivePermissions": "deny",
  "authPolicy": "skip",
  "ttl": 300
}
```

**无需配置 agents**，所有内置 agent 都可用（`trae` 是否内置取决于 acpx 版本，见下方示例 2）。

---

### 示例 2：添加 Trae 支持

```json
{
  "defaultAgent": "codex",
  "defaultPermissions": "approve-all",
  "nonInteractivePermissions": "deny",
  "authPolicy": "skip",
  "ttl": 300,
  "agents": {
    "trae": {
      "command": "trae-cli acp serve"
    }
  }
}
```

---

### 示例 3：完整配置（所有 agent）

```json
{
  "$schema": "https://raw.githubusercontent.com/openclaw/acpx/main/config.schema.json",
  
  "defaultAgent": "codex",
  "defaultPermissions": "approve-all",
  "nonInteractivePermissions": "deny",
  "authPolicy": "skip",
  "ttl": 300,
  "timeout": null,
  "format": "text",
  
  "agents": {
    "trae": {
      "command": "trae-cli acp serve",
      "description": "ByteDance Trae - fast, Chinese optimized"
    },
    "pi": {
      "command": "npx -y pi-acp",
      "description": "Pi Coding Agent"
    }
  },
  
  "auth": {
    "anthropic": "sk-ant-...",
    "openai": "sk-..."
  }
}
```

---

## 权限配置

### defaultPermissions 选项

| 值 | 说明 |
|---|---|
| `approve-all` | 自动批准所有权限请求（推荐） |
| `approve-reads` | 只自动批准读操作，写操作需确认 |
| `deny-all` | 拒绝所有权限请求 |

### nonInteractivePermissions 选项

非交互模式（无 TTY）时的行为：

| 值 | 说明 |
|---|---|
| `deny` | 拒绝所有权限请求（默认） |
| `fail` | 抛出错误，停止执行 |

---

## 常见问题

### Q: 为什么 acpx trae 报错 "Failed to spawn agent: trae"？

**A**: 常见是两种原因：

1. 你使用的 acpx 版本还未内置 `trae`
2. `trae-cli` 不在 PATH 中

先用兼容配置兜底：

```json
{
  "agents": {
    "trae": {
      "command": "trae-cli acp serve"
    }
  }
}
```

并确认：

```bash
which trae-cli
trae-cli acp --help
```

---

### Q: 如何查看当前配置？

```bash
acpx config show
```

---

### Q: 如何测试 agent 是否配置正确？

```bash
acpx trae exec "say hello"
```

---

### Q: agent 需要 API key 怎么办？

**方式 1**: 环境变量
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

**方式 2**: 配置文件
```json
{
  "auth": {
    "anthropic": "sk-ant-...",
    "openai": "sk-..."
  }
}
```

---

### Q: 如何切换默认 agent？

**方式 1**: 修改配置
```json
{
  "defaultAgent": "claude"
}
```

**方式 2**: 命令行指定
```bash
acpx claude "任务"
```

---

### Q: 项目级配置如何覆盖全局配置？

在项目根目录创建 `.acpxrc.json`：

```json
{
  "defaultAgent": "trae"
}
```

项目配置会覆盖全局配置。

---

## Agent 对比表

| Agent | 内置? | 命令 | 能力 | 速度 | 中文 |
|---|---|---|---|---|---|
| **claude** | ✅ | `npx @zed-industries/claude-agent-acp` | ⭐⭐⭐⭐⭐ | ⚡ | ❌ |
| **codex** | ✅ | `npx @zed-industries/codex-acp` | ⭐⭐⭐ | ⚡⚡ | ❌ |
| **trae** | 版本相关（旧版❌ / 新版✅） | `trae-cli acp serve` | ⭐⭐ | ⚡⚡⚡ | ✅ |
| **gemini** | ✅ | `gemini --acp` | ⭐⭐⭐⭐ | ⚡⚡ | ❌ |
| **copilot** | ✅ | `copilot --acp --stdio` | ⭐⭐⭐ | ⚡⚡ | ❌ |
| **kimi** | ✅ | `kimi acp` | ⭐⭐⭐ | ⚡⚡ | ✅ |
| **qwen** | ✅ | `qwen --acp` | ⭐⭐⭐ | ⚡⚡ | ✅ |
| **cursor** | ✅ | `cursor-agent acp` | ⭐⭐⭐⭐ | ⚡⚡ | ❌ |

---

## 相关链接

- [acpx GitHub](https://github.com/openclaw/acpx)
- [acpx 文档](https://docs.openclaw.ai/cli/acp)
- [Agent Client Protocol](https://agentclientprotocol.com/)
- [Trae CLI 文档](https://docs.trae.cn/cli)
- [Claude Code](https://claude.ai/code)
- [Codex CLI](https://codex.openai.com)
