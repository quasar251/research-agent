"""Synthesizer 角色：合成（synthesize 阶段）。

聚合去重所有结论，产出最终报告。
"""
from __future__ import annotations

from typing import Callable

from ..llm.client import LLMClient
from ..state.graph import AgentState
from ..state.schema import StageName

_SYNTHESIZE_SCHEMA = {
    "type": "object",
    "properties": {"report": {"type": "string"}},
    "required": ["report"],
}


def make_synthesizer_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 synthesize 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        claims = state.get("claims", [])
        claims_text = "\n".join(f"- {c.text}" for c in claims)
        result = llm.complete_structured(
            [
                {
                    "role": "user",
                    "content": f"聚合以下结论，去重后产出一份报告：\n{claims_text}",
                }
            ],
            tool_name="submit_report",
            input_schema=_SYNTHESIZE_SCHEMA,
        )
        return {"report": result.get("report", ""), "stage": StageName.SYNTHESIZE}

    return node
