"""LLM 层测试：接口契约 + 客户端构造（不调真实 API）。"""
from backend.app.llm.client import AnthropicClient, ChatMessage, LLMClient


class MockLLM:
    """满足 LLMClient 接口的 mock，用于验证接口契约。"""

    model = "mock"

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        return f"mock reply to {len(messages)} messages"


def test_mock_satisfies_interface():
    client: LLMClient = MockLLM()
    assert client.model == "mock"
    assert client.complete([{"role": "user", "content": "hi"}]) == "mock reply to 1 messages"


def test_anthropic_client_constructs_without_calling_api():
    # 构造不触发网络；仅在 complete 时才校验 key
    client = AnthropicClient(api_key="test-key", model="claude-sonnet-4-5")
    assert client.model == "claude-sonnet-4-5"
