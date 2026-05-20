# 实战示例

## 示例 1：创建博客系统

```
需求：创建一个博客系统，前端 React，后端 Node.js，带测试

Step 1: 创建 `.oma/plans/plan.json`
{
  "project": "博客系统",
  "branchName": "feat/blog-system",
  "description": "创建博客系统，前端 React，后端 Node.js，带测试",
  "stories": [
    { "id": "S-001", "title": "设计架构", "acceptanceCriteria": ["输出数据模型", "输出 API 定义"], "priority": 1, "passes": false },
    { "id": "S-002", "title": "实现后端 API", "acceptanceCriteria": ["CRUD 可用", "测试通过"], "priority": 2, "passes": false },
    { "id": "S-003", "title": "创建前端组件", "acceptanceCriteria": ["页面可渲染", "测试通过"], "priority": 2, "passes": false },
    { "id": "S-004", "title": "编写集成测试", "acceptanceCriteria": ["端到端测试通过"], "priority": 3, "passes": false }
  ]
}

Step 2: 按 priority + methodology 执行
- S-001: brainstorming → writing-plans（先探索方案再拆步骤）
- S-002 + S-003: TDD 并行执行（先写测试再实现）
- S-004: TDD（补充集成测试）
- 每个 story 完成前: verification-before-completion

Step 3: 每完成一个 story，验证 → 输出摘要 → 更新 `.oma/plans/plan.json`
```

## 示例 2：快速文档

```
需求：补充 API 文档

分析：quick 任务 → trae

执行：
sessions_spawn({
  agentId: "trae",
  streamTo: "parent",
  parentUpdates: "notify",
  task: "补充 API 接口文档和代码注释"
})
```

## 示例 3：重构遗留代码

```
需求：重构用户认证模块，支持多种登录方式

分析：deep 任务 → claude

执行：
sessions_spawn({
  agentId: "claude",
  streamTo: "parent",
  parentUpdates: "notify",
  task: "重构认证模块，支持邮箱、手机、OAuth 登录"
})
```

## 结构化评估 spawn 示例

**功能实现类 evaluator（注入反宽松提示）**
```
sessions_spawn({
  agentId: "codex",
  task: "你是独立评估者，不是实现者。评估以下 story 的产出：
    Story: S-002 - 实现用户 CRUD API
    acceptanceCriteria: ['GET/POST/PUT/DELETE 接口可用', '测试覆盖率 > 80%', '错误处理完整']
    产出文件: src/routes/users.js, tests/users.test.js

    按以下维度打分（1-5），每个维度必须给出具体理由：
    - 正确性(40%)：接口行为是否符合 acceptanceCriteria
    - 代码质量(30%)：命名、结构、可读性
    - 边界处理(20%)：错误码、空值、异常路径
    - 可维护性(10%)：是否容易扩展和修改

    评分规则：5=超出预期，4=完全满足，3=基本满足但有瑕疵，2=有明显问题，1=不可接受
    加权总分 < 3.0 → 输出 FAIL + 具体修复建议；>= 3.0 → 输出 PASS

    你的职责是找问题，不是夸奖。如果你觉得'还行'，大概率应该打 3 不是 4。
    宁可严格导致返工，也不要放过有问题的代码。"
})
```

## 验收契约协商 spawn 示例

**在正式实现前确认理解（不写代码）**
```
sessions_spawn({
  agentId: "codex",
  task: "在开始实现之前，先确认你对以下 story 的理解：
    Story: S-002 - 实现用户 CRUD API
    acceptanceCriteria: ['GET/POST/PUT/DELETE 接口可用', '测试覆盖率 > 80%']

    请回答：
    1. 你打算怎么实现？（1-2 句话）
    2. acceptanceCriteria 是否有遗漏或模糊？如有，列出补充建议
    3. 预计涉及哪些文件？
    4. 有什么风险或依赖？

    只回答以上问题，不要开始写代码。"
})
```

## spawn 方法论注入示例

**设计类 story（brainstorming → writing-plans）**
```
sessions_spawn({
  agentId: "claude",
  task: "设计博客系统架构。

**方法论要求：brainstorming → writing-plans**
1. 先探索需求边界和约束
2. 提出 2-3 种方案，推荐一种
3. 形成设计文档
4. 拆成可执行的实施计划

不要直接开始写代码。"
})
```

**Bug 修复 story（systematic-debugging → TDD）**
```
sessions_spawn({
  agentId: "claude",
  task: "修复登录超时问题。

**方法论要求：systematic-debugging → TDD**
1. 先用 systematic-debugging 定位根因（不要猜，先收集证据）
2. 定位后，写一个能复现 bug 的失败测试
3. 最小修复让测试通过
4. 确认所有现有测试仍然通过"
})
```
