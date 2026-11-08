"""状态模块：LangGraph 图状态定义 + reducer 合并语义。

把 `schema.py` 的台账实体接到 LangGraph 状态（architecture.md §5 边界 1）：
- 标量字段用默认覆盖（「当前值」语义：run_id / user_id / intent / stage / matrix）
- 台账列表按 id upsert 合并（单一事实源，同 id 覆盖、无重复）
- 人工干预记录追加（append-only 审计日志）

检查点持久化不在此处，交给 LangGraph 的 checkpointer（见 `checkpoint.py`）。
"""
from __future__ import annotations

from operator import add
from typing import Annotated, TypedDict

from .schema import (
    Claim,
    Evidence,
    HumanIntervention,
    ResearchMatrix,
    StageName,
    Subtask,
)


def _upsert_by_id(current: list, update: list) -> list:
    """按 id upsert 合并台账：update 中同 id 覆盖 current，其余保留。"""
    merged = {getattr(item, "id"): item for item in current}
    for item in update:
        merged[getattr(item, "id")] = item
    return list(merged.values())


class AgentState(TypedDict, total=False):
    """研小报的图状态：LangGraph 每个节点读写该状态的字段。

    `total=False` 使所有字段可选，节点可只返回被更新的字段。
    """

    run_id: str
    user_id: str
    intent: str
    stage: StageName
    matrix: ResearchMatrix
    subtasks: Annotated[list[Subtask], _upsert_by_id]
    evidences: Annotated[list[Evidence], _upsert_by_id]
    claims: Annotated[list[Claim], _upsert_by_id]
    interventions: Annotated[list[HumanIntervention], add]
    report: str


def initial_state(
    run_id: str,
    user_id: str,
    intent: str,
    stage: StageName = StageName.ALIGN,
) -> AgentState:
    """构造一次调研任务的初始状态。"""
    return {
        "run_id": run_id,
        "user_id": user_id,
        "intent": intent,
        "stage": stage,
        "matrix": ResearchMatrix(),
        "subtasks": [],
        "evidences": [],
        "claims": [],
        "interventions": [],
        "report": "",
    }
