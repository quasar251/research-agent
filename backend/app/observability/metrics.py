"""可观测性：指标派生（observability.md §3）。

从状态直接派生、可机器计算。eval 复用这些指标打分，不重复实现。
"""
from __future__ import annotations

from collections import Counter

from ..state.graph import AgentState


def compute_metrics(state: AgentState) -> dict:
    """从状态派生核心指标。"""
    matrix = state.get("matrix")
    coverage = matrix.coverage if matrix else 0.0

    claims = state.get("claims", [])
    strength_dist = dict(Counter(c.strength.value for c in claims))

    subtasks = state.get("subtasks", [])
    retries = sum(t.retry_count for t in subtasks)

    return {
        "coverage": coverage,
        "strength_distribution": strength_dist,
        "claim_count": len(claims),
        "subtask_count": len(subtasks),
        "total_retries": retries,
    }
