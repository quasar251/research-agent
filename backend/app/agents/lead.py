"""Lead 角色：规划者（align 阶段）。

生成研究矩阵 + 拆解子任务，写入状态。结构化输出用 tool use 强制 schema。
"""
from __future__ import annotations

from typing import Callable

from ..context.compiler import compile_context
from ..llm.client import LLMClient
from ..state.graph import AgentState
from ..state.schema import (
    AgentRole,
    CellStatus,
    MatrixCell,
    ResearchMatrix,
    StageName,
    Subtask,
)

# 范围约束：控制矩阵规模，避免 LLM 生成过多公司/维度导致覆盖度被人为拉低
_MAX_COMPANIES = 5
_MAX_DIMS = 4

_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "companies": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "maxItems": _MAX_COMPANIES,
        },
        "dims": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "maxItems": _MAX_DIMS,
        },
        "subtasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "question": {"type": "string"},
                    "company": {"type": "string"},
                    "dim": {"type": "string"},
                    "dependencies": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["id", "question", "company", "dim"],
            },
        },
    },
    "required": ["companies", "dims", "subtasks"],
}

_LEAD_SYSTEM_PROMPT = """你是一名行业调研的「规划者」，负责把调研意图转化为可执行的研究计划。

# 职责边界
你只管「查什么、查全没」：圈定研究范围、确定分析维度、拆解子任务。
你不亲自采集数据、不做证据判断——那些交给后续的搜集员和核查员。

# 研究范围约束
- 公司清单（companies）：圈定 3~5 家该行业最具代表性的头部公司，宁精勿多，不要超过 5 家。
- 分析维度（dims）：确定 3~4 个关键维度，从以下候选里挑最贴合本次意图的：市场规模、竞争格局、技术趋势、产业链、商业模式、风险与挑战、政策环境、区域分布。
- 子任务（subtasks）：为每个「公司 × 维度」组合生成恰好一个子任务，保证研究矩阵每个格子都有对应子任务，全覆盖、不遗漏。

# 子任务编写要求
- question 要具体、可独立回答，点明「哪家公司 + 哪个维度 + 想查清什么」。
- 避免宽泛表述，落到可验证的事实（例如「A 公司 2024 年市场份额及主要竞争对手」，而非「调研 A 公司」）。
- company 与 dim 字段必须与 companies / dims 清单中的字符串精确一致。"""


def make_lead_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 align 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图（状态是事实，上下文是视图）
        view = compile_context(AgentRole.LEAD, state)
        intent = view["intent"]
        plan = llm.complete_structured(
            [
                {"role": "system", "content": _LEAD_SYSTEM_PROMPT},
                {"role": "user", "content": f"调研意图：{intent}\n\n请按约束输出研究计划。"},
            ],
            tool_name="submit_plan",
            input_schema=_PLAN_SCHEMA,
        )

        # 范围兜底：LLM 超范围时硬裁剪到上限，避免矩阵格子爆炸
        companies: list[str] = plan["companies"][:_MAX_COMPANIES]
        dims: list[str] = plan["dims"][:_MAX_DIMS]
        cells = [
            MatrixCell(company=c, dim=d, status=CellStatus.GAP)
            for c in companies
            for d in dims
        ]

        # 子任务兜底：按「公司 × 维度」笛卡尔积对齐，缺失的格子自动补默认子任务，
        # 保证每个矩阵格子都有对应子任务，覆盖度不再被 LLM 漏拆的子任务拉低。
        by_key = {(s["company"], s["dim"]): s for s in plan["subtasks"]}
        subtasks: list[Subtask] = []
        for i, (c, d) in enumerate((c, d) for c in companies for d in dims):
            s = by_key.get((c, d))
            subtasks.append(
                Subtask(
                    id=f"t-{i}",
                    question=s["question"] if s else f"调研 {c} 的 {d} 情况",
                    role=AgentRole.COLLECTOR,
                    stage=StageName.COLLECT,
                    company=c,
                    dim=d,
                    dependencies=s.get("dependencies", []) if s else [],
                )
            )
        matrix = ResearchMatrix(companies=companies, dims=dims, cells=cells)
        return {"matrix": matrix, "subtasks": subtasks, "stage": StageName.COLLECT}

    return node
