"""接口层测试：FastAPI 端点（用 mock LLM）。"""
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.llm.client import ChatMessage


class MockLLM:
    model = "mock"

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        content = messages[-1]["content"]
        if "规划者 Lead" in content:
            return (
                '{"companies": ["公司A"], "dims": ["市场规模"], '
                '"subtasks": [{"id": "t1", "question": "市场规模是多少", "dependencies": []}]}'
            )
        if "搜集者 Collector" in content:
            return '{"claims": [{"text": "规模约 52 亿美元", "evidence_urls": ["https://x.com"]}]}'
        if "核查者 Verifier" in content:
            return '{"strength": "solid"}'
        if "合成者 Synthesizer" in content:
            return '{"report": "最终报告"}'
        return "{}"


def _client():
    return TestClient(create_app(MockLLM()))


def test_create_research():
    resp = _client().post("/research", json={"intent": "调研 AI 智能体"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["report"] == "最终报告"
    assert data["metrics"]["coverage"] == 1.0


def test_stream_research():
    resp = _client().get("/research/stream", params={"intent": "调研 AI 智能体"})
    assert resp.status_code == 200
    assert "data:" in resp.text
    assert "[DONE]" in resp.text
