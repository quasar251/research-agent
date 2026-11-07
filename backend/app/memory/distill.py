"""记忆模块：蒸馏节点（memory.md §3）。

任务收尾时，把「已验证」的结论沉淀为长期记忆。写入结构化结论，不存抓取全文。
"""
from __future__ import annotations

from ..state.schema import Claim, ClaimStatus
from .store import LongTermMemory


def distill(claims: list[Claim]) -> list[LongTermMemory]:
    """把已验证 / 已沉淀的结论蒸馏为长期记忆条目。"""
    memories: list[LongTermMemory] = []
    for c in claims:
        if c.status in (ClaimStatus.VERIFIED, ClaimStatus.DISTILLED):
            memories.append(
                LongTermMemory(
                    id=c.id,
                    namespace="结论",
                    content=c.text,
                    source_ref=",".join(c.evidence_refs) if c.evidence_refs else None,
                )
            )
    return memories
