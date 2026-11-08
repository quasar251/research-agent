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


def make_synthesizer_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 synthesize 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，聚合所有结论
        view = compile_context(AgentRole.SYNTHESIZER, state)
        claims = view["claims"]
        claims_text = "\n".join(f"- {c.text}" for c in claims)
        # 超预算则压缩，保留结论 id 作为来源指针
        if should_compress(claims_text, _BUDGET):
            claims_text = compress(claims_text, _BUDGET, [c.id for c in claims])
        result = llm.complete_structured(
            [
                {
                    "role": "user",
                    "content": f"聚合以下结论，去重后产出一段摘要：\n{claims_text}",
                }
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
