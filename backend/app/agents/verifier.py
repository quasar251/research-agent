"""Verifier 角色：核查（verify 阶段）。

对草稿结论做证据分级，标注证据强度，状态从 draft 转 verified。
"""
from __future__ import annotations

from typing import Callable

from ..llm.client import LLMClient
from ..state.graph import AgentState
from ..state.schema import Claim, ClaimStatus, EvidenceStrength, StageName
from . import parse_json

_PROMPT = """你是行业调研的核查者 Verifier。对结论做证据分级，标注证据强度。

结论：{text}

只输出 JSON，不要输出任何其他文字。证据强度四档：solid（实锤）/ inferred（推断）/ consensus（共识）/ divided（分歧）。
格式如下：
{{"strength": "inferred"}}
"""


def make_verifier_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 verify 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        claims = state.get("claims", [])
        verified: list[Claim] = []
        for c in claims:
            if c.status != ClaimStatus.DRAFT:
                verified.append(c)
                continue
            raw = llm.complete([{"role": "user", "content": _PROMPT.format(text=c.text)}])
            result = parse_json(raw)
            strength = EvidenceStrength(result.get("strength", "inferred"))
            verified.append(
                c.model_copy(update={"strength": strength, "status": ClaimStatus.VERIFIED})
            )
        return {"claims": verified, "stage": StageName.SYNTHESIZE}

    return node
