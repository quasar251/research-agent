"""Synthesizer 角色：合成（synthesize 阶段）。

聚合去重所有结论，产出结构化报告（ReportModel，对齐前端 Report 接口）。
摘要由 LLM 生成，其余字段从台账（claims / evidences / matrix）派生，保证可溯源。
"""
from __future__ import annotations

from typing import Callable

from ..context.budget import compress, should_compress
from ..context.compiler import compile_context
from ..llm.client import LLMClient
from ..state.graph import AgentState
from ..state.schema import (
    AgentRole,
    ReportCitation,
    ReportModel,
    ReportTakeaway,
    StageName,
)

_BUDGET = 4000  # 合成阶段的上下文 token 预算（context.md §5）

_SYNTHESIZE_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}},
    "required": ["summary"],
}

# 证据强度中文标签，供摘要上下文展示置信度（对齐 security.md 四档）
_STRENGTH_ZH = {
    "solid": "实锤",
    "inferred": "推断",
    "consensus": "共识",
    "divided": "分歧",
}

_SYNTHESIZER_SYSTEM_PROMPT = """你是一名行业调研的「合成员」，负责把所有已核查的结论聚合为一份结构化报告的摘要。

# 职责边界
你只管「结论矛不矛盾」：聚合去重结论、提炼摘要。
你不重复做证据分级（核查员已完成），也不引入任何新的事实或数据。

# 摘要编写要求
- 把去重后的结论提炼为一段连贯的行业摘要，覆盖本次调研的核心发现。
- 摘要要落到可验证的判断上，避免空泛套话；关键指标（如市场规模、增速）优先呈现。
- 若结论之间存在分歧，如实呈现分歧，而非强行统一；证据弱（推断/分歧）的结论应降低确定性表述。
- 只基于给定结论撰写，不得补充结论之外的数字或事实。"""


def make_synthesizer_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 synthesize 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，聚合所有结论
        view = compile_context(AgentRole.SYNTHESIZER, state)
        claims = view["claims"]
        claims_text = "\n".join(
            f"- {c.text}（证据强度：{_STRENGTH_ZH.get(c.strength.value, c.strength.value)}）"
            for c in claims
        )
        # 超预算则压缩，保留结论 id 作为来源指针
        if should_compress(claims_text, _BUDGET):
            claims_text = compress(claims_text, _BUDGET, [c.id for c in claims])
        result = llm.complete_structured(
            [
                {"role": "system", "content": _SYNTHESIZER_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "以下是本次调研产出的结论（含证据强度）：\n\n"
                        f"{claims_text}\n\n"
                        "请聚合去重后产出一段摘要。"
                    ),
                },
            ],
            tool_name="submit_report",
            input_schema=_SYNTHESIZE_SCHEMA,
        )

        # 从状态组装结构化报告：summary 由 LLM 产出，其余由台账派生
        evidences = state.get("evidences", [])
        ev_index = {e.id: i for i, e in enumerate(evidences)}
        citations = [ReportCitation(title=e.url, source=e.url) for e in evidences]
        takeaways = [
            ReportTakeaway(
                text=c.text,
                strength=c.strength,
                refs=[ev_index[ref] for ref in c.evidence_refs if ref in ev_index],
            )
            for c in claims
        ]
        report = ReportModel(
            topic=state.get("intent", ""),
            summary=result.get("summary", ""),
            takeaways=takeaways,
            citations=citations,
            coverage=state["matrix"].coverage,
        )
        return {"report": report, "stage": StageName.SYNTHESIZE}

    return node
