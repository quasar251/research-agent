"""Lead 角色：规划者（align 阶段）。

生成研究矩阵 + 拆解子任务，写入状态。
"""
from __future__ import annotations

from typing import Callable

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
from . import parse_json

_PROMPT = """你是行业调研的规划者 Lead。给定调研意图，生成研究计划。

调研意图：{intent}

只输出 JSON，不要输出任何其他文字，格式如下：
{{
  "companies": ["公司A", "公司B"],
  "dims": ["市场规模", "竞争格局"],
  "subtasks": [
    {{"id": "t1", "question": "该公司市场规模是多少", "dependencies": []}},
    {{"id": "t2", "question": "竞争格局如何", "dependencies": ["t1"]}}
  ]
}}
"""


def make_lead_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 align 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        intent = state["intent"]
        raw = llm.complete([{"role": "user", "content": _PROMPT.format(intent=intent)}])
        plan = parse_json(raw)

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
                dependencies=s.get("dependencies", []),
            )
            for s in plan["subtasks"]
        ]
        matrix = ResearchMatrix(companies=companies, dims=dims, cells=cells)
        return {"matrix": matrix, "subtasks": subtasks, "stage": StageName.COLLECT}

    return node
