"""Synthesizer 角色：合成（synthesize 阶段）。

聚合去重所有结论，产出结构化报告（ReportModel，对齐前端 Report 接口）。
摘要由 LLM 生成，其余字段从台账（claims / evidences / matrix）派生，保证可溯源。
"""
from __future__ import annotations

from typing import Callable

from ..context.budget import compress, should_compress
from ..context.compiler import compile_context
from ..llm.client import LLMClient, LLMError
from ..skill.loader import build_system_prompt
from ..skill.registry import SkillRegistry
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

_SYNTHESIZER_BASE = """你是一名行业调研的「合成员」，负责把所有已核查的结论聚合为一份结构化报告的摘要。

# 职责边界
你只管「结论矛不矛盾」：聚合去重结论、提炼摘要。
你不重复做证据分级（核查员已完成），也不引入任何新的事实或数据。"""


def make_synthesizer_node(
    llm: LLMClient, skill_registry: SkillRegistry | None = None
) -> Callable[[AgentState], dict]:
    """返回 synthesize 阶段的节点函数。摘要规范与报告结构由 Skill 随阶段注入。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，聚合所有结论
        view, snapshot = compile_context(AgentRole.SYNTHESIZER, state)
        claims = view["claims"]
        claims_text = "\n".join(
            f"- {c.text}（证据强度：{_STRENGTH_ZH.get(c.strength.value, c.strength.value)}）"
            for c in claims
        )
        # 超预算则压缩，保留结论 id 作为来源指针
        if should_compress(claims_text, _BUDGET):
            claims_text = compress(claims_text, _BUDGET, [c.id for c in claims])
        system_prompt = build_system_prompt(
            _SYNTHESIZER_BASE, skill_registry, StageName.SYNTHESIZE
        )
        try:
            result = llm.complete_structured(
                [
                    {"role": "system", "content": system_prompt},
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
            summary = result.get("summary", "")
            errors: list[str] = []
        except LLMError as exc:
            # 失败兜底：摘要降级为空，报告仍由台账（takeaways/citations）派生，不崩溃
            summary = ""
            errors = [f"报告摘要生成失败：{exc}"]

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
            summary=summary,
            takeaways=takeaways,
            citations=citations,
            coverage=state["matrix"].coverage,
        )
        return {
            "report": report,
            "snapshots": [snapshot],
            "errors": errors,
            "stage": StageName.SYNTHESIZE,
        }

    return node
