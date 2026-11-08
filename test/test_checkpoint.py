"""检查点持久化与断点续跑测试（state.md §三、reliability.md §5）。"""
from backend.app.orchestration.graph import build_graph
from backend.app.state.checkpoint import create_checkpointer
from backend.app.state.graph import initial_state


class MockLLM:
    model = "mock"

    def complete(self, messages, max_tokens: int = 1024) -> str:
        return "{}"

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=1024) -> dict:
        if tool_name == "submit_plan":
            return {
                "companies": ["公司A"],
                "dims": ["市场规模"],
                "subtasks": [
                    {"id": "t1", "question": "规模", "company": "公司A", "dim": "市场规模", "dependencies": []}
                ],
            }
        if tool_name == "submit_claims":
            return {"claims": [{"text": "规模 52 亿", "evidence_urls": ["https://x.com"]}]}
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_report":
            return {"summary": "最终报告摘要"}
        return {}


def test_checkpoint_persisted_to_file(tmp_path):
    db_path = tmp_path / "checkpoints.sqlite"
    checkpointer = create_checkpointer(db_path)
    graph = build_graph(MockLLM(), checkpointer=checkpointer)
    config = {"configurable": {"thread_id": "thread-1"}}

    graph.invoke(initial_state("r1", "u1", "调研 AI"), config=config)

    # 检查点文件已落盘
    assert db_path.exists()
    # 能从检查点读回最终状态
    state = graph.get_state(config)
    assert state.values["report"].summary == "最终报告摘要"


def test_rerun_same_thread_reuses_checkpoint(tmp_path):
    """同一 thread_id 重跑，从检查点恢复，不重复执行（幂等）。"""
    db_path = tmp_path / "checkpoints.sqlite"
    checkpointer = create_checkpointer(db_path)
    graph = build_graph(MockLLM(), checkpointer=checkpointer)
    config = {"configurable": {"thread_id": "thread-1"}}

    first = graph.invoke(initial_state("r1", "u1", "调研 AI"), config=config)
    # 同 thread 再次调用，返回已存在的结果
    state = graph.get_state(config)
    assert state.values["report"] == first["report"]
    assert state.values["matrix"].coverage == first["matrix"].coverage
