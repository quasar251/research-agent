# 真实端点联调记录（Integration Runbook）

> 记录后端接入真实 LLM / Embedding 端点时的验证结果、踩坑与修复。脚本入口 `backend/live_check.py`，配置走 `.env`（密钥不进代码，见 `operations.md` §3）。

---

## 1. 联调范围

`live_check.py` 分三步验证：

| 步骤 | 验证项 | 结果 |
| --- | --- | --- |
| 1 | LLM 结构化输出（研究计划 schema） | ✅ 通过 |
| 2 | Embedding（文本 → 向量） | ✅ 通过 |
| 3 | 完整四阶段调研 + 报告 + 记忆蒸馏 | ✅ 通过（曾报一个打印 bug，已修） |

---

## 2. 端点与配置

| 项 | 值 | 说明 |
| --- | --- | --- |
| LLM | DeepSeek（anthropic 兼容端点） | `BASE_URL` / `API_KEY` / `MODEL_ID` |
| Embedding | SiliconFlow BGE-M3（1024 维） | `EMBEDDING_*` 系列环境变量 |
| 检查点 | SQLite | `DB_PATH`，默认 `checkpoints.sqlite` |

---

## 3. 踩坑与修复

### 3.1 anthropic 兼容端点不支持 tool use

**现象**：DeepSeek 的 anthropic 兼容端点忽略 `tools` 参数，`complete_structured` 走 tool use 拿不到结果。

**修复**：`complete_structured` 降级为「prompt 引导 JSON 输出 + 容错解析 + 解析失败重试」（`backend/app/llm/client.py`）。容错解析 `_parse_json` 容忍 markdown 代码块与前后噪声。

### 3.2 httpx2 的 brotli 解压 bug

**现象**：环境里 `brotli` 包与 httpx 新版冲突，解压响应体时报错。

**修复**：卸载 `brotli`、安装 `brotlicffi`（环境依赖问题，非代码）。

### 3.3 复杂 schema 被截断

**现象**：研究计划的 JSON 输出被 `max_tokens` 截断，解析失败。

**修复**：`complete_structured` 默认 `max_tokens` 从 1024 提到 4096。

---

## 4. 联调暴露的产品问题（已修）

### 4.1 Lead 研究计划范围失控

**现象**：一次生成 20 家公司 × 10 维度 = 200 个矩阵格子，却只拆约 15 个子任务，覆盖度仅 15.8%。

**根因**：Lead 的 prompt 没有约束公司/维度数量，且子任务由 LLM 自由拆解，与矩阵格子不对齐。

**修复**（`backend/app/agents/lead.py`）：

1. prompt 明确约束「3~5 家公司、3~4 个维度」；
2. schema 加 `minItems` / `maxItems`；
3. 双重兜底：硬裁剪到上限 + 子任务按「公司 × 维度」笛卡尔积补齐（缺的格子自动生成默认子任务）。

修复后子任务数 = 公司数 × 维度数，矩阵全覆盖，覆盖度不再被人为拉低。

### 4.2 report 字段类型打印错误

**现象**：`ReportModel object is not subscriptable`，发生在联调脚本读报告那一行。

**根因**：`report` 字段存的是 `ReportModel`（Pydantic 对象，非字符串），脚本用 `[:200]` 切片报错。

**修复**：联调脚本改用 `getattr(report, "summary", "")` 取摘要打印。

---

## 5. 遗留与下一步

- [ ] 覆盖度回跑验证：范围约束上线后，重新跑 `live_check.py` 确认覆盖度接近 100%。
- [ ] 报告结构化对接：`report` 已从纯文本升级为 `ReportModel`，前端 `report.ts` 需按 `api-integration.md` §6 对接（当前前端仍走 Mock）。
- [ ] 缺口重派（④）尚未接线：`orchestration/graph.py` 已有条件边，但 verify 后只靠 pending 判断，未验证迭代填补效果。
