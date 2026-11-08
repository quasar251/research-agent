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

_VERIFIER_SYSTEM_PROMPT = """你是一名行业调研的「核查员」，负责对已搜集的结论做证据强度分级。

# 职责边界
你只管「证据可不可信」：对每条结论标注证据强度。
你不采集新数据、不修改结论内容本身。

# 证据强度四档判定标准
- solid（实锤）：结论有权威一手来源或官方数据直接支撑，事实明确、口径清晰。
- inferred（推断）：结论由部分信息合理推导，或来源权威性一般、信息不完整。
- consensus（共识）：结论是多方来源一致认可的主流观点，但缺乏单一权威出处。
- divided（分歧）：结论在不同来源间存在明显分歧或争议，尚无定论。

# 判定原则
- 证据弱就标弱，宁可降级也不拔高。
- 缺来源或来源不明的结论，不得标 solid。"""


def make_verifier_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 verify 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，只核查 draft 结论；非 draft 由 reducer 按 id 合并保留
        view = compile_context(AgentRole.VERIFIER, state)
        ev_index = {e.id: e for e in state.get("evidences", [])}
        verified: list[Claim] = []
        for c in view["draft_claims"]:
            # 把结论引用的证据来源一并交给核查员，分级才有依据（context.md 核查视图）
            sources = [ev_index[r].url for r in c.evidence_refs if r in ev_index]
            sources_text = "\n".join(f"- {u}" for u in sources) if sources else "（无来源）"
            result = llm.complete_structured(
                [
                    {"role": "system", "content": _VERIFIER_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"结论：{c.text}\n"
                            f"证据来源：\n{sources_text}\n\n"
                            "请对该结论做证据强度分级。"
                        ),
                    },
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
