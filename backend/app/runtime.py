"""统一运行时：串起七模块，提供一次调研的入口。"""
from __future__ import annotations

from .llm.client import LLMClient
from .orchestration.graph import build_graph
from .state.graph import initial_state


class ResearchRuntime:
    """研衡统一运行时。"""

    def __init__(self, llm: LLMClient, checkpointer=None) -> None:
        self.graph = build_graph(llm, checkpointer)

    def run(
        self,
        run_id: str,
        user_id: str,
        intent: str,
        thread_id: str | None = None,
    ) -> dict:
        """执行一次调研，返回最终状态。"""
        state = initial_state(run_id, user_id, intent)
        config = {"configurable": {"thread_id": thread_id or run_id}}
        return self.graph.invoke(state, config)
