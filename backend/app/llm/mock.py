"""LLM 层：离线确定性 Mock（无 API key 时用于本地演示 / 前端联调）。

产出确定性的研究计划、结论、分级与摘要，让前端能真实跑通四阶段数据流，
而非「LLM 假装回答」。与测试里的 MockLLM 等价，但作为共享的离线入口。

支持「模拟等待时间」：设置 delay_s（或环境变量 MOCK_DELAY_MS）让每次
LLM 调用前 sleep，使各阶段/SSE 事件按真实节奏推进，便于验证中间态与轮询等待。
用法：MOCK_DELAY_MS=200 uv run python backend/serve.py
"""
from __future__ import annotations

import os
import time
from typing import Any

from .client import ChatMessage


class OfflineMockLLM:
    """离线确定性 LLM：四阶段各返回固定结构，无网络、无 key。

    Args:
        delay_s: 每次 LLM 调用前的模拟耗时（秒）。None 时读环境变量
            MOCK_DELAY_MS（毫秒），默认 0（不等待）。
    """

    model = "offline-mock"

    def __init__(self, delay_s: float | None = None) -> None:
        if delay_s is None:
            delay_s = float(os.environ.get("MOCK_DELAY_MS", "0")) / 1000.0
        self.delay_s = max(0.0, delay_s)
        # 调用时间轴：[(tool_name, 距实例创建的秒数)]，供测试断言阶段顺序与耗时
        self.calls: list[tuple[str, float]] = []
        self._t0 = time.monotonic()

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        return "{}"

    def complete_structured(
        self,
        messages: list[ChatMessage],
        tool_name: str,
        input_schema: dict[str, Any],
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        if self.delay_s:
            time.sleep(self.delay_s)
        self.calls.append((tool_name, round(time.monotonic() - self._t0, 4)))
        if tool_name == "submit_plan":
            return {
                "companies": ["OpenAI", "Anthropic", "Google DeepMind"],
                "dims": ["市场规模", "竞争格局", "技术趋势"],
                "subtasks": [
                    {"id": "t1", "question": "AI Agent 行业市场规模与增速", "company": "OpenAI", "dim": "市场规模"},
                    {"id": "t2", "question": "头部厂商竞争格局", "company": "Anthropic", "dim": "竞争格局"},
                    {"id": "t3", "question": "技术演进趋势", "company": "Google DeepMind", "dim": "技术趋势"},
                ],
            }
        if tool_name == "submit_claims":
            return {
                "claims": [
                    {"text": "全球 AI Agent 市场 2025 年规模约 52 亿美元，三年 CAGR 约 72%。", "evidence_urls": []},
                    {"text": "头部厂商竞争从模型参数转向任务成功率与生态集成。", "evidence_urls": []},
                ]
            }
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_answer":
            return {
                "answer": "根据已调研结论，AI Agent 市场 2025 年规模约 52 亿美元，预计 2028 年突破 300 亿美元，增速主要由任务成功率与生态集成驱动。"
            }
        if tool_name == "submit_report":
            return {
                "summary": "AI Agent 行业处于爆发前夜，2025 年规模约 52 亿美元，预计 2028 年突破 300 亿美元。价值捕获正从模型能力上移至任务成功率与生态集成。",
                "sections": [
                    {
                        "heading": "市场规模",
                        "kind": "chart",
                        "unit": "亿美元",
                        "series": [
                            {"year": "2024", "value": 18},
                            {"year": "2025", "value": 52},
                            {"year": "2026", "value": 98},
                            {"year": "2027", "value": 176},
                            {"year": "2028", "value": 305},
                        ],
                    },
                    {
                        "heading": "竞争格局",
                        "kind": "bars",
                        "bars": [
                            {"name": "OpenAI", "pct": 24},
                            {"name": "微软", "pct": 19},
                            {"name": "Google", "pct": 15},
                            {"name": "Anthropic", "pct": 11},
                            {"name": "其他", "pct": 31},
                        ],
                    },
                    {
                        "heading": "SWOT 分析",
                        "kind": "swot",
                        "swot": {
                            "strengths": ["大模型调用成本快速下降，落地门槛降低", "工具调用与多步推理能力成熟"],
                            "weaknesses": ["幻觉与不可控行为制约高价值场景", "端到端稳定性与可观测性门槛较高"],
                            "opportunities": ["企业提效诉求带来可量化 ROI 场景", "垂直行业 Agent 率先规模化付费"],
                            "threats": ["开源模型快速追赶压缩闭源溢价", "数据安全与合规抬高交付成本"],
                        },
                    },
                    {
                        "heading": "风险提示",
                        "kind": "risk",
                        "risks": [
                            {"name": "幻觉制约高价值场景采用", "likelihood": 4, "impact": 5},
                            {"name": "开源模型压缩闭源溢价", "likelihood": 4, "impact": 4},
                            {"name": "数据安全合规抬高交付成本", "likelihood": 3, "impact": 4},
                        ],
                    },
                ],
            }
        return {}
