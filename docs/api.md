# API 契约

> 生产级接口规范：端点、请求/响应 schema、任务状态机、错误码、幂等与版本。后端实现见 `backend/app/api/`。

---

## 1. 端点总览

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/research` | 创建调研任务（异步） |
| GET | `/research/{run_id}` | 查询任务状态与结果 |
| GET | `/research/{run_id}/events` | SSE 流式进度（挂在 run_id 下，避免路径冲突） |
| POST | `/research/{run_id}/action` | HITL 审批（confirm / retry） |

---

## 2. 任务状态机

调研是长时任务，状态机如下：

```
pending → running ⇄ waiting_approval → completed
              │                        │
              └──────────► failed      └──► unresolved
```

| 状态 | 含义 |
|---|---|
| pending | 已创建，排队中 |
| running | 执行中 |
| waiting_approval | 停在 HITL 审批点，等待用户确认 / 打回 |
| completed | 正常完成 |
| failed | 失败（不可重试错误，见 `reliability.md` §1） |
| unresolved | 完成但有无法解决的缺口（显式标记） |

---

## 3. 端点契约

### 3.1 POST /research（创建任务）

请求：
```json
{ "intent": "调研 AI 智能体行业", "depth": "deep" }
```

响应（202 Accepted）：
```json
{ "run_id": "r-8f3a2c", "status": "pending" }
```

语义：创建任务后**立即返回 run_id**，调研在后台执行（异步，见 `operations.md`）。

### 3.2 GET /research/{run_id}（查询）

响应：
```json
{
  "run_id": "r-8f3a2c",
  "status": "completed",
  "report": "报告正文",
  "metrics": { "coverage": 1.0, "claim_count": 4 }
}
```

`status` 为 waiting_approval 时，额外返回 `approval_hint`（待确认的阶段）。

### 3.3 GET /research/{run_id}/events（SSE 进度）

事件流：
```
data: {"node": "align"}
data: {"node": "collect"}
data: {"node": "verify"}
data: [DONE]
```

### 3.4 POST /research/{run_id}/action（HITL 审批）

请求：
```json
{ "action": "confirm" }
```
或
```json
{ "action": "retry", "feedback": "补充海外市场分析" }
```

---

## 4. 错误码

| HTTP | 业务码 | 含义 |
|---|---|---|
| 400 | `INVALID_PARAM` | 参数非法（intent 为空等） |
| 401 | `AUTH_FAILED` | 模型鉴权失败（见 `reliability.md` §1 不可重试） |
| 404 | `RUN_NOT_FOUND` | run_id 不存在 |
| 409 | `WRONG_STATE` | 状态不允许该操作（如对非 waiting_approval 任务发 action） |
| 429 | `RATE_LIMITED` | 限流 |
| 500 | `INTERNAL` | 内部错误 |
| 503 | `CIRCUIT_OPEN` | 熔断中（见 `reliability.md` §2） |

---

## 5. 幂等与版本

- **幂等**：`POST /research` 携带 `Idempotency-Key` 头，同 key 重复提交返回同一个 run_id（见 `reliability.md` §4）。
- **版本**：路径前缀 `/v1`，响应带 `X-Api-Version` 头。
- **分页**：查询接口结果列表统一 `limit` / `cursor` 分页。
