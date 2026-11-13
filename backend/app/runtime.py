"""统一运行时：串起七模块，执行时埋点审计 + 收尾蒸馏记忆（observability.md / memory.md）。"""
from __future__ import annotations

import time

from langgraph.types import Command

from .llm.client import LLMClient, LLMError
from .llm.router import ModelRouter
from .memory.distill import distill
from .memory.longterm_store import LongTermMemoryStore
from .memory.retrieval import MemoryIndex
from .memory.store import LongTermMemory, upsert_longterm
from .observability.audit import AuditLog
from .observability.logging import struct_log
from .observability.metrics import collect_llm_stats, compute_metrics, ops_metrics
from .observability.trace import trace_claim
from .orchestration.graph import build_graph
from .security.gate import PermissionGate
from .skill.catalog import build_default_registry
from .state.checkpoint import create_checkpointer
from .state.graph import initial_state
from .state.store import LedgerStore
from .tools.search import SEARCH_PERMISSION, SearchProvider

# 任务级硬超时默认值（reliability.md §5 / operations.md §2 TASK_TIMEOUT_S）
_DEFAULT_TASK_TIMEOUT_S = 1800.0

_FOLLOW_BASE = """你是行业调研助手，基于已有调研结论回答用户的追问。

# 职责边界
你只基于给定的调研结论回答，不引入任何结论之外的新事实或数据。
若结论不足以回答，如实说明「现有结论不足以回答」，绝不编造。"""

_FOLLOW_SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}},
    "required": ["answer"],
}


