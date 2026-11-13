"""评估模块：回归门禁（eval.md §6.3）。

评估分数低于基线阈值（相对下降 > 5%）则阻止上线（见 operations.md §6）。
"""
from __future__ import annotations

# 相对下降超过该阈值即判定回归（eval.md §6.3，默认 5%）
DEFAULT_REGRESSION_THRESHOLD = 0.05


def check_regression(
    current: dict[str, float],
    baseline: dict[str, float],
    threshold: float = DEFAULT_REGRESSION_THRESHOLD,
) -> dict:
    """回归门禁：任一指标相对下降超阈值则 fail。

    返回 {pass: bool, regressions: [指标], deltas: {指标: 相对变化率}}。
    """
    regressions: list[str] = []
    deltas: dict[str, float] = {}
    for k, base in baseline.items():
        cur = current.get(k)
        if cur is None or base == 0:
            continue
        delta = (cur - base) / base
        deltas[k] = round(delta, 4)
        if delta < -threshold:
            regressions.append(k)
    return {"pass": not regressions, "regressions": regressions, "deltas": deltas}
