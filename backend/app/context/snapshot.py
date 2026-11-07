"""上下文模块：上下文快照（context.md §2）。

快照记录"该角色看到了哪些来源 / 结论的 id + 编译参数"，用于溯源"当时看到了什么"。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from ..state.schema import AgentRole


@dataclass
class ContextSnapshot:
    """一次上下文编译的快照。"""

    role: AgentRole
    source_ids: list[str] = field(default_factory=list)
    claim_ids: list[str] = field(default_factory=list)
    params: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def provenance(self) -> str:
        """可溯源摘要：该角色当时看到了哪些来源 / 结论。"""
        return (
            f"{self.role.value} 看到 sources={self.source_ids} claims={self.claim_ids}"
        )
