"""可观测性：审计日志（observability.md §4）。"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class AuditEvent:
    """一条审计事件。"""

    type: str  # 上下文编译 / 状态写入 / 工具调用 / Skill 加载 / 派发 / 注入扫描 / 隐私脱敏
    subject: str
    payload: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLog:
    """内存审计日志，记录 + 按类型查询。"""

    def __init__(self) -> None:
        self._events: list[AuditEvent] = []

    def record(self, type_: str, subject: str, payload: dict | None = None) -> None:
        self._events.append(AuditEvent(type=type_, subject=subject, payload=payload or {}))

    def query(self, type_: str | None = None) -> list[AuditEvent]:
        if type_ is None:
            return list(self._events)
        return [e for e in self._events if e.type == type_]
