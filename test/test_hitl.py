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


def test_retry_feedback_reaches_lead_prompt():
    """打回意见必须进入下一轮规划 prompt，否则「打回重写」只是空转。"""
    class RecordingLLM(MockLLM):
        def __init__(self) -> None:
            self.plan_prompts: list[str] = []

        def complete_structured(self, messages, tool_name, input_schema, max_tokens=1024) -> dict:
            if tool_name == "submit_plan":
                self.plan_prompts.append(messages[-1]["content"])
            return super().complete_structured(messages, tool_name, input_schema, max_tokens)

    llm = RecordingLLM()
    graph = build_graph(llm, checkpointer=create_checkpointer(":memory:"))
    config = {"configurable": {"thread_id": "hitl-feedback"}}

    result = graph.invoke(initial_state("r1", "u1", "调研", depth="deep"), config)
    assert "__interrupt__" in result
    assert len(llm.plan_prompts) == 1

    # retry 带人工意见：Lead 应据此重新规划，并再次停在审批点
    result = graph.invoke(
        Command(resume={"action": "retry", "feedback": "增加海外市场分析"}), config
    )
    assert "__interrupt__" in result
    assert "增加海外市场分析" in llm.plan_prompts[-1]

    # 再次确认后跑完
    result = graph.invoke(Command(resume="confirm"), config)
    assert result["report"].summary == "最终摘要"
