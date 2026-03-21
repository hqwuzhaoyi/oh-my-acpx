# Waterfall Task Example

## 需求
重构遗留的用户认证系统，支持多种登录方式

## 分析
- 复杂重构
- 需要先规划
- 分阶段执行

→ **瀑布模式：** 先规划 → 后执行

## 阶段 1：规划

```json
sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  streamTo: "parent",
  cwd: "/projects/auth-system",
  task: "分析现有认证系统，设计重构方案，支持：1) 邮箱密码 2) 手机验证码 3) OAuth (微信/Google/GitHub)。输出详细的实现计划。"
})

// 等待规划完成
sessions_yield({ message: "等待架构设计方案" })
```

## 阶段 2：执行

根据规划结果，分任务执行：

```json
// 任务 1：核心认证逻辑（复杂）
sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  streamTo: "parent",
  task: "实现核心认证逻辑，包括 JWT、Session 管理、多策略路由"
})

// 任务 2：OAuth 集成（中等）
sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  streamTo: "parent",
  task: "实现 OAuth 登录集成（微信、Google、GitHub）"
})

// 任务 3：手机验证码（简单）
sessions_spawn({
  runtime: "acp",
  agentId: "trae",
  streamTo: "parent",
  task: "实现手机验证码登录功能"
})

// 任务 4：前端登录页面（简单）
sessions_spawn({
  runtime: "acp",
  agentId: "trae",
  streamTo: "parent",
  task: "创建登录页面 UI，支持多种登录方式切换"
})

sessions_yield({ message: "等待所有实现完成" })
```

## 预期结果
- 完整的重构方案
- 分阶段、可控的执行
- 复杂任务由 claude 处理
- 简单任务由 trae 快速完成
