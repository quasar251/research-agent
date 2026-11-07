"""评估模块：过程质量评分（eval.md §3.3）。

复用 observability 的指标，对其打分，不重复计算。
"""
from __future__ import annotations

from backend.app.observability.metrics import compute_metrics
from backend.app.state.graph import AgentState


def score_process(state: AgentState) -> dict:
    """基于过程指标打分。"""
    m = compute_metrics(state)
    coverage = m["coverage"]
    solid_ratio = _solid_ratio(m["strength_distribution"])

    # 覆盖度 ≥ 0.9 记为优，证据强度中 solid 占比越高越可信
    coverage_ok = coverage >= 0.9
    return {
        "coverage": coverage,
        "coverage_ok": coverage_ok,
        "solid_ratio": solid_ratio,
        "total_retries": m["total_retries"],
    }


def _solid_ratio(strength_dist: dict[str, int]) -> float:
    total = sum(strength_dist.values())
    if total == 0:
        return 0.0
    return round(strength_dist.get("solid", 0) / total, 4)
