"""评估模块：事实与引用核验（FACT 式，eval.md §3.2）。

claim 级事实核查：判定结论的证据支撑情况（SAFE 式 supported / unsupported / contradicted）。
"""
from __future__ import annotations

from backend.app.agents import parse_json
from backend.app.llm.client import LLMClient
from backend.app.state.schema import Claim

_PROMPT = """你是事实核查者。判断以下结论是否有证据支撑。

结论：{text}

只输出 JSON，不要输出其他文字：
{{"verdict": "supported"}}
verdict 取值：supported（有支撑）/ unsupported（无支撑）/ contradicted（与来源矛盾）
"""


def verify_claim(llm: LLMClient, claim: Claim) -> str:
    """核查单条结论，返回 verdict。"""
    raw = llm.complete([{"role": "user", "content": _PROMPT.format(text=claim.text)}])
    result = parse_json(raw)
    return result.get("verdict", "unsupported")
