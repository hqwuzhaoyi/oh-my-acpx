# 配置参考与错误排查

## openclaw.json（关键）

`sessions_spawn` 的 ACP agent 白名单由 `acp.allowedAgents` 控制，**不是** `agents.list`。

```json
// ~/.openclaw/openclaw.json
{
  // 1. acp.allowedAgents 控制 sessions_spawn 能调用哪些 ACP agent
  "acp": {
    "defaultAgent": "codex",
    "allowedAgents": ["claude", "codex", "trae", "gemini"]
  },

  // 2. acpx permissionMode 必须设为 approve-all
  "plugins": {
    "entries": {
      "acpx": {
        "enabled": true,
        "config": {
          "permissionMode": "approve-all"
        }
      }
    }
  },

  // 3. agents.list 中注册持久化 ACP agent（可选，减少冷启动延迟）
  "agents": {
    "list": [
      { "id": "claude", "runtime": { "type": "acp", "acp": { "agent": "claude", "backend": "acpx", "mode": "persistent" } } },
      { "id": "codex",  "runtime": { "type": "acp", "acp": { "agent": "codex",  "backend": "acpx", "mode": "persistent" } } },
      { "id": "trae",   "runtime": { "type": "acp", "acp": { "agent": "trae",   "backend": "acpx", "mode": "persistent" } } },
      { "id": "gemini", "runtime": { "type": "acp", "acp": { "agent": "gemini", "backend": "acpx", "mode": "persistent" } } }
    ]
  }
}
```

## ~/.acpx/config.json

```json
{
  "defaultAgent": "codex",
  "defaultPermissions": "approve-all",
  "nonInteractivePermissions": "deny",
  "agents": {
    "trae": {
      "command": "trae-cli acp serve"
    },
    "gemini": {
      "command": "gemini --experimental-acp"
    }
  }
}
```

## Gemini CLI 兼容性

- 较新的 Gemini CLI 可直接使用 `gemini --acp`
- 旧版（如 `0.22.x`）可能需要 `--experimental-acp`
- 如果报 `Unknown argument: acp`，在 `~/.acpx/config.json` 中覆盖 command

## 常见错误排查

| 问题 | 原因 | 解决 |
|---|---|---|
| sessions_spawn 只看到 `main` | `acp.allowedAgents` 未配置 | 加上 `acp.allowedAgents` 并重启 |
| ACP agent 报 Permission denied | `permissionMode` 默认是 `approve-reads` | 设置 `permissionMode: "approve-all"` |
| ACP relay 只有 start+stall | 父级可见性链路断裂 | 按兜底流程 Step 3 回捞 |
| agent 输出质量差 | 能力不匹配 | 升级到更强 agent |
| 执行超时 | 任务太复杂 | 拆分任务或换 agent |
| spawn 失败 | agentId 错误 | 检查 `acp.allowedAgents` 配置 |
| agent 跳过 TDD 直接写代码 | spawn 指令方法论不够明确 | task 描述中加粗方法论要求 |
| agent 说"已完成"但没跑测试 | 未执行 verification | 要求 agent 先运行验证命令 |
