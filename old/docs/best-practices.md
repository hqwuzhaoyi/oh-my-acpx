# 最佳实践指南

## 1. 能力匹配原则

### ✅ 正确做法
```
简单任务 → trae    (快速、省钱)
中等任务 → codex   (平衡)
复杂任务 → claude  (高质量)
```

### ❌ 错误做法
```
简单任务 → claude  (浪费资源)
复杂任务 → trae    (能力不足)
```

---

## 2. 并行策略

### 适合并行的场景
- 前后端分离开发
- 多模块独立功能
- 对比不同方案
- 快速探索多种可能

### 不适合并行的场景
- 有依赖关系的任务
- 需要顺序执行的步骤
- 共享可变状态的操作

### 并行数量建议
```
2-3 个 agent: 推荐
4-5 个 agent: 可接受
6+ 个 agent: 不推荐（资源竞争）
```

---

## 3. 瀑布模式

### 何时使用
- 复杂项目需要规划
- 不确定如何开始
- 需要分阶段验证

### 流程
```
1. 用 claude 做规划
2. 等待规划完成
3. 根据规划分配任务
4. 按复杂度分派 agent
5. 验证结果
```

---

## 4. 中文需求处理

### 推荐做法
```
中文需求 → trae (首选)
         → codex (备选)
         → claude (最后)
```

### 原因
- trae 是字节出品，对中文理解最好
- codex 和 claude 对中文支持一般
- 简单中文任务 trae 完全够用

---

## 5. 错误处理

### agent 输出质量差
```
原因: 能力不匹配
解决: 升级到更强 agent
      trae → codex → claude
```

### 执行超时
```
原因: 任务太复杂
解决: 
  1. 拆分任务
  2. 升级 agent
  3. 增加超时时间
```

### 权限被拒
```
原因: 没有配置权限
解决: 
  1. 加 --approve-all
  2. 修改 ~/.acpx/config.json
```

---

## 6. 资源优化

### 成本优化
```
1. 优先用 trae（最便宜）
2. 只在必要时用 claude
3. 并行数量控制在 3 个以内
```

### 速度优化
```
1. 简单任务用 trae（最快）
2. 独立任务并行执行
3. 避免不必要的等待
```

### 质量优化
```
1. 复杂任务用 claude
2. 关键代码人工 review
3. 对比多个 agent 的方案
```

---

## 7. 常见陷阱

### ❌ 忘记 streamTo: "parent"
```json
// 错误
sessions_spawn({ agentId: "trae", task: "..." })

// 正确
sessions_spawn({ agentId: "trae", streamTo: "parent", task: "..." })
```

### ❌ 用错 agent
```json
// 错误: 简单任务用 claude
sessions_spawn({ agentId: "claude", task: "修改 README" })

// 正确: 简单任务用 trae
sessions_spawn({ agentId: "trae", task: "修改 README" })
```

### ❌ 串行执行独立任务
```json
// 错误: 串行
sessions_spawn({ agentId: "trae", task: "创建组件 A" })
sessions_yield({})
sessions_spawn({ agentId: "trae", task: "创建组件 B" })
sessions_yield({})

// 正确: 并行
sessions_spawn({ agentId: "trae", task: "创建组件 A" })
sessions_spawn({ agentId: "trae", task: "创建组件 B" })
sessions_yield({})
```

---

## 8. 检查清单

### 启动前
- [ ] 任务复杂度分析完成
- [ ] 选择了合适的 agent
- [ ] 设置了 streamTo: "parent"
- [ ] 权限已配置

### 执行中
- [ ] 监控 agent 输出
- [ ] 并行数量合理
- [ ] 没有资源竞争

### 完成后
- [ ] 验证输出质量
- [ ] 必要时升级 agent 重试
- [ ] 总结经验教训
