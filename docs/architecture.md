# 项目结构与技术选型 Architecture

> 本文固化后端的技术栈、目录结构、包结构与依赖关系，作为开工依据。设计真源见 `agent-core.md` / `agent-extended.md`，各模块落地说明见 `docs/` 其余文档。

---

## 1. 技术栈

| 层 | 选型 | 用途 |
| --- | --- | --- |
| 语言 | Python | 后端 |
| 模型 SDK | anthropic sdk | Claude 调用 + MCP 接入 |
| Web 框架 | FastAPI | HTTP 接口 + SSE |
| Agent 编排 | LangGraph | StateGraph 图状态 + 检查点 + 四阶段编排 |
| 状态持久化 | SQLite | 检查点（LangGraph SqliteSaver）、台账 |
| 流式交互 | SSE | LangGraph `astream` 事件流转推前端 |

主要依赖（运行时 + 开发）：`fastapi`、`uvicorn`、`anthropic`、`langgraph`、`langgraph-checkpoint-sqlite`、`pydantic`、`pytest`。

---

## 2. 目录结构（单包）

```
research-agent/
├── agent-core.md               # 设计真源·核心
├── agent-extended.md           # 设计真源·扩展
├── pyproject.toml              # 根依赖管理（单包）
├── docs/                       # 落地文档
├── frontend/                   # Mock 前端（TS + Vite）
├── backend/                    # Python 后端（核心运行时）
│   └── app/
│       ├── main.py             # FastAPI 入口
│       ├── config.py           # 配置（模型、密钥、预算）
│       ├── llm/                # anthropic sdk 封装
│       │   ├── client.py       # Claude client
│       │   └── mcp.py          # MCP 接入
│       ├── state/              # 状态模块
│       │   ├── schema.py       # 台账实体 schema
│       │   ├── graph.py        # LangGraph StateGraph 状态 + reducer
│       │   └── checkpoint.py   # SQLite 检查点（SqliteSaver）
│       ├── orchestration/      # 调度模块
│       │   ├── graph.py        # StateGraph 编排（四阶段节点 + 条件边）
│       │   ├── supervisor.py   # Supervisor：阶段机 + 依赖感知
│       │   └── dispatch.py     # 派发单元、缺口重派、聚合
│       ├── context/            # 上下文模块
│       │   ├── compiler.py     # 按角色编译
│       │   ├── snapshot.py     # 上下文快照
│       │   └── budget.py       # 预算压缩
│       ├── memory/             # 记忆模块
│       │   ├── core.py         # 核心记忆
│       │   ├── longterm.py     # 长期记忆（检索式）
│       │   └── distill.py      # 蒸馏节点
│       ├── skill/              # Skill 模块
│       │   ├── registry.py     # Skill 注册表
│       │   ├── router.py       # 阶段路由（渐进式披露）
│       │   └── loader.py       # prepare_context 按需加载
│       ├── tools/              # Tool 模块
│       │   └── registry.py     # MCP Tool Registry
│       ├── security/           # 安全模块
│       │   ├── injection.py    # 注入扫描
│       │   ├── privacy.py      # 隐私脱敏
│       │   └── gate.py         # PermissionGate
│       ├── agents/             # 四角色 Agent
│       │   ├── lead.py         # 规划者
│       │   ├── collector.py    # 搜集
│       │   ├── verifier.py     # 核查
│       │   └── synthesizer.py  # 合成
│       ├── observability/      # 可观测性（横切聚合）
│       │   ├── metrics.py      # 指标派生
│       │   ├── trace.py        # 追踪链查询
│       │   └── audit.py        # 审计日志查询
│       ├── api/                # FastAPI 接口层
│       │   ├── routes.py       # 任务创建 / 查询
│       │   └── sse.py          # SSE 流式进度推送
│       └── runtime.py          # 统一运行时（串起七模块）
├── eval/                       # 评估（顶层，独立）
│   ├── report_quality.py       # RACE 报告质量评分
│   ├── factuality.py           # FACT 事实引用核验
│   └── process.py              # 过程质量评分
└── test/                       # 测试（顶层）
    ├── test_state.py           # 状态机转换
    ├── test_dispatch.py        # 派发 / 缺口重派
    └── test_flow.py            # 核心流程端到端
```

---

## 3. 包结构与 import 关系

单包方案：整个项目一个 `pyproject.toml`，`backend.app`、`eval`、`test` 都是包。

依赖方向单向，无环：

```
test/  ──import──▶  backend.app  ◀──import──  eval/
```

- `test/`：测 backend 核心流程，用 stub Agent + mock Tool，不调真实 LLM / 网络。
- `eval/`：复用 `backend.app.state`（读状态实体）+ `backend.app.llm`（judge-as-LLM）+ `backend.app.observability`（读指标），做三层评估。

---

## 4. 代码目录 ↔ 设计文档映射

| 代码目录 | 对应设计文档 | 说明 |
| --- | --- | --- |
| `state/` | `state.md` | 全局约定 + 状态实体 |
| `orchestration/` | `orchestration.md` | 调度 + ④⑤⑥ 调度侧 |
| `context/` | `context.md` | 上下文编译 |
| `memory/` | `memory.md` | 记忆 + ⑥ 记忆侧 |
| `skill/` | `skill-design.md` | Skill + 渐进式披露 |
| `tools/` | `tool.md` | Tool + 最小权限 |
| `security/` | `security.md` | 安全 |
| `observability/` | `observability.md` | 可观测性（横切聚合） |
| `eval/` | `eval.md` | 调研质量评估 |
| `test/` | `functional-test.md` | 核心流程测试 |
| `agents/` | `state.md` §1.1 | 四角色定义 |

---

## 5. 关键边界（LangGraph 划分）

1. **State 分两半**：图状态（含 reducer、检查点）交给 LangGraph；台账实体 schema 自研，作为 LangGraph 状态字段。
2. **Orchestration 分两半**：图编排（节点、条件边、fan-out）交给 LangGraph；Supervisor 调度逻辑（阶段机、依赖感知、缺口重派）自研，跑在节点函数里。
3. **指标共享**：指标派生逻辑在 `observability/metrics.py`，`eval/process.py` 复用打分，不重复实现。
