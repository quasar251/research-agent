# 核心流程功能测试 Functional Test

> 本文定义研小报**核心主线**的功能测试规格，覆盖 `agent-core.md` §6 的运行时视图（align → collect → verify → synthesize）。
> 目标是验证 State 状态机 + Orchestration 派发/缺口的正确性，不含对扩展模块（Context/Memory/Skill/Tool/Security）的深度测试。

---

## 1. 测试范围

核心主线一次完整执行：

> Supervisor 接收调研意图 → align 生成研究矩阵 → 按阶段派发子任务 → 子 Agent 采集信息、写结论、更新证据台账 → 检查点持久化 → 对比预期 vs 实际，重派缺口 → 核查证据分级、合成聚合去重 → 报告生成 → 任务收尾。

测试只关注这条主线的**状态转换正确性**和**缺口处理正确性**，不测 LLM 生成质量（那是 `eval.md` 的事）。

---

## 2. 覆盖模块与断言点

### 2.1 State 状态机

- 子任务执行状态按 `pending → running → completed` 流转，失败进入 `unresolved`。
- 研究矩阵格子状态在 `covered / gap / unresolved` 之间合法切换。
- 结论 Claim 状态按 `草稿 → 已验证` 流转，收尾可转 `已沉淀`。
- 检查点持久化后，从检查点恢复能还原状态（幂等）。

### 2.2 Orchestration 派发

- 按阶段顺序派发，不跳阶段（align 完成才进 collect）。
- 依赖未满足的子任务不提前派发（依赖感知）。
- 派发单元携带正确的指派角色。

### 2.3 缺口重派

- 预期产出 vs 实际落地不一致时，生成缺口单元并重派。
- 重试达到上限后，显式标记 unresolved，**不静默跳过**。
- 只重派缺口，已完成部分不重跑。

---

## 3. 关键场景

| 场景 | 输入 | 期望输出 |
| --- | --- | --- |
| 正常流 | 主题明确、覆盖度达标 | 四阶段走完，覆盖度=1，报告生成 |
| 缺口重派 | collect 阶段部分格子未覆盖 | verify 重派缺口，补齐后覆盖度达标 |
| unresolved | 缺口重试超上限 | 显式标 unresolved，报告含 unresolved 章节 |
| 断点续跑 | 第 3 步崩溃后恢复 | 从第 3 步检查点续跑，结果与不中断一致 |
| HITL 审批 | align 阶段等审批 | 通过则继续，打回则重跑 align |

---

## 4. 测试数据与 mock 依赖

- **mock 数据**：预置一个小型研究矩阵（如 2 公司 × 3 维度），覆盖 covered / gap / unresolved 三种格子状态。
- **mock Agent**：子 Agent 用 stub 实现，返回预设结论，不调真实 LLM / 网络。
- **mock Tool**：用内存实现替代网页抓取 / 搜索等原子能力。
- **断言目标**：以状态转换和覆盖度为核心断言，不依赖真实模型输出。

---

## 5. 与 eval.md 的边界

- `functional-test.md`：测**流程对不对**（状态转换、缺口处理、断点续跑）。
- `eval.md`：评**产出好不好**（报告质量、事实引用、过程溯源）。

---

## 6. 生产级关注点（测试金字塔）

### 6.1 分层

| 层 | 对应测试 | 说明 |
|---|---|---|
| 单元测试 | `test_state` / `test_orchestration` / `test_crosscutting` | 状态转换、reducer、纯逻辑 |
| 集成测试 | `test_flow` / `test_api` | 图流程、接口 |
| 端到端冒烟 | 真实 LLM（可选） | CI 不强制，发布前手动 |

### 6.2 覆盖率目标

- 核心模块（state / orchestration / agents）覆盖率 ≥ 80%。

### 6.3 CI 集成

- PR 触发 pytest + 覆盖率门禁（见 `operations.md` §6）。
- 失败阻断合并。
