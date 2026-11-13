"""可观测性：指标派生（observability.md §3）。

从状态直接派生、可机器计算。eval 复用这些指标打分，不重复实现。
ops_metrics 输出 operations.md 采集用的规范指标名（observability.md §7.1）。
"""
from __future__ import annotations

from collections import Counter

from ..state.graph import AgentState
from ..state.schema import TaskStatus


def compute_metrics(state: AgentState) -> dict:
    """从状态派生核心指标（供 API / eval 使用）。"""
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


def collect_llm_stats(clients) -> dict:
    """汇总各 LLM client 的 token 与延迟埋点（observability.md §7.1）。"""
    total_tokens = 0
    total_calls = 0
    latencies: list[float] = []
    for c in clients:
        total_tokens += getattr(c, "total_tokens", 0) or 0
        total_calls += getattr(c, "total_calls", 0) or 0
        latencies.extend(getattr(c, "latencies", []) or [])
    return {
        "token_consumed_total": total_tokens,
        "total_calls": total_calls,
        "latency_p95": _p95(latencies),
    }


def ops_metrics(state: AgentState, llm_stats: dict | None = None) -> dict:
    """operations.md 采集的规范指标（observability.md §7.1）。"""
    matrix = state.get("matrix")
    coverage = matrix.coverage if matrix else 0.0

    subtasks = state.get("subtasks", [])
    total = len(subtasks)
    unresolved = sum(1 for t in subtasks if t.status == TaskStatus.UNRESOLVED)
    retries = sum(t.retry_count for t in subtasks)

    llm_stats = llm_stats or {}
    return {
        "research_coverage": coverage,
        "research_unresolved_ratio": round(unresolved / total, 4) if total else 0.0,
        "llm_retry_ratio": round(retries / total, 4) if total else 0.0,
        "llm_latency_p95": llm_stats.get("latency_p95", 0.0),
        "token_consumed_total": llm_stats.get("token_consumed_total", 0),
    }


def _p95(values: list[float]) -> float:
    """p95 分位延迟（无数据返回 0）。"""
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(len(ordered) * 0.95))
    return round(ordered[idx], 4)
