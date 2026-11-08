"""LLM 层：熔断冷却状态机（reliability.md §2）。

closed → open（连续失败达阈值）→ 冷却后 half-open（放行一次探测）→ 成功回 closed。
"""
from __future__ import annotations

import time


class CircuitBreaker:
    """熔断器：连续失败打开熔断，冷却后进入半开探测。"""

    def __init__(self, failure_threshold: int = 5, cooldown: float = 30.0) -> None:
        self.failure_threshold = failure_threshold
        self.cooldown = cooldown
        self._failures = 0
        self._state = "closed"  # closed / open / half_open
        self._opened_at = 0.0

    @property
    def state(self) -> str:
        return self._state

    def allow(self) -> bool:
        """是否放行请求。open 状态在冷却期内直接拒绝，冷却期满转 half-open 探测。"""
        if self._state == "closed":
            return True
        if self._state == "open":
            if time.monotonic() - self._opened_at >= self.cooldown:
                self._state = "half_open"
                return True
            return False
        return True  # half_open：放行一次探测

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._state = "open"
            self._opened_at = time.monotonic()

    def record_success(self) -> None:
        self._failures = 0
        self._state = "closed"
