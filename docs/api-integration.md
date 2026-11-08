# 前后端接口对接蓝图（API Integration）

> 本文定义前端 Mock 演示与后端真实多 Agent 实现的接口边界，作为对接蓝图。
>
> 现状：后端已可独立启动，API 层具备 **创建 / 查询 / SSE 流式 / HITL 审批 / 追问** 5 个端点；前端（`frontend/`）仍是可独立运行的 Mock 演示，**尚未调用后端**。

---

## 0. 启动后端

```bash
uv run python backend/serve.py
```

- 监听 `http://127.0.0.1:8000`，交互式文档 `/docs`，`CTRL+C` 停止
- 已内置 CORS 白名单（`localhost:5173` / `127.0.0.1:5173`），前端 Vite 可直接跨域调用，无需代理
- **两种模式自动切换**（`backend/serve.py` 读 `.env`）：

| 条件 | 模式 | 说明 |
| --- | --- | --- |
| 有 `.env` 且含 `API_KEY` | 真实 LLM | `AnthropicClient`，端点/模型由 `BASE_URL` / `MODEL_ID` 指定 |
| 无 `.env` 或无 `API_KEY` | 离线 Mock | `OfflineMockLLM`，零网络、零密钥，适合前端联调 |

- `.env` 配置项：`API_KEY`、`BASE_URL`、`MODEL_ID`、`EMBEDDING_*`、`RERANKER_*`、`DB_PATH`（密钥不进仓库）
- 联调自检：`python backend/live_check.py`（分步验证 LLM 结构化输出 / Embedding / 完整调研链路）

---

## 1. 职责边界

| 归属 | 职责 |
| --- | --- |
| **前端** | 渲染、DOM 交互、动画、UI 状态（主题/侧边栏/深度选择）、事件绑定 |
| **后端** | 意图解析、多 Agent 调度、证据分级溯源、报告生成、成本/用量计费 |

原则：**前端只「播放」后端真实的调研过程，不自己「演」调研。**

---

## 2. 后端端点（实测 5 个）

### 2.1 创建调研任务（异步）

```
POST /research
```

请求：

```json
{ "intent": "AI 智能体行业", "depth": "simple" }
```

- `depth`：`simple` | `deep`（deep 含 HITL 审批点）
- 可选请求头 `Idempotency-Key`：同 key 重复提交返回同一 `run_id`（幂等）

响应：

```json
{ "run_id": "3f2a9c1d", "status": "pending" }
```

状态流转：`pending → running → completed / failed`，deep 模式在审批点暂停为 `waiting_approval`。
`intent` 为空 → `400 INVALID_PARAM`。

### 2.2 查询任务状态与结果

```
GET /research/{run_id}
```

- 未完成：`{ "run_id": "...", "status": "..." }`；`waiting_approval` 时额外 `approval_hint: "align"`
- 已完成：

```json
{
  "run_id": "3f2a9c1d",
  "status": "completed",
  "report": {
    "topic": "调研 AI 智能体行业",
    "summary": "……（LLM 聚合去重后的摘要）",
    "takeaways": [{ "text": "市场规模约 52 亿美元", "strength": "solid", "refs": [0] }],
    "citations": [{ "title": "https://…", "source": "https://…", "date": "", "strength": null }],
    "coverage": 0.86
  },
  "metrics": {
    "coverage": 0.86,
    "strength_distribution": { "solid": 3, "inferred": 2 },
    "claim_count": 8,
    "subtask_count": 12,
    "total_retries": 1
  }
}
```

- 不存在：`404 RUN_NOT_FOUND`

### 2.3 流式订阅调研进度（SSE，即开即跑）

```
GET /research/{run_id}/events?intent=AI智能体行业&depth=simple
```

> 与 2.1 不同：此端点**自己创建任务并执行调研**，边跑边推 `node` 事件，跑完结果落库，前端再调 2.2 取报告。二选一即可，不要同时用。

事件流（`text/event-stream`）：

```
data: {"node": "align"}
data: {"node": "collect"}
data: {"node": "verify"}
data: {"node": "synthesize"}
data: [DONE]
```

deep 模式遇审批点会落 `waiting_approval`，此时需前端调 2.4 才能继续。

### 2.4 HITL 审批动作

```
POST /research/{run_id}/action
```

```json
{ "action": "confirm", "feedback": "" }
```

- `action`：`confirm`（继续）/ `retry`（打回重新规划，可带 `feedback`）
- 非 `waiting_approval` 状态 → `409 WRONG_STATE`；非法 action → `400 INVALID_PARAM`
- 响应：`{ "run_id": "...", "status": "..." }`

### 2.5 追问

```
POST /research/{run_id}/follow
```

```json
{ "question": "头部厂商的护城河是什么？" }
```

