"""评估模块：报告质量评分（RACE 式 rubric，eval.md §3.1）。

judge-as-LLM：按四维度打分，复用 backend 的 LLM 封装。
"""
from __future__ import annotations

from backend.app.agents import parse_json
from backend.app.llm.client import LLMClient

_PROMPT = """你是评估者。对以下行业调研报告按四维度打分（1-5 分）：
- 全面性：是否覆盖应覆盖的区块
- 洞察力：核心结论是否有增量判断
- 指令遵循：是否遵循用户口径与深度
- 信息密度：关键指标是否落在头部摘要

报告：
{report}

只输出 JSON，不要输出其他文字：
{{"全面性": 5, "洞察力": 4, "指令遵循": 4, "信息密度": 5}}
"""


def score_report(llm: LLMClient, report: str) -> dict:
    """对报告做 rubric 评分，返回各维度分数。"""
    raw = llm.complete([{"role": "user", "content": _PROMPT.format(report=report)}])
    return parse_json(raw)
