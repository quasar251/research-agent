"""记忆模块：核心记忆 + 长期记忆（memory.md）。"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class CoreMemory:
    """核心记忆块：常驻上下文、可编辑。"""

    content: str
    scope: str = "user"  # run / user
    editable: bool = True
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class LongTermMemory:
    """长期记忆条目：检索式存储，带命名空间与冲突标记。"""

    id: str
    namespace: str  # 结论 / 口径 / 来源 / 关注维度 / 用户偏好
    content: str
    source_ref: str | None = None
    conflict: bool = False
    scope: str = "user"


def upsert_longterm(existing: list[LongTermMemory], incoming: list[LongTermMemory]) -> list[LongTermMemory]:
    """写时合并：同 id 覆盖，冲突标记而非静默覆盖（写时处理）。"""
    merged: dict[str, LongTermMemory] = {m.id: m for m in existing}
    for m in incoming:
        if m.id in merged and merged[m.id].content != m.content:
            m = LongTermMemory(
                id=m.id, namespace=m.namespace, content=m.content,
                source_ref=m.source_ref, conflict=True, scope=m.scope,
            )
        merged[m.id] = m
    return list(merged.values())
