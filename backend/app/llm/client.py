"""LLM 层：anthropic sdk 封装。

用 `LLMClient` 协议定义调用接口，测试时注入 mock，不调真实 API。
"""
from __future__ import annotations

from typing import Protocol, TypedDict

import anthropic


class ChatMessage(TypedDict):
    """一条对话消息。"""

    role: str
    content: str


class LLMClient(Protocol):
    """LLM 调用接口，便于测试与扩展（mock / 真实 / 其他模型）。"""

    model: str

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        """给定对话消息，返回模型文本回复。"""
        ...


class AnthropicClient:
    """基于 anthropic sdk 的 Claude 客户端。"""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5") -> None:
        self._client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        resp = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=messages,
        )
        # 拼接所有文本块
        return "".join(block.text for block in resp.content if block.type == "text")
