"""HITL 审批测试：deep 模式在 align 处 interrupt，confirm 后继续完成。"""
from langgraph.types import Command

from backend.app.llm.client import ChatMessage
from backend.app.orchestration.graph import build_graph
from backend.app.state.checkpoint import create_checkpointer
from backend.app.state.graph import initial_state


class MockLLM:
    model = "mock"

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        return "{}"

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=1024) -> dict:
        if tool_name == "submit_plan":
            return {
                "companies": ["公司A"],
                "dims": ["规模"],
                "subtasks": [
                    {"id": "t1", "question": "规模", "company": "公司A", "dim": "规模"}
                ],
            }
        if tool_name == "submit_claims":
            return {"claims": [{"text": "规模 52 亿", "evidence_urls": []}]}
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_report":
            return {"summary": "最终摘要"}
        return {}


def test_deep_mode_interrupts_at_align_then_confirm():
    checkpointer = create_checkpointer(":memory:")
    graph = build_graph(MockLLM(), checkpointer=checkpointer)
    config = {"configurable": {"thread_id": "hitl-1"}}

    # 第一次 invoke：deep 模式跑到 align 审批点暂停
    result = graph.invoke(initial_state("r1", "u1", "调研", depth="deep"), config)
    assert "__interrupt__" in result

    # confirm 后继续完成
    result = graph.invoke(Command(resume="confirm"), config)
    assert result["report"].summary == "最终摘要"


def test_simple_mode_no_interrupt():
    checkpointer = create_checkpointer(":memory:")
    graph = build_graph(MockLLM(), checkpointer=checkpointer)
    config = {"configurable": {"thread_id": "simple-1"}}

    # simple 模式不触发 HITL，一次跑完
    result = graph.invoke(initial_state("r1", "u1", "调研", depth="simple"), config)
    assert "__interrupt__" not in result
    assert result["report"].summary == "最终摘要"
