"""统一运行时：串起七模块，执行时埋点审计 + 收尾蒸馏记忆（observability.md / memory.md）。"""
from __future__ import annotations

from .llm.client import LLMClient
from .memory.distill import distill
from .memory.retrieval import MemoryIndex
from .memory.store import LongTermMemory, upsert_longterm
from .observability.audit import AuditLog
from .observability.metrics import compute_metrics
from .orchestration.graph import build_graph
from .state.graph import initial_state


class ResearchRuntime:
    """研衡统一运行时。"""

    def __init__(self, llm: LLMClient, checkpointer=None, embedding=None) -> None:
        self.graph = build_graph(llm, checkpointer)
        self.audit_log = AuditLog()
        self.longterm_memories: list[LongTermMemory] = []
        self.embedding = embedding
        self.memory_index = MemoryIndex()

    def run(
        self,
        run_id: str,
        user_id: str,
        intent: str,
        thread_id: str | None = None,
    ) -> dict:
        """执行一次调研，返回最终状态；全程埋点审计 + 收尾蒸馏长期记忆。"""
        state = initial_state(run_id, user_id, intent)
        config = {"configurable": {"thread_id": thread_id or run_id}}

        self.audit_log.record("任务开始", run_id, {"intent": intent})
        final: dict = state
        prev_stage = None
        for snapshot in self.graph.stream(state, config, stream_mode="values"):
            final = snapshot
            stage = snapshot.get("stage")
            if stage is not None and stage != prev_stage:
                self.audit_log.record("阶段推进", stage.value, {"run_id": run_id})
                prev_stage = stage

        # 任务收尾：把验证有效的结论蒸馏为长期记忆（memory.md §3）
        distilled = distill(final.get("claims", []))
        self.longterm_memories = upsert_longterm(self.longterm_memories, distilled)
        # 生成向量并存入索引，供跨会话检索（memory.md §6）
        if self.embedding and distilled:
            vectors = self.embedding.embed([m.content for m in distilled])
            for mem, vec in zip(distilled, vectors):
                self.memory_index.add(mem, vec)

        self.audit_log.record("任务完成", run_id, compute_metrics(final))
        return final

    def get_audit(self, type_: str | None = None) -> list:
        return self.audit_log.query(type_)

    def get_memories(self) -> list[LongTermMemory]:
        return list(self.longterm_memories)

    def retrieve(self, query: str, top_k: int = 5) -> list[LongTermMemory]:
        """按语义相似度检索长期记忆（无 embedding 则返回空）。"""
        if not self.embedding:
            return []
        query_vec = self.embedding.embed([query])[0]
        return self.memory_index.search(query_vec, top_k)
