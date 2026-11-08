"""统一运行时：串起七模块，执行时埋点审计 + 收尾蒸馏记忆（observability.md / memory.md）。"""
from __future__ import annotations

from langgraph.types import Command

from .llm.client import LLMClient
from .llm.router import ModelRouter
from .memory.distill import distill
from .memory.retrieval import MemoryIndex
from .memory.store import LongTermMemory, upsert_longterm
from .observability.audit import AuditLog
from .observability.metrics import compute_metrics
from .observability.trace import trace_claim
from .orchestration.graph import build_graph
from .security.gate import PermissionGate
from .skill.catalog import build_default_registry
from .state.checkpoint import create_checkpointer
from .state.graph import initial_state
from .tools.search import SEARCH_PERMISSION, SearchProvider


class ResearchRuntime:
    """研衡统一运行时。"""

    def __init__(
        self,
        llm: LLMClient,
        checkpointer=None,
        embedding=None,
        search: SearchProvider | None = None,
        db_path: str | None = None,
    ) -> None:
        # 未显式传 checkpointer 且给了 db_path 时，接 SQLite 检查点（断点续跑）
        if checkpointer is None and db_path:
            checkpointer = create_checkpointer(db_path)
        # 真实搜索由调用方显式注入；None 时 collector 跳过检索（测试/离线场景不触发网络）
        self.search = search
        self.skill_registry = build_default_registry()
        self.router = ModelRouter(llm)
        # 权限门：默认授权网页搜索，横切所有工具调用（s04）
        self.gate = PermissionGate(granted_permissions={SEARCH_PERMISSION})
        self.graph = build_graph(
            llm, checkpointer, self.search, self.skill_registry, self.router, self.gate
        )
        # 持久化场景（db_path 提供）时，审计升级为 append-only JSONL（s09）
        self.audit_log = AuditLog(f"{db_path}.audit.jsonl" if db_path else None)
        self.longterm_memories: list[LongTermMemory] = []
        self.embedding = embedding
        self.memory_index = MemoryIndex()

    def run(
        self,
        run_id: str,
        user_id: str,
        intent: str,
        depth: str = "simple",
        thread_id: str | None = None,
    ) -> dict:
        """执行一次调研，返回最终状态；全程埋点审计 + 收尾蒸馏长期记忆。

        deep 模式在 HITL 审批点暂停时返回含 `__interrupt__` 的状态（不收尾）。
        """
        state = initial_state(run_id, user_id, intent, depth)
        config = {"configurable": {"thread_id": thread_id or run_id}}

        self.audit_log.record("任务开始", run_id, {"intent": intent, "depth": depth})
        final = self._stream(state, config, run_id)
        if final.get("__interrupt__"):
            self.audit_log.record("等待审批", run_id, {"checkpoint": "align"})
            return final
        return self._finish(final, run_id)

    def resume(
        self,
        run_id: str,
        decision: str,
        thread_id: str | None = None,
    ) -> dict:
        """HITL 恢复：confirm 继续执行，retry 打回重新规划（api.md §3.4）。"""
        config = {"configurable": {"thread_id": thread_id or run_id}}
        final = self._stream(Command(resume=decision), config, run_id)
        if final.get("__interrupt__"):
            self.audit_log.record("等待审批", run_id, {"checkpoint": "align"})
            return final
        return self._finish(final, run_id)

    # ------------------------------------------------------------------
    # 内部：跑图 + 收尾
    # ------------------------------------------------------------------

    def _stream(self, input_, config: dict, run_id: str) -> dict:
        """跑图并埋点阶段推进，返回最终状态（可能含 __interrupt__）。"""
        final: dict = input_ if isinstance(input_, dict) else {}
        prev_stage = None
        for snapshot in self.graph.stream(input_, config, stream_mode="values"):
            final = snapshot
            stage = snapshot.get("stage")
            if stage is not None and stage != prev_stage:
                self.audit_log.record("阶段推进", stage.value, {"run_id": run_id})
                prev_stage = stage
        return final

    def _finish(self, final: dict, run_id: str) -> dict:
        """任务收尾：蒸馏记忆 + 溯源 + 指标。"""
        distilled = distill(final.get("claims", []))
        self.longterm_memories = upsert_longterm(self.longterm_memories, distilled)
        if self.embedding and distilled:
            vectors = self.embedding.embed([m.content for m in distilled])
            for mem, vec in zip(distilled, vectors):
                self.memory_index.add(mem, vec)

        evidences = final.get("evidences", [])
        for c in final.get("claims", []):
            self.audit_log.record("溯源", c.id, trace_claim(c, evidences))

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
