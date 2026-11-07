"""Synthesizer 角色：合成（synthesize 阶段）。

聚合去重所有结论，产出最终报告。
"""
from __future__ import annotations

from typing import Callable

from ..llm.client import LLMClient
from ..state.graph import AgentState
from ..state.schema import StageName
from . import parse_json

_PROMPT = """你是行业调研的合成者 Synthesizer。聚合以下结论，去重后产出一份报告。

结论列表：
{claims}

只输出 JSON，不要输出任何其他文字，格式如下：
{{"report": "报告正文"}}
"""


def make_synthesizer_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 synthesize 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        claims = state.get("claims", [])
        claims_text = "\n".join(f"- {c.text}" for c in claims)
        raw = llm.complete([{"role": "user", "content": _PROMPT.format(claims=claims_text)}])
        result = parse_json(raw)
        return {"report": result.get("report", ""), "stage": StageName.SYNTHESIZE}

    return node
