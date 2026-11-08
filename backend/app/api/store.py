"""接口层：任务存储（内存实现，后续接 SQLite 持久化，见 state.md §三）。"""
from __future__ import annotations

from typing import Any


class TaskStore:
    """按 run_id 存储任务状态与结果。"""

    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}

    def create(self, run_id: str, intent: str) -> None:
        self._tasks[run_id] = {"status": "pending", "intent": intent, "result": None}

    def update(self, run_id: str, status: str, result: dict | None = None) -> None:
        if run_id not in self._tasks:
            return
        self._tasks[run_id]["status"] = status
        if result is not None:
            self._tasks[run_id]["result"] = result

    def get(self, run_id: str) -> dict[str, Any] | None:
        return self._tasks.get(run_id)
