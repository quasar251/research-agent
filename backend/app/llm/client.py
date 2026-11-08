"""LLM 层：anthropic sdk 封装（生产级）。

生产级改造（对应 `reliability.md`）：
- 结构化输出：优先 tool use；端点不支持时降级为「prompt 引导 JSON + 容错解析」
- 超时 + 指数退避重试 + 错误分类（可重试 vs 不可重试）+ 熔断冷却
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Protocol, TypedDict

import anthropic

from .circuit_breaker import CircuitBreaker


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


def _parse_json(text: str) -> dict:
    """从模型文本输出中容错提取 JSON 对象（容忍 markdown 代码块与前后噪声）。"""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


class AnthropicClient:
    """基于 anthropic sdk 的 Claude 客户端。"""

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-5",
        base_url: str | None = None,
        timeout: float = 60.0,
        max_retries: int = 3,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        # base_url 支持 anthropic 兼容端点（如智谱 GLM 的 open.bigmodel.cn/api/anthropic）
        self._client = anthropic.Anthropic(api_key=api_key, base_url=base_url, timeout=timeout)
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries
        self.circuit_breaker = circuit_breaker or CircuitBreaker()

    def _retry_sleep(self, attempt: int) -> None:
        time.sleep(2 ** attempt)  # 指数退避 1s / 2s / 4s

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        if not self.circuit_breaker.allow():
            raise LLMError("熔断中，请求被拒绝", retryable=False)
        last: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                resp = self._client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    messages=messages,
                    # 关闭深度思考：兼容端点（DeepSeek）返回 thinking 块会触发 SDK 解析 bug
                    thinking={"type": "disabled"},
                )
                self.circuit_breaker.record_success()
                return "".join(b.text for b in resp.content if b.type == "text")
            except Exception as exc:  # noqa: BLE001 - 统一归类
                err = _classify(exc)
                if not err.retryable:
                    self.circuit_breaker.record_failure()
                    raise err
                last = exc
                if attempt < self.max_retries - 1:
                    self._retry_sleep(attempt)
        self.circuit_breaker.record_failure()
        raise LLMError(f"重试 {self.max_retries} 次后仍失败: {last}", retryable=True)

    def complete_structured(
        self,
        messages: list[ChatMessage],
        tool_name: str,
        input_schema: dict[str, Any],
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """结构化输出。

        当前端点（智谱 anthropic 兼容）不支持 tool use，降级为
        「prompt 引导 JSON 输出 + 容错解析 + 解析失败重试」。
        """
        schema_hint = json.dumps(input_schema, ensure_ascii=False)
        prompt = (
            f"{messages[-1]['content']}\n\n"
            f"请只输出一个 JSON 对象，符合以下 schema，"
            f"不要输出 markdown 代码块或其他任何文字：\n{schema_hint}"
        )
        new_messages: list[ChatMessage] = [
            *messages[:-1],
            {"role": "user", "content": prompt},
        ]
        last: Exception | None = None
        for attempt in range(self.max_retries):
            # complete 已带熔断 + 超时重试；这里只处理 JSON 解析失败的重试
            text = self.complete(new_messages, max_tokens)
            try:
                return _parse_json(text)
            except (json.JSONDecodeError, ValueError, KeyError) as exc:
                last = exc
                if attempt < self.max_retries - 1:
                    self._retry_sleep(attempt)
        raise LLMError(f"JSON 解析重试 {self.max_retries} 次后仍失败: {last}", retryable=True)


def from_settings(settings) -> "AnthropicClient":
    """从 Settings（config.py）创建客户端，接入 .env 里的端点与密钥。"""
    return AnthropicClient(
        api_key=settings.llm.api_key,
        model=settings.llm.model,
        base_url=settings.llm.base_url,
    )
