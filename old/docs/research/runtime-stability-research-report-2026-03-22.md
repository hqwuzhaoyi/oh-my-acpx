# OpenClaw Runtime 稳定性对比调研报告（2026-03-22）

## 0. 结论摘要（给管理者先看）

在当前环境下：

1. **`runtime="subagent"` 的“父级完成可见性”显著更稳定**（规划/调研类任务推荐）
2. **`runtime="acp" + streamTo:"parent"` 在 coding 场景下存在可见性不稳定**（常见现象：`start` + `stall`，但不推送 `done`）
3. **Direct `acpx` 执行链路可用**，但属于“电话游戏”模式，集成体验弱于 runtime 编排
4. 推荐采用 **混合策略**：
   - 可见性与流程编排：`subagent`
   - 真正编码执行：`acp` 或 direct `acpx`
   - ACP 强制兜底：超时后从 child session/stream 取结果回传

---

## 1. 背景与问题

我们在生产对话中观察到：

- `runtime="subagent"` 的任务完成通告相对可靠
- `runtime="acp"`（尤其 `streamTo:"parent"`）在父级进度/完成可见性上不稳定

本报告目标：

- 对比不同运行策略的稳定性与可运维性
- 给出短中期可落地方案
- 提供团队分工研究路线

---

## 2. 调研范围与测试环境

- OpenClaw: `2026.3.13`
- ACP backend: `acpx`
- Claude Code: 已升级到 `2.1.81`
- 通道: Telegram direct topic
- 对比对象：
  1) `runtime="subagent"`
  2) `runtime="acp" + streamTo:"parent"`
  3) direct `acpx`

---

## 3. 实验与证据

### 3.1 A/B 对照（可见性）

#### A. `runtime="subagent"`
- 任务：`Reply exactly: SUBAGENT_VISIBILITY_OK`
- 结果：完成事件正常返回，父级可收到结果
- 结论：完成通告路径稳定

#### B. `runtime="acp" + streamTo:"parent"`
- 任务：`Reply exactly: SPAWN_CLAUDE_OK`
- 结果：父级 relay 仅记录 `start` + `stall`，缺少 completion

父级 relay 日志（仅两条）：

- 文件：`/Users/prajna/.openclaw/agents/claude/sessions/f1aa6c5b-75a3-4f32-bdd9-5b171502bc35.acp-stream.jsonl`
- 事件：
  - `...:start`
  - `...:stall`

但 child 侧 acpx 日志显示任务已完成：

- 文件：`/Users/prajna/.acpx/sessions/a4822bef-889a-437e-84b6-d9252b12e28b.stream.ndjson`
- 关键行：
  - `SPAWN_CLAUDE_OK`
  - `stopReason: end_turn`

**判定**：这是“可见性链路问题”，不是“执行链路问题”。

### 3.2 Direct `acpx` 可用性

- 命令：`acpx --approve-all --timeout 90 claude exec "Reply exactly: ACP_CLAUDE_45_OK"`
- 结果：成功返回 `ACP_CLAUDE_45_OK`，`[done] end_turn`
- 说明：Claude ACP 执行本身可用，问题聚焦在 parent relay / announce。

---

## 4. 策略对比（优缺点）

| 策略 | 优点 | 缺点 | 适用场景 |
|---|---|---|---|
| 全 `subagent` | 完成通告稳定、流程简单 | coding harness 能力上限不如 ACP | 规划/调研/总结、轻量实现 |
| 全 `acp + streamTo:parent` | coding 能力强、链路“正统” | 父级可见性不稳定（start/stall 但缺 done） | 纯编码且可接受兜底 |
| direct `acpx` | 可控、可诊断、当前可用性好 | 集成体验弱、需手动转发/管理 | 关键编码任务兜底 |
| 混合（推荐） | 稳定性+能力平衡最好 | 规则稍复杂 | 生产环境默认 |

---

## 5. 相关上游 Issues（重点）

### ACP `streamTo:"parent"` 相关
- #46795 ACP sessions_spawn streamTo=parent stalls
- #45205 ACP child run completes, but parent relay receives no progress/completion
- #44720 ACP mode:run without thread binding has no completion delivery
- #37869 accepted but never closes loop
- #40693 ACP sessions never trigger auto-announce
- #46439 ACP sessions don't trigger subagent_ended hook
- #49782 RFC: ACP completion relay unified approach
- #51345 runtime="acp" hangs/stalls for long timeout

仓库：<https://github.com/openclaw/openclaw/issues>

---

## 6. 推荐落地方案（当前阶段）

### 6.1 运行时路由规则（建议）

1. **规划 / 调研 / 汇总**
   - 默认 `runtime="subagent"`
2. **代码实现 / 重构 / 修改文件**
   - 默认 `runtime="acp"`
3. **ACP 可见性兜底（强制）**
   - 若 `streamTo:"parent"` 在 60~90s 内无 assistant delta：
     - 标记 relay 异常
     - 从 child session 或 acpx stream 读取结果
     - 回传用户并注明“兜底完成”

### 6.2 失败恢复策略

- `acp` 无 completion 但 child 完成：走结果回捞
- `acp` 执行失败：切换 direct `acpx`
- direct `acpx` 失败：降级 subagent（仅产出方案，不直接执行改动）

---

## 7. 团队研究计划（建议分工）

### Workstream A：可见性链路定位（平台）
- 目标：定位 `start/stall` 后 completion 丢失的事件路径
- 输出：最小复现脚本 + runId 追踪图 + 丢事件点

### Workstream B：兜底框架（应用层）
- 目标：实现统一 fallback，不让用户“黑洞等待”
- 输出：
  - 超时判定器
  - child 结果回捞器
  - 用户可读通告模板

### Workstream C：路由策略引擎（产品层）
- 目标：将“subagent 规划 + acp 编码”固化为默认策略
- 输出：规则表、回滚开关、灰度参数

### Workstream D：上游协同（社区）
- 目标：持续跟踪上游 PR/Issue，同步 patch
- 输出：每周状态快报 + 升级窗口建议

---

## 8. 验收标准（建议）

1. `runtime="subagent"`：10 次任务完成通告成功率 ≥ 99%
2. `runtime="acp"`：
   - 执行成功率 ≥ 95%
   - 兜底后用户可见完成率 ≥ 99%
3. 用户侧“无响应超时”体验：< 1%

---

## 9. 本周可执行清单

- [ ] 实装 ACP relay 超时兜底（60~90s）
- [ ] 在 orchestrator 中启用混合路由默认值
- [ ] 加入结构化埋点：`relay_start/stall/done/fallback_success`
- [ ] 每日汇总失败样本，关联 issue 编号

---

## 10. 备注

本报告结论不是“ACP 不可用”，而是：

- **ACP 执行可用**（direct acpx 已验证）
- **ACP 父级可见性链路不稳定**（需兜底与上游修复并行）

因此，当前最务实方案是 **混合策略 + 强制兜底**。
