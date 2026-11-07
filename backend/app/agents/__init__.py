"""四角色 Agent 定义：lead / collector / verifier / synthesizer。"""
from __future__ import annotations

import json
import re


def parse_json(text: str) -> dict:
    """从 LLM 输出中提取 JSON 对象（容忍 markdown 代码块包裹与前后噪声）。"""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)
