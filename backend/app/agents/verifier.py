"""Verifier 角色：核查（verify 阶段）。

对草稿结论做证据分级，标注证据强度，状态从 draft 转 verified。
"""
from __future__ import annotations

from typing import Callable

from ..context.compiler import compile_context
from ..llm.client import LLMClient, LLMError
from ..orchestration.supervisor import reopen_gaps
from ..skill.loader import build_system_prompt
from ..skill.registry import SkillRegistry
from ..state.graph import AgentState
from ..state.schema import AgentRole, Claim, ClaimStatus, EvidenceStrength, StageName

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

_VERIFIER_BASE = """你是一名行业调研的「核查员」，负责对已搜集的结论做证据强度分级。

# 职责边界
你只管「证据可不可信」：对每条结论标注证据强度。
你不采集新数据、不修改结论内容本身。"""


def make_verifier_node(
    llm: LLMClient, skill_registry: SkillRegistry | None = None
) -> Callable[[AgentState], dict]:
    """返回 verify 阶段的节点函数。证据分级规则由 Skill 随阶段注入。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，只核查 draft 结论；非 draft 由 reducer 按 id 合并保留
        view, snapshot = compile_context(AgentRole.VERIFIER, state)
        ev_index = {e.id: e for e in state.get("evidences", [])}
        system_prompt = build_system_prompt(_VERIFIER_BASE, skill_registry, StageName.VERIFY)
        verified: list[Claim] = []
        errors: list[str] = []
        for c in view["draft_claims"]:
            # 把结论引用的证据来源一并交给核查员，分级才有依据（context.md 核查视图）
            sources = [ev_index[r].url for r in c.evidence_refs if r in ev_index]
            sources_text = "\n".join(f"- {u}" for u in sources) if sources else "（无来源）"
            try:
                result = llm.complete_structured(
                    [
                        {"role": "system", "content": system_prompt},
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
            except LLMError as exc:
                # 失败兜底：核查失败降级为默认强度 inferred，不中断循环
                verified.append(
                    c.model_copy(
                        update={
                            "strength": EvidenceStrength.INFERRED,
                            "status": ClaimStatus.VERIFIED,
                        }
                    )
                )
                errors.append(f"核查失败[{c.id}]：{exc}")
                continue
            strength = EvidenceStrength(result.get("strength", "inferred"))
            verified.append(
                c.model_copy(update={"strength": strength, "status": ClaimStatus.VERIFIED})
            )

        # 缺口重派：核查后对比预期 vs 实际，重开 gap 对应的子任务（reliability.md §4）
        subtasks, matrix = reopen_gaps(state.get("subtasks", []), state["matrix"])
        return {
            "claims": verified,
            "subtasks": subtasks,
            "matrix": matrix,
            "snapshots": [snapshot],
            "errors": errors,
        }

    return node
