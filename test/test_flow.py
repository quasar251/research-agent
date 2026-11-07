"""核心流程端到端测试：用 mock LLM 跑完整四阶段图。"""
from backend.app.llm.client import ChatMessage
from backend.app.orchestration.graph import build_graph
from backend.app.state.graph import initial_state
from backend.app.state.schema import ClaimStatus, StageName


class MockLLM:
    """按 prompt 关键词返回对应 JSON 的 mock。"""

    model = "mock"

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        content = messages[-1]["content"]
        if "规划者 Lead" in content:
            return (
                '{"companies": ["公司A"], "dims": ["市场规模"], '
                '"subtasks": [{"id": "t1", "question": "市场规模是多少", "dependencies": []}]}'
            )
        if "搜集者 Collector" in content:
            return (
                '{"claims": [{"text": "市场规模约 52 亿美元", '
                '"evidence_urls": ["https://example.com/source"]}]}'
            )
        if "核查者 Verifier" in content:
            return '{"strength": "solid"}'
        if "合成者 Synthesizer" in content:
            return '{"report": "最终报告正文"}'
        return "{}"


def test_full_flow_end_to_end():
    graph = build_graph(MockLLM())
    state = initial_state("r1", "u1", "调研 AI 智能体")
    result = graph.invoke(state)

    assert result["stage"] == StageName.SYNTHESIZE
    assert result["report"] == "最终报告正文"
    assert len(result["claims"]) == 1
    assert result["claims"][0].status == ClaimStatus.VERIFIED
    assert result["matrix"].coverage == 1.0
    # 子任务已完成
    assert result["subtasks"][0].status.value == "completed"


def test_full_flow_with_checkpointer():
    from backend.app.state.checkpoint import create_checkpointer

    checkpointer = create_checkpointer(":memory:")
    graph = build_graph(MockLLM(), checkpointer=checkpointer)
    state = initial_state("r1", "u1", "调研 AI 智能体")
    result = graph.invoke(state, config={"configurable": {"thread_id": "thread-1"}})
    assert result["report"] == "最终报告正文"
