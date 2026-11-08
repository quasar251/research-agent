"""LLM 层：anthropic sdk 封装（生产级）。

生产级改造（对应 `reliability.md`）：
- 结构化输出：用 tool use 强制 schema，替代「让模型输出 JSON 再赌它能 parse」
- 超时 + 指数退避重试 + 错误分类（可重试 vs 不可重试）
"""
from __future__ import annotations

import time
from typing import Any, Protocol, TypedDict

import anthropic


class ChatMessage(TypedDict):
    """一条对话消息。"""

    role: str
    content: str


class LLMError(Exception):
    """LLM 调用错误，带可重试标记（reliability.md §1）。"""

    def __init__(self, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class LLMClient(Protocol):
    """LLM 调用接口，便于测试注入 mock。"""

    model: str

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        """返回自由文本。"""
        ...

    def complete_structured(
        self,
        messages: list[ChatMessage],
        tool_name: str,
        input_schema: dict[str, Any],
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """用 tool use 强制 schema，返回结构化 dict。"""
        ...


# 可重试的 anthropic 异常（超时 / 限流 / 连接 / 5xx）
_RETRYABLE = (
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.APIConnectionError,
    anthropic.InternalServerError,
)
# 不可重试（鉴权 / 参数错误）
_NON_RETRYABLE = (anthropic.AuthenticationError, anthropic.BadRequestError)


def _classify(exc: Exception) -> LLMError:
    """把 anthropic 异常归类为可重试 / 不可重试。"""
    if isinstance(exc, _NON_RETRYABLE):
        return LLMError(f"不可重试错误: {exc}", retryable=False)
    return LLMError(f"可重试错误: {exc}", retryable=True)


class AnthropicClient:
    """基于 anthropic sdk 的 Claude 客户端。"""

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-5",
        timeout: float = 60.0,
        max_retries: int = 3,
    ) -> None:
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout)
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries

    def _retry_sleep(self, attempt: int) -> None:
        time.sleep(2 ** attempt)  # 指数退避 1s / 2s / 4s

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        last: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                resp = self._client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    messages=messages,
                )
                return "".join(b.text for b in resp.content if b.type == "text")
            except Exception as exc:  # noqa: BLE001 - 统一归类
                err = _classify(exc)
                if not err.retryable:
                    raise err
                last = exc
                if attempt < self.max_retries - 1:
                    self._retry_sleep(attempt)
        raise LLMError(f"重试 {self.max_retries} 次后仍失败: {last}", retryable=True)

    def complete_structured(
        self,
        messages: list[ChatMessage],
        tool_name: str,
        input_schema: dict[str, Any],
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        tools = [
            {
                "name": tool_name,
                "description": f"提交结构化结果：{tool_name}",
                "input_schema": input_schema,
            }
        ]
        last: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                resp = self._client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    tools=tools,
                    tool_choice={"type": "tool", "name": tool_name},
                    messages=messages,
                )
                for block in resp.content:
                    if block.type == "tool_use":
                        return dict(block.input)
                # 未产出 tool_use，视为可重试
                raise LLMError("模型未产出结构化输出", retryable=True)
            except LLMError:
                last = None
                if attempt < self.max_retries - 1:
                    self._retry_sleep(attempt)
                continue
            except Exception as exc:  # noqa: BLE001
                err = _classify(exc)
                if not err.retryable:
                    raise err
                last = exc
                if attempt < self.max_retries - 1:
                    self._retry_sleep(attempt)
        raise LLMError(f"结构化输出重试 {self.max_retries} 次后仍失败: {last}", retryable=True)
