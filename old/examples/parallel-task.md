# Parallel Task Example

## 需求
创建一个博客系统，前端 React，后端 Node.js，带测试

## 分析
- 多模块项目
- 前后端独立
- 可并行执行

→ **并行分配：**
- 架构设计 → claude (deep)
- 后端 API → codex (standard)
- 前端 UI → trae (visual-engineering)
- 测试 → codex (standard)

## 执行

```json
// 并行启动所有 agent
sessions_spawn({
  runtime: "acp",
  agentId: "claude",
  streamTo: "parent",
  cwd: "/projects/blog",
  task: "设计博客系统整体架构，包括数据模型、API 设计、目录结构"
})

sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  streamTo: "parent",
  cwd: "/projects/blog/backend",
  task: "实现博客后端 API，包括用户认证、文章 CRUD、评论功能"
})

sessions_spawn({
  runtime: "acp",
  agentId: "trae",
  streamTo: "parent",
  cwd: "/projects/blog/frontend",
  task: "创建博客前端 React 应用，包括首页、文章详情、登录注册页面"
})

sessions_spawn({
  runtime: "acp",
  agentId: "codex",
  streamTo: "parent",
  cwd: "/projects/blog",
  task: "为博客系统编写单元测试和集成测试"
})

// 等待所有完成
sessions_yield({ message: "等待所有 agent 完成，汇总结果" })
```

## 预期结果
- 完整的博客系统
- 前后端分离
- 带测试覆盖
- 并行执行节省时间
