# TODO 2 验证报告：多轮编排（解决 T6 单 turn 限制）

> 验证日期：2026-03-22
> 验证者：Claude + 自动化测试脚本

## 背景

T6 测试发现：在单次 `openclaw agent` turn 中，瀑布模式（先 subagent 规划再 acp 编码）的 Step 2 不会执行。原因是 `sessions_yield` 等待 + 第二次 spawn 超出了单 turn 时间窗口，agent 在 Step 1 spawn 后就 `end_turn` 了。

## 测试方案与结果

### 方案 A：持久 session + 多次 agent turn ✅

**方法**：使用 `openclaw agent --session-id <固定id>` 发送多次 message，同一 session 跨 turn 保持对话历史。

**结果**：
- Turn 1 成功生成规划并输出 marker
- Turn 2 成功引用 Turn 1 的规划内容并输出执行确认
- 总耗时 49 秒（2 turns）

**结论**：`--session-id` 是跨 turn 编排的**首选方案**。简单、可靠、agent 天然保持上下文。

### 方案 B：sessions_history 跨 session 恢复 ❌

**方法**：在新 session 中调用 `sessions_history(oldSessionKey)` 恢复之前 session 的内容。

**结果**：
- Turn 1 正常写入内容
- Turn 2 agent 报告 `RECOVERY_STATUS: TOOL_UNAVAILABLE`
- sessions_history 工具不在 agent 的可调用工具列表中

**结论**：sessions_history 在当前 agent turn 模式下**不可用**。这不是 API 问题，而是 agent 的 tool allow list 限制。此方案在当前架构下不可行。

### 方案 C：自调度循环（NEXT_STEP 驱动）✅

**方法**：agent 在每个 turn 中只完成一个步骤，输出 `NEXT_STEP: <描述>` 标记。外部 bash 脚本检测标记并自动触发下一个 turn。

**结果**：
- Turn 1: Step 1 完成 + NEXT_STEP 输出 ✅
- Turn 2: Step 2 完成 + NEXT_STEP 输出 ✅
- Turn 3: Step 3 完成 + ALL_DONE 输出 ✅
- 所有 3 个步骤 marker 均已验证
- 总耗时 39 秒（3 turns）

**结论**：自调度循环是**全自动场景的首选**。agent 天然理解"一步一 turn"的约束，外部驱动逻辑极简。

## 方案对比

| 维度 | 方案 A（持久 session） | 方案 B（sessions_history） | 方案 C（自调度） |
|------|----------------------|--------------------------|-----------------|
| **可行性** | ✅ 可行 | ❌ 不可行 | ✅ 可行 |
| **上下文保持** | 自动（同一 session） | N/A | 自动（同一 session） |
| **自动化程度** | 半自动（需外部触发每步） | N/A | 全自动（NEXT_STEP 驱动） |
| **人工干预** | 可在 turn 之间介入 | N/A | 可选介入 |
| **复杂度** | 低 | 中 | 中 |
| **适用场景** | 需人工确认的多步任务 | — | CI/CD、批处理 |

## 推荐

1. **默认使用方案 A**（持久 session）：简单可靠，适合大多数瀑布式任务
2. **自动化场景用方案 C**（自调度循环）：全自动，适合无人值守执行
3. **方案 B 暂不可行**：等待 sessions_history 加入 agent tool allow list（可关联上游追踪）

## 对 SKILL.md 的影响

需要更新 SKILL.md 的模式 3（瀑布式），从"单 turn 尝试"改为"多 turn 编排"：
- 添加持久 session 使用说明
- 添加 NEXT_STEP 自调度协议
- 标注单 turn 瀑布式的限制

## 测试产物

- 测试脚本：`scripts/test-multi-turn-orchestration.sh`
- 测试输出：`test-results/todo2-A-turn{1,2}.json`, `todo2-B-turn{1,2}.json`, `todo2-C-turn{1,2,3}.json`
- 更新示例：`examples/waterfall-task.md`
