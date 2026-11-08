"""统一运行时：串起七模块，执行时埋点审计与指标（observability.md）。"""
from __future__ import annotations

from .llm.client import LLMClient
from .observability.audit import AuditLog
from .observability.metrics import compute_metrics
from .orchestration.graph import build_graph
from .state.graph import initial_state


class ResearchRuntime:
    """研衡统一运行时。"""

    def __init__(self, llm: LLMClient, checkpointer=None) -> None:
        self.graph = build_graph(llm, checkpointer)
        self.audit_log = AuditLog()

    def run(
        self,
        run_id: str,
        user_id: str,
        intent: str,
        thread_id: str | None = None,
    ) -> dict:
        """执行一次调研，返回最终状态；全程埋点审计事件。"""
        state = initial_state(run_id, user_id, intent)
        config = {"configurable": {"thread_id": thread_id or run_id}}

        self.audit_log.record("任务开始", run_id, {"intent": intent})
        final: dict = state
        for chunk in self.graph.stream(state, config):
            node = next(iter(chunk))
            final = chunk[node]
            self.audit_log.record("节点执行", node, {"run_id": run_id})
        self.audit_log.record("任务完成", run_id, compute_metrics(final))
        return final

    def get_audit(self, type_: str | None = None) -> list:
        return self.audit_log.query(type_)
