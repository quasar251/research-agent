"""上下文模块：按角色编译上下文视图（context.md §1）。

关键：状态是事实、上下文是视图。每个角色只看到它需要的，排除会交叉污染判断的内容。
每次编译同时返回一份快照（ContextSnapshot），记录"该角色看到了哪些结论/来源"，用于溯源。
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
from .snapshot import ContextSnapshot


def compile_context(
    role: AgentRole, state: AgentState
) -> tuple[dict[str, Any], ContextSnapshot]:
    """按角色从状态编译上下文视图，并返回溯源快照。"""
    matrix: ResearchMatrix = state.get("matrix") or ResearchMatrix()
    subtasks = state.get("subtasks", [])
    claims = state.get("claims", [])

    if role == AgentRole.LEAD:
        completed = [t for t in subtasks if t.status == TaskStatus.COMPLETED]
        view = {
            "intent": state.get("intent", ""),
            "matrix": matrix,
            "gaps": [c for c in matrix.cells if c.status == CellStatus.GAP],
            "completed": completed,
        }
        snapshot = ContextSnapshot(
            role=role,
            claim_ids=[t.output_ref for t in completed if t.output_ref],
            params={"gap_count": len(view["gaps"])},
        )
        return view, snapshot

    if role == AgentRole.COLLECTOR:
        pending = [t for t in subtasks if t.status == TaskStatus.PENDING]
        view = {"pending_subtasks": pending}
        snapshot = ContextSnapshot(role=role, params={"pending_count": len(pending)})
        return view, snapshot

    if role == AgentRole.VERIFIER:
        drafts = [c for c in claims if c.status == ClaimStatus.DRAFT]
        view = {"draft_claims": drafts}
        snapshot = ContextSnapshot(role=role, claim_ids=[c.id for c in drafts])
        return view, snapshot

    if role == AgentRole.SYNTHESIZER:
        view = {"claims": claims}
        snapshot = ContextSnapshot(role=role, claim_ids=[c.id for c in claims])
        return view, snapshot

    return {}, ContextSnapshot(role=role)
