"""上下文模块：按角色编译上下文视图（context.md §1）。

关键：状态是事实、上下文是视图。每个角色只看到它需要的，排除会交叉污染判断的内容。
"""
from __future__ import annotations

from typing import Any

from ..state.graph import AgentState
from ..state.schema import (
    AgentRole,
    CellStatus,
    ClaimStatus,
    ResearchMatrix,
    TaskStatus,
)


def compile_context(role: AgentRole, state: AgentState) -> dict[str, Any]:
    """按角色从状态编译上下文视图。"""
    matrix: ResearchMatrix = state.get("matrix") or ResearchMatrix()
    subtasks = state.get("subtasks", [])
    claims = state.get("claims", [])

    if role == AgentRole.LEAD:
        return {
            "intent": state.get("intent", ""),
            "matrix": matrix,
            "gaps": [c for c in matrix.cells if c.status == CellStatus.GAP],
            "completed": [t for t in subtasks if t.status == TaskStatus.COMPLETED],
        }
    if role == AgentRole.COLLECTOR:
        return {
            "pending_subtasks": [
                t for t in subtasks if t.status == TaskStatus.PENDING
            ],
        }
    if role == AgentRole.VERIFIER:
        return {
            "draft_claims": [c for c in claims if c.status == ClaimStatus.DRAFT],
        }
    if role == AgentRole.SYNTHESIZER:
        return {"claims": claims}
    return {}