基于已产出报告回答（复用调研结论，不重新检索）。
未完成 → `409 WRONG_STATE`；`question` 为空 → `400 INVALID_PARAM`。
响应：`{ "run_id": "...", "answer": "……" }`。

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
| `report` | **ReportModel** | 结构化报告（不再是字符串，见 §6） |

持久化：`TaskStore` 用 SQLite（`tasks` + `idempotency` 两张表），检查点用 SQLite checkpointer，服务重启不丢任务。`metrics` 由 `observability/metrics.py` 从状态派生。

---

## 4. 前端 Mock 逻辑 → 后端端点对照

| 前端 Mock 逻辑 | 文件位置 | 后端对应 | 对接后前端 |
| --- | --- | --- | --- |
| `matchReport` 意图识别 | `dialog.ts` | `POST /research` 的 `intent`（Lead 解析） | 删除关键词匹配 |
| `sendMessage` 发起调研 | `dialog.ts` | `POST /research` 拿 `run_id` | 只存 run_id |
| `runDag` / `runStage` 五阶段执行 | `dialog.ts` | `GET /research/{run_id}/events` SSE 节点事件 | 动画改事件驱动 |
| `buildStages` 阶段内容 | `stages.ts` | 后端各 Agent 产出 | 只做渲染 |
| `mock.ts` 报告数据 | `mock.ts` | `GET /research/{run_id}` 的 report | 数据来自后端 |
| `handleConfirm` / `handleRetry` | `dialog.ts` | `POST /research/{run_id}/action` | 发审批动作 |
| `followReply` 追问 | `dialog.ts` | `POST /research/{run_id}/follow` | 显示后端 answer |
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

### Step 1 — 打通主线

`sendMessage` → `POST /research` 拿 `run_id` → 轮询 `GET /research/{run_id}` → 完成后用 `report` 渲染。先用真数据跑通，动画可暂保留。

### Step 2 — 流式替换动画

`runDag` 的 `setTimeout` 定时器 → 改为订阅 `GET /research/{run_id}/events`，按 `node` 事件推进前端阶段（§4 映射表）。注意与 Step 1 的 `POST /research` 二选一，SSE 端点自带创建。

### Step 3 — 接 HITL 与追问、删 Mock

deep 模式收到 `waiting_approval` 后调 `/action`；追问改调 `/follow`；最后删除前端 Mock 逻辑（`matchReport` / `buildStages` / `followReply` / `usageFor` 等）。

---

## 6. report 结构化（✅ 已完成）

后端 `report` 已从纯文本字符串改为 `ReportModel`（`backend/app/state/schema.py`），由 Synthesizer 组装：

| 字段 | 来源 |
| --- | --- |
| `topic` / `coverage` | `intent` / `matrix.coverage` |
| `summary` | LLM 聚合去重产出的摘要 |
| `takeaways` | `claims[]`（`text` / `strength` / `evidence_refs` → `refs` 下标） |
| `citations` | `evidences[]`（`title` / `source` 暂用 url） |

`GET /research/{run_id}` 返回该结构的 JSON；`TaskStore.update` 用 `model_dump(mode="json")` 落库。

**仍需对齐的部分**：前端 `frontend/mock.ts` 的 `Report` 接口还包含 `headline` / `cagr` / `tags` / `sections[]`（chart / bars / swot / risk 等结构化组件），后端 v1 尚未产出这些字段。前端 `report.ts` 需要适配精简结构，或后端后续扩展 `sections` schema。

---

## 7. 缺口状态

| 项 | 状态 |
| --- | --- |
| 追问端点 `/follow` | ✅ 已有 |
| HITL 审批 `/action` | ✅ 已有 |
| SSE 流式 `/events` | ✅ 已有（即开即跑） |
| 幂等（`Idempotency-Key`） | ✅ 已有 |
| SQLite 任务持久化 + 检查点 | ✅ 已有 |
| report 结构化 | ✅ 已完成（v1，见 §6） |
| 会话 / 历史 API（`GET /conversations`） | ❌ 未暴露，前端仍用 localStorage |
| 丰富 `sections[]` 数据 | ❌ 后端未产出 |
| 双行业对比 | 复用两份 report 前端渲染即可（可选后端统一口径） |

---

## 8. 落地检查清单

- [x] Synthesizer 产出结构化 `report`（ReportModel）
- [x] 后端启动入口 `backend/serve.py`（真实 / 离线双模式）
- [x] 追问、审批、SSE、幂等等端点
- [ ] 前端 `sendMessage` 接 `POST /research`
- [ ] 前端 `runDag` 改订阅 `GET /research/{run_id}/events`
- [ ] 前端报告数据源从 `mock.ts` 切到 `GET /research/{run_id}`
- [ ] `report.ts` 适配精简结构（或后端扩展 sections）
- [ ] 成本显示切到 `metrics`
- [ ] 会话 / 历史 API
- [ ] 删除前端 Mock 逻辑（`matchReport` / `buildStages` / `followReply` / `usageFor` 等）
