"""可观测性：追踪链（observability.md §2）。

追踪一条结论的完整来源链：哪个 Agent、什么强度、哪些来源。
"""
from __future__ import annotations

from ..state.schema import Claim, Evidence


def trace_claim(claim: Claim, evidences: list[Evidence]) -> dict:
    """追踪一条结论的来源链。"""
    refs = [e for e in evidences if e.id in claim.evidence_refs]
    return {
        "claim_id": claim.id,
        "role": claim.role.value,
        "strength": claim.strength.value,
        "sources": [{"id": e.id, "url": e.url} for e in refs],
    }
