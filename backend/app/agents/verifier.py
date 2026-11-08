"""Verifier 角色：核查（verify 阶段）。

对草稿结论做证据分级，标注证据强度，状态从 draft 转 verified。
"""
from __future__ import annotations

from typing import Callable

from ..context.compiler import compile_context
from ..llm.client import LLMClient
from ..orchestration.supervisor import reopen_gaps
from ..state.graph import AgentState
from ..state.schema import AgentRole, Claim, ClaimStatus, EvidenceStrength

_VERIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "strength": {
            "type": "string",
            "enum": ["solid", "inferred", "consensus", "divided"],
        },
    },
    "required": ["strength"],
}


def make_verifier_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 verify 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，只核查 draft 结论；非 draft 由 reducer 按 id 合并保留
        view = compile_context(AgentRole.VERIFIER, state)
        verified: list[Claim] = []
        for c in view["draft_claims"]:
            result = llm.complete_structured(
                [
                    {
                        "role": "user",
                        "content": (
                            f"结论：{c.text}\n"
                            "请做证据分级，标注证据强度（solid 实锤 / inferred 推断 / "
                            "consensus 共识 / divided 分歧）。"
                        ),
                    }
                ],
                tool_name="submit_verdict",
                input_schema=_VERIFY_SCHEMA,
            )
            strength = EvidenceStrength(result.get("strength", "inferred"))
            verified.append(
                c.model_copy(update={"strength": strength, "status": ClaimStatus.VERIFIED})
            )

        # 缺口重派：核查后对比预期 vs 实际，重开 gap 对应的子任务（reliability.md §4）
        subtasks, matrix = reopen_gaps(state.get("subtasks", []), state["matrix"])
        return {"claims": verified, "subtasks": subtasks, "matrix": matrix}

    return node
