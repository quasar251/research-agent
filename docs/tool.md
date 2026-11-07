# Tool 设计

> 本文对应《扩展设计》`agent-extended.md` 的 §4 Tool 模块。
> Tool / MCP 是 Agent 的**原子能力**；本模块只承担注册表职责，披露策略是**项目级最小权限**。

---

## 1. 职责

Tool / MCP 是 Agent 的**原子能力**（网页抓取、搜索引擎、PDF 解析、数据库查询、图表生成）。Tool 模块只承担**注册表（Registry）**职责——登记"有哪些能力可用"，**不做权限判定**；权限判定归 Security 的 PermissionGate（见 `security.md`）。

---

## 2. Tool 定义与 Tool Registry

- **Tool 定义**：唯一 id、名称、描述、权限要求。
- **Tool Registry**：注册表，只登记能力清单，不含"能否调用"的判定逻辑。

---

## 3. 披露策略：项目级最小权限

Tool 与 Skill 的披露粒度不同，**不做细粒度渐进式披露**：

- **项目级控制靠最小权限**：某调研项目不需要的 Tool，不进入该项目的 Tool Registry。
- **调用级不裁剪 schema**：Tool 暴露的是参数 schema，供模型自由选择工具。本产品 Tool 数量少（约 5 个），全集暴露 schema 的 token 成本可忽略，且模型必须看到完整工具集才能正确选工具。
- 只有当 Tool 数量膨胀到几十个时，才考虑"按阶段 / 按任务筛选注入 Tool"，当前无需。

---

## 4. 与其他模块的耦合

- **被 Skill 引用**：Skill 组合已有 Tool，通过「引用的 Tool 列表」间接约束某个阶段实际用到哪些 Tool（见 `skill-design.md`）。
- **受安全约束**：权限判定（PermissionGate）横切所有 Tool 调用，归属 Security（见 `security.md`）。

---

## 5. 关键设计点

- **Registry 与权限分离**：Registry 管"有什么"，PermissionGate 管"能不能用"。
- **最小权限**：某调研项目不需要的 Tool，不进入该项目的 Tool Registry。
