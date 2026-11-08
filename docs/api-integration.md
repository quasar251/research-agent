# 前后端接口对接蓝图（API Integration）

> 本文定义前端 Mock 演示与后端真实多 Agent 实现的接口边界，作为后续对接的蓝图。
>
> 现状：前端（`frontend/`）是可独立运行的 Mock 演示，把后端该做的「意图解析、Agent 分工、证据分级、报告生成、成本计费」全部硬编码了；后端（`backend/`）已实现核心主线，但 API 层尚未被前端调用。

---

## 1. 职责边界

| 归属 | 职责 |
| --- | --- |
| **前端** | 渲染、DOM 交互、动画、UI 状态（主题/侧边栏/深度选择）、事件绑定 |
| **后端** | 意图解析、多 Agent 调度、证据分级溯源、报告生成、成本/用量计费 |

原则：**前端只「播放」后端真实的调研过程，不自己「演」调研。**

---

## 2. 后端现有端点

### 2.1 创建调研任务（异步）

```
POST /research
```

请求：

```json
{ "intent": "AI 智能体行业" }
```

响应：

```json
{ "run_id": "3f2a9c1d", "status": "pending" }
```

行为：立即返回 `run_id`，后台执行四阶段调研；状态流转 `pending → running → completed / failed`。

### 2.2 查询任务状态与结果

```
GET /research/{run_id}
```

- 未完成：`{ "run_id": "...", "status": "pending" | "running" }`
- 已完成：

```json
{
  "run_id": "3f2a9c1d",
  "status": "completed",
  "report": "……",
  "metrics": {
    "coverage": 0.86,
    "strength_distribution": { "solid": 3, "inferred": 2 },
    "claim_count": 8,
    "subtask_count": 12,
    "total_retries": 1
  }
}
```

- 不存在：`404 { "detail": "RUN_NOT_FOUND" }`

### 2.3 流式订阅调研进度（SSE）

```
GET /research/stream?intent=AI智能体行业
```

事件流（`text/event-stream`）：

```
data: {"node": "align"}
data: {"node": "collect"}
data: {"node": "verify"}
data: {"node": "synthesize"}
data: [DONE]
```

每个节点执行后推送一次；`node` 取值对应四阶段。

---

## 3. 后端状态与数据模型

`AgentState`（`backend/app/state/graph.py`）是一份结构化台账：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `run_id` / `user_id` / `intent` | str | 运行元数据 |
| `stage` | StageName | 当前阶段（align/collect/verify/synthesize） |
| `matrix` | ResearchMatrix | 研究矩阵（公司 × 维度 + 覆盖度） |
| `subtasks` | Subtask[] | 子任务台账 |
| `evidences` | Evidence[] | 证据台账（可信度 / 来源等级） |
| `claims` | Claim[] | 结论台账（证据强度 / 引用） |
| `interventions` | HumanIntervention[] | 人工干预审计 |
| `report` | str | 最终报告（当前为纯文本，见 §6） |

`metrics` 由 `observability/metrics.py` 从状态派生。

---

## 4. 前端 Mock 逻辑 → 后端端点对照

| 前端 Mock 逻辑 | 文件位置 | 后端对应 | 对接后前端 |
| --- | --- | --- | --- |
| `matchReport` 意图识别 | `dialog.ts` | `POST /research` 的 `intent`（Lead 解析） | 删除关键词匹配 |
| `sendMessage` 发起调研 | `dialog.ts` | `POST /research` 拿 `run_id` | 只存 run_id |
| `runDag` / `runStage` 五阶段执行 | `dialog.ts` | `GET /research/stream` SSE 节点事件 | 动画改事件驱动 |
| `buildStages` 阶段内容 | `stages.ts` | 后端各 Agent 产出 | 只做渲染 |
| `mock.ts` 报告数据 | `mock.ts` | `GET /research/{run_id}` 的 report/claims | 数据来自后端 |
| `followReply` 追问 | `dialog.ts` | ❌ 后端无，需新增 | — |
| `usageFor` 成本计算 | `common.ts` | `metrics` 字段 | 显示后端值 |
| `convStage` 阶段推断 | `console.ts` | `stage` 字段 / SSE | 读后端 stage |
| 证据强度分级 | `mock.ts` | Verifier 的 `claims[].strength` | 只渲染标签 |

### 阶段映射

后端四阶段 → 前端视觉阶段（沿用 `agent-core.md` §3.2）：

| 后端节点 | 前端深度（5 阶段） | 前端简版（3 阶段） |
| --- | --- | --- |
| align | 任务拆解 | 规划与检索 |
| collect | 数据检索 + 深度分析 | 规划与检索 + 速览分析 |
| verify | 交叉审查 | 核验与报告 |
| synthesize | 生成报告 | 核验与报告 |

---

## 5. 对接路线（3 步）

### Step 1 — 打通主线（最简单）

`sendMessage` → `POST /research` 拿 `run_id` → 轮询 `GET /research/{run_id}` → 完成后用 `report` 渲染。先用真数据跑通，动画可暂保留。

### Step 2 — 流式替换动画

`runDag` 的 `setTimeout` 定时器 → 改为订阅 SSE，按 `node` 事件推进前端阶段（§4 映射表）。

### Step 3 — 补齐缺口

追问、历史会话、双行业对比等，按 §7 新增端点后接入。

---

## 6. 关键前提：report 结构化

**当前后端 `report` 是字符串**（Synthesizer 拼的文本），但前端 `report.ts` 需要结构化数据（`frontend/mock.ts` 的 `Report` 接口）：

```ts
interface Report {
  id: string;
  topic: string;
  domain: string;
  updatedAt: string;
  tags: string[];
  headline: { label: string; value: string }; // 核心指标
  cagr: string;
  summary: string;
  takeaways: Takeaway[];                       // { text, strength, refs }
  followUpHints: string[];
  citations: Citation[];                       // { title, source, date, strength }
  sections: Section[];                         // { heading, kind, paragraphs/bars/swot/... }
}
```

对接前必须让后端 **Synthesizer 产出上述 JSON schema**（而非纯文本），否则前端渲染层无法复用。这是**最关键**的对接前提。

建议：后端 `report` 字段改为结构化对象（或新增 `report_json` 字段），字段对齐 `Report` 接口；前端 `report.ts` 保持不变，只换数据来源。

---

## 7. 后端待补缺口

| 缺口 | 建议端点 | 说明 |
| --- | --- | --- |
| 追问 | `POST /research/{run_id}/follow` | 带 run_id 续跑，返回追加结论 |
| 会话 / 历史 | `GET /conversations`、`GET /conversations/{id}` | 前端现用 localStorage；后端有 checkpointer 但未暴露 |
| 双行业对比 | 复用两份 report 前端渲染即可 | 可选；若需后端统一口径再新增 |

---

## 8. 落地检查清单

- [ ] Synthesizer 产出结构化 `report`（对齐 `Report` 接口）
- [ ] 前端 `sendMessage` 接 `POST /research`
- [ ] 前端 `runDag` 改订阅 `GET /research/stream`
- [ ] 前端报告数据源从 `mock.ts` 切到 `GET /research/{run_id}`
- [ ] 成本显示切到 `metrics`
- [ ] 新增追问 / 会话端点
- [ ] 删除前端 Mock 逻辑（`matchReport` / `buildStages` / `followReply` / `usageFor` 等）