class ResearchRuntime:
    """研衡统一运行时。"""

    def __init__(
        self,
        llm: LLMClient,
        checkpointer=None,
        embedding=None,
        search: SearchProvider | None = None,
        db_path: str | None = None,
        task_timeout_s: float = _DEFAULT_TASK_TIMEOUT_S,
        core_memory: str = "",
    ) -> None:
        # 未显式传 checkpointer 且给了 db_path 时，接 SQLite 检查点（断点续跑）
        if checkpointer is None and db_path:
            checkpointer = create_checkpointer(db_path)
        # 真实搜索由调用方显式注入；None 时 collector 跳过检索（测试/离线场景不触发网络）
        self.llm = llm
        self.search = search
        self.skill_registry = build_default_registry()
        self.router = ModelRouter(llm)
        # 缓存最终状态，供追问（follow_up）复用
        self._results: dict[str, dict] = {}
        # 权限门：默认授权网页搜索，横切所有工具调用（s04）
        self.gate = PermissionGate(granted_permissions={SEARCH_PERMISSION})
        # 长期记忆持久化（memory.md §6）：db_path 提供时落 SQLite，并跨会话加载
        self.longterm_store = LongTermMemoryStore(f"{db_path}.ltm.sqlite" if db_path else ":memory:")
        self.longterm_memories: list[LongTermMemory] = self.longterm_store.load()
        self.embedding = embedding
        self.memory_index = MemoryIndex()
        self.core_memory = core_memory
        self.task_timeout_s = task_timeout_s

        self.graph = build_graph(
            llm, checkpointer, self.search, self.skill_registry, self.router, self.gate,
            core_memory=core_memory,
            retriever=self._brief,
        )
        # 持久化场景（db_path 提供）时，审计升级为 append-only JSONL（s09）
        self.audit_log = AuditLog(f"{db_path}.audit.jsonl" if db_path else None)
        # 台账持久化（state.md §三）：db_path 提供时落 SQLite，否则 :memory:
        self.ledger = LedgerStore(f"{db_path}.ledger.sqlite" if db_path else ":memory:")

    def run(
        self,
        run_id: str,
        user_id: str,
        intent: str,
        depth: str = "simple",
        thread_id: str | None = None,
        on_node: "callable | None" = None,
    ) -> dict:
        """执行一次调研，返回最终状态；全程埋点审计 + 收尾蒸馏长期记忆。

        deep 模式在 HITL 审批点暂停时返回含 `__interrupt__` 的状态（不收尾）。
        on_node 在阶段推进时回调（SSE 流式推送用）。
        """
        thread = thread_id or run_id
        config = {"configurable": {"thread_id": thread}}

        # 断点续跑：thread_id 已有未完成检查点时，从检查点续跑，不重放已完成阶段
        if self._has_unfinished_checkpoint(config):
            self.audit_log.record("断点续跑", run_id, {"thread_id": thread})
            final = self._stream(None, config, run_id, on_node)
        else:
            state = initial_state(run_id, user_id, intent, depth)
            self.audit_log.record(
                "任务开始", run_id, {"intent": intent, "depth": depth, "thread_id": thread}
            )
            final = self._stream(state, config, run_id, on_node)

        if final.get("__interrupt__"):
            self.audit_log.record("等待审批", run_id, {"checkpoint": "align", "thread_id": thread})
            return final
        final = self._finish(final, run_id, thread)
        self._results[run_id] = final
        return final

    def _has_unfinished_checkpoint(self, config: dict) -> bool:
        """thread_id 是否已有未完成检查点（用于断点续跑判定，reliability.md §5）。"""
        try:
            snapshot = self.graph.get_state(config)
        except Exception:  # noqa: BLE001 - 无 checkpointer / 空状态均视为无检查点
            return False
        return bool(snapshot.next)

    def resume(
        self,
        run_id: str,
        decision: str,
        thread_id: str | None = None,
        on_node: "callable | None" = None,
        feedback: str = "",
    ) -> dict:
        """HITL 恢复：confirm 继续执行，retry 打回重新规划（api.md §3.4）。

        feedback 随 resume 值一起交给 align 节点，作为打回后的重规划依据。
        """
        thread = thread_id or run_id
        config = {"configurable": {"thread_id": thread}}
        resume_value: dict | str = (
            {"action": decision, "feedback": feedback} if feedback else decision
        )
        final = self._stream(Command(resume=resume_value), config, run_id, on_node)
        if final.get("__interrupt__"):
            self.audit_log.record("等待审批", run_id, {"checkpoint": "align", "thread_id": thread})
            return final
        final = self._finish(final, run_id, thread)
        self._results[run_id] = final
        return final

    def follow_up(self, run_id: str, question: str) -> dict:
        """基于已有调研结论回答追问（api.md 追问场景）。

        无该 run_id 的结果时抛 LLMError（调用方转 404）。
        """
        final = self._results.get(run_id)
        if final is None:
            raise LLMError(f"任务 {run_id} 无结果可追问", retryable=False)
        claims = final.get("claims", [])
        claims_text = "\n".join(f"- {c.text}" for c in claims) or "（无结论）"
        try:
            result = self.llm.complete_structured(
                [
                    {"role": "system", "content": _FOLLOW_BASE},
                    {
                        "role": "user",
                        "content": (
                            f"调研结论：\n{claims_text}\n\n"
                            f"用户追问：{question}\n\n"
                            "请基于以上结论回答。"
                        ),
                    },
                ],
                tool_name="submit_answer",
                input_schema=_FOLLOW_SCHEMA,
            )
            return {"answer": result.get("answer", "")}
        except LLMError as exc:
            # 失败兜底：追问失败也返回可读文本，不崩溃
            return {"answer": f"追问回答生成失败：{exc}"}

    # ------------------------------------------------------------------
    # 内部：跑图 + 收尾
    # ------------------------------------------------------------------

    def _stream(self, input_, config: dict, run_id: str, on_node=None) -> dict:
        """跑图并埋点阶段推进，返回最终状态（可能含 __interrupt__ / _timed_out）。"""
        final: dict = input_ if isinstance(input_, dict) else {}
        prev_stage = None
        deadline = time.monotonic() + self.task_timeout_s
        timed_out = False
        for snapshot in self.graph.stream(input_, config, stream_mode="values"):
            final = snapshot
            stage = snapshot.get("stage")
            if stage is not None and stage != prev_stage:
                self.audit_log.record("阶段推进", stage.value, {"run_id": run_id})
                prev_stage = stage
                if on_node is not None:
                    on_node(stage.value)
            if time.monotonic() > deadline:
                timed_out = True
                break
        if timed_out:
            # 任务级硬超时：当前状态已由 LangGraph 落检查点，标 unresolved 不悬挂
            final = dict(final)
            final["_timed_out"] = True
            final["errors"] = list(final.get("errors", [])) + ["任务硬超时，已落检查点"]
        return final

    def _finish(self, final: dict, run_id: str, thread_id: str | None = None) -> dict:
        """任务收尾：台账落库 + 蒸馏记忆 + 溯源 + 指标。"""
        # 台账持久化（state.md §三）：先落库，再做跨会话蒸馏
        self.ledger.save(final)

        distilled = distill(final.get("claims", []))
        self.longterm_memories = upsert_longterm(self.longterm_memories, distilled)
        self.longterm_store.upsert_all(distilled)
        if self.embedding and distilled:
            vectors = self.embedding.embed([m.content for m in distilled])
            for mem, vec in zip(distilled, vectors):
                self.memory_index.add(mem, vec)

        evidences = final.get("evidences", [])
        for c in final.get("claims", []):
            self.audit_log.record("溯源", c.id, trace_claim(c, evidences))

        metrics = compute_metrics(final)
        if final.get("_timed_out"):
            self.audit_log.record("任务超时", run_id, {"thread_id": thread_id})
        self.audit_log.record(
            "任务完成", run_id, {**metrics, "thread_id": thread_id or run_id}
        )
        # 规范指标 + 结构化日志（observability.md §7）
        llm_stats = collect_llm_stats(list(self.router._clients.values()))
        ops = ops_metrics(final, llm_stats)
        struct_log(
            "INFO", "任务完成", run_id=run_id,
            thread_id=thread_id or run_id, payload=ops,
        )
        return final

    def get_audit(self, type_: str | None = None) -> list:
        return self.audit_log.query(type_)

    def get_memories(self) -> list[LongTermMemory]:
        return list(self.longterm_memories)

    def retrieve(self, query: str, top_k: int = 5) -> list[LongTermMemory]:
        """检索长期记忆：有 embedding 走向量相似度，否则回退结构化 LIKE（memory.md §6.1）。"""
        if self.embedding and len(self.memory_index) > 0:
            query_vec = self.embedding.embed([query])[0]
            hits = self.memory_index.search(query_vec, top_k)
            if hits:
                return hits
        return self.longterm_store.search(query, limit=top_k)

    def _brief(self, intent: str) -> str:
        """跨会话简报：检索已沉淀长期记忆，生成新任务上下文注入（orchestration.md §6）。"""
        hits = self.retrieve(intent, top_k=3)
        if not hits:
            return ""
        lines = [f"- {m.content}" for m in hits]
        return "\n".join(lines)
