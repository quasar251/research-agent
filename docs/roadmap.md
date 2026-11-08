# 生产级改造计划 Roadmap

> 现状：`docs/` 各设计文档处于「领域设计」层级（职责、概念、数据结构、耦合），缺「工程化设计」层级（生产环境怎么跑）。
> 目标：把设计文档升级到生产级，补齐可靠性、持久化、API 契约、可观测性落地、部署运维五个横切维度。

---

## 改造清单

### 新增文档

| 文档 | 内容 |
|---|---|
| `reliability.md` | 超时/重试/退避/熔断/降级、幂等性、断点恢复语义 |
| `api.md` | 完整端点契约、请求响应 schema、错误码、版本 |
| `operations.md` | 部署、配置、密钥管理、监控告警、CI |

### 回填现有文档

| 文档 | 补充的生产级内容 |
|---|---|
| `state.md` | SQLite 表结构、索引、检查点迁移策略 |
| `orchestration.md` | 缺口重派循环条件、并发背压、幂等 |
| `context.md` | 预算压缩阈值、token 计量规则 |
| `memory.md` | 长期记忆检索实现、索引、淘汰策略 |
| `skill-design.md` | Skill 版本管理、升级兼容 |
| `tool.md` | MCP 连接管理、超时、错误码 |
| `security.md` | 密钥管理、审计完整性、注入规则集 |
| `observability.md` | 指标名、日志字段规范、trace 传播 |
| `eval.md` | 评估数据集构建、基准、回归门禁 |
| `functional-test.md` | 测试金字塔、覆盖率目标、CI 集成 |

---

## 分阶段执行

**阶段 A · 可靠性（地基）**
新增 `reliability.md`，回填 `orchestration.md`（重试/幂等）、`context.md`（预算阈值）。

**阶段 B · 数据与接口契约**
`state.md` 补 SQLite schema + 迁移；新增 `api.md`。

**阶段 C · 可观测性落地**
`observability.md` 升级为可执行规范（指标名 + 日志字段 + trace 传播）。

**阶段 D · 部署运维**
新增 `operations.md`。

**阶段 E · 其余模块回填**
`memory.md`、`skill-design.md`、`tool.md`、`security.md`、`eval.md`、`functional-test.md`。

---

## 验收标准

1. 每个模块文档都有对应的「生产级关注点」章节（可靠性/持久化/契约/观测性/运维）。
2. 新增文档与现有文档交叉引用一致，无悬空引用。
3. 改造后文档与 `agent-core.md` / `agent-extended.md` 设计真源仍保持一致。
