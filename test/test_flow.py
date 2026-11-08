"""核心流程端到端测试：用 mock LLM 跑完整四阶段图。"""
from backend.app.llm.client import ChatMessage
from backend.app.orchestration.graph import build_graph
from backend.app.state.graph import initial_state
from backend.app.state.schema import ClaimStatus, StageName


class MockLLM:
    """按 tool_name 返回对应结构化结果的 mock。"""

    model = "mock"

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        return "{}"

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=1024) -> dict:
        if tool_name == "submit_plan":
            return {
                "companies": ["公司A"],
                "dims": ["市场规模"],
                "subtasks": [
                    {
                        "id": "t1",
                        "question": "市场规模是多少",
                        "company": "公司A",
                        "dim": "市场规模",
                        "dependencies": [],
                    }
                ],
            }
        if tool_name == "submit_claims":
            return {
                "claims": [
                    {"text": "市场规模约 52 亿美元", "evidence_urls": ["https://example.com/source"]}
                ]
            }
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_report":
            return {"report": "最终报告正文"}
        return {}


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


class RetryMockLLM:
    """第一次 collect 返回空（留缺口），第二次补齐，用于验证缺口重派循环。"""

    model = "mock"

    def __init__(self) -> None:
        self.collect_calls = 0

    def complete(self, messages, max_tokens: int = 1024) -> str:
        return "{}"

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=1024) -> dict:
        if tool_name == "submit_plan":
            return {
                "companies": ["公司A"],
                "dims": ["市场规模"],
                "subtasks": [
                    {
                        "id": "t1",
                        "question": "市场规模是多少",
                        "company": "公司A",
                        "dim": "市场规模",
                        "dependencies": [],
                    }
                ],
            }
        if tool_name == "submit_claims":
            self.collect_calls += 1
            if self.collect_calls == 1:
                return {"claims": []}  # 第一次留缺口
            return {"claims": [{"text": "规模约 52 亿美元", "evidence_urls": ["https://x.com"]}]}
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_report":
            return {"report": "重派后的报告"}
        return {}


def test_gap_retry_loop():
    llm = RetryMockLLM()
    graph = build_graph(llm)
    result = graph.invoke(initial_state("r1", "u1", "调研"))
    # 缺口重派后覆盖度达标，且至少重派了一次
    assert result["matrix"].coverage == 1.0
    assert llm.collect_calls >= 2
    assert result["report"] == "重派后的报告"
