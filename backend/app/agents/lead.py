"""Lead 角色：规划者（align 阶段）。

生成研究矩阵 + 拆解子任务，写入状态。结构化输出用 tool use 强制 schema。
"""
from __future__ import annotations

from typing import Callable

from langgraph.types import interrupt

from ..context.compiler import compile_context
from ..llm.client import LLMClient, LLMError
from ..skill.loader import build_system_prompt
from ..skill.registry import SkillRegistry
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

_LEAD_BASE = """你是一名行业调研的「规划者」，负责把调研意图转化为可执行的研究计划。

# 职责边界
你只管「查什么、查全没」：圈定研究范围、确定分析维度、拆解子任务。
你不亲自采集数据、不做证据判断——那些交给后续的搜集员和核查员。"""


def _build_from_plan(
    plan: dict,
) -> tuple[list[str], list[str], ResearchMatrix, list[Subtask]]:
    """把 LLM 计划解析为矩阵 + 子任务（含范围裁剪与笛卡尔积兜底）。"""
    companies: list[str] = plan["companies"][:_MAX_COMPANIES]
    dims: list[str] = plan["dims"][:_MAX_DIMS]
    cells = [
        MatrixCell(company=c, dim=d, status=CellStatus.GAP)
        for c in companies
        for d in dims
    ]
    # 子任务兜底：按「公司 × 维度」笛卡尔积对齐，缺失的格子自动补默认子任务
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
    return companies, dims, matrix, subtasks


def make_lead_node(
    llm: LLMClient, skill_registry: SkillRegistry | None = None
) -> Callable[[AgentState], dict]:
    """返回 align 阶段的节点函数。流程知识由 Skill 随阶段注入（渐进式披露）。

    deep 模式在规划后 interrupt，等待人工 confirm / retry（HITL，见 api.md §3.4）。
    """

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图（状态是事实，上下文是视图）
        view, snapshot = compile_context(AgentRole.LEAD, state)
        intent = view["intent"]
        system_prompt = build_system_prompt(_LEAD_BASE, skill_registry, StageName.ALIGN)
        hitl = state.get("depth") == "deep"

        while True:
            try:
                plan = llm.complete_structured(
                    [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"调研意图：{intent}\n\n请按约束输出研究计划。"},
                    ],
                    tool_name="submit_plan",
                    input_schema=_PLAN_SCHEMA,
                )
            except LLMError as exc:
                # 失败兜底：规划失败不崩溃，返回空计划并记录错误（后续阶段空跑，报告可诊断）
                return {
                    "matrix": ResearchMatrix(),
                    "subtasks": [],
                    "snapshots": [snapshot],
                    "errors": [f"规划失败：{exc}"],
                    "stage": StageName.COLLECT,
                }

            companies, dims, matrix, subtasks = _build_from_plan(plan)

            if not hitl:
                break

            # HITL：deep 模式规划后暂停，等待人工确认 / 打回
            decision = interrupt(
                {
                    "checkpoint": "align",
                    "companies": companies,
                    "dims": dims,
                    "subtask_count": len(subtasks),
                }
            )
            if decision == "confirm":
                break
            # retry：继续循环，重新规划

        return {
            "matrix": matrix,
            "subtasks": subtasks,
            "snapshots": [snapshot],
            "stage": StageName.COLLECT,
        }

    return node
