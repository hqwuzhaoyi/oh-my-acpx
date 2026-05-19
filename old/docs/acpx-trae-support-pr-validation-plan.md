# acpx 官方 PR（Trae 支持）验证计划

## PR 信息
- 仓库：`openclaw/acpx`
- PR：#170
- 链接：https://github.com/openclaw/acpx/pull/170
- 标题：`feat: add built-in Trae agent command mapping`

## 目标
验证将 `trae` 作为 acpx 内置 agent 后，能在无额外本地配置的情况下稳定工作。

## 改动范围
- `src/agent-registry.ts`
  - 新增：`trae -> trae-cli acp serve`
- `test/agent-registry.test.ts`
  - 更新 built-in 列表断言
- 文档：
  - `README.md`
  - `agents/README.md`
  - `agents/Trae.md`（新增）

## 团队分工

### 1) Runtime 验证组
- 关注点：命令解析、session 生命周期、prompt/exec 行为
- 用例：
  - `acpx trae sessions new`
  - `acpx trae exec "Reply exactly: TRAE_OK"`
  - `acpx trae sessions history`
- 通过标准：命令可执行、结果可回收、无异常崩溃

### 2) Integration 验证组（OpenClaw）
- 关注点：OpenClaw `runtime="acp"` 调度 Trae 端到端
- 用例：
  - `sessions_spawn(runtime:"acp", agentId:"trae", mode:"run", streamTo:"parent")`
- 通过标准：child 执行成功；若 parent relay 异常，兜底链路可取回结果

### 3) Docs 验证组
- 关注点：内置 agent 列表一致性、可复制示例正确
- 检查项：
  - README built-in 表含 `trae`
  - agents/README 与 Trae.md 一致
  - 命令示例可运行

## 风险与回滚
- 风险：用户环境未安装 `trae-cli`，会出现找不到命令
- 处置：
  - 文档中提示安装 Trae CLI
  - 保持 `agents` 覆盖配置可用（用户可自定义 command）

## 验收标准
- Runtime 通过率：100%
- Integration 核心路径通过（含兜底）：100%
- Docs 检查项全部通过

## 当前状态
- PR 已创建，等待 review
- 本文档用于团队并行验证执行
