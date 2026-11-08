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

_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "companies": {"type": "array", "items": {"type": "string"}},
        "dims": {"type": "array", "items": {"type": "string"}},
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


def make_lead_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 align 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图（状态是事实，上下文是视图）
        view = compile_context(AgentRole.LEAD, state)
        intent = view["intent"]
        plan = llm.complete_structured(
            [{"role": "user", "content": f"调研意图：{intent}。请生成研究计划。"}],
            tool_name="submit_plan",
            input_schema=_PLAN_SCHEMA,
        )

        companies: list[str] = plan["companies"]
        dims: list[str] = plan["dims"]
        cells = [
            MatrixCell(company=c, dim=d, status=CellStatus.GAP)
            for c in companies
            for d in dims
        ]
        subtasks = [
            Subtask(
                id=s["id"],
                question=s["question"],
                role=AgentRole.COLLECTOR,
                stage=StageName.COLLECT,
                company=s["company"],
                dim=s["dim"],
                dependencies=s.get("dependencies", []),
            )
            for s in plan["subtasks"]
        ]
        matrix = ResearchMatrix(companies=companies, dims=dims, cells=cells)
        return {"matrix": matrix, "subtasks": subtasks, "stage": StageName.COLLECT}

    return node
