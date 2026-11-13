"""Collector 角色：搜集（collect 阶段）。

按 pending 子任务检索真实来源，抽取结论（Claim）+ 登记证据（Evidence），
并按子任务绑定的 company×dim 精确更新对应矩阵格子（真实映射，非"前 N 个"）。
证据 URL 只接受检索工具返回的真实来源，杜绝 LLM 编造（根治合成幻觉，见 eval.md）。
"""
from __future__ import annotations

import uuid
from typing import Callable

from ..context.compiler import compile_context
from ..context.externalize import externalize
from ..llm.client import LLMClient, LLMError
from ..security.gate import PermissionGate
from ..security.injection import is_safe
from ..security.privacy import sanitize
from ..skill.loader import build_system_prompt
from ..skill.registry import SkillRegistry
from ..state.graph import AgentState
from ..state.schema import (
    AgentRole,
    CellStatus,
    Claim,
    Evidence,
    EvidenceStrength,
    StageName,
    Subtask,
    TaskStatus,
)
from ..tools.search import SEARCH_PERMISSION, SearchProvider, SearchResult

_COLLECT_SCHEMA = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "evidence_urls": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["text"],
            },
        },
    },
    "required": ["claims"],
}

_COLLECTOR_BASE = """你是一名行业调研的「搜集员」，负责针对具体子任务，基于检索到的来源抽取结构化结论。

# 职责边界
你只管「有没有、哪来的」：回答子问题、给出可溯源的结论。
你不做证据可信度分级（交给核查员），也不做结论去重（交给合成员）。"""


def _format_results(results: list[SearchResult]) -> str:
    """把检索结果拼成可供 LLM 阅读的来源文本。"""
    if not results:
        return "（无检索结果）"
    lines = []
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r.title}\n   URL: {r.url}\n   摘要: {r.snippet}")
    return "\n".join(lines)


def make_collector_node(
    llm: LLMClient,
    search: SearchProvider | None = None,
    skill_registry: SkillRegistry | None = None,
    gate: PermissionGate | None = None,
    core_memory: str = "",
) -> Callable[[AgentState], dict]:
    """返回 collect 阶段的节点函数。search 为 None 时跳过真实检索（测试可注入 mock）。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，只看到本角色该看的 pending 子任务
        view, snapshot = compile_context(AgentRole.COLLECTOR, state)
        pending = view["pending_subtasks"]

        new_claims: list[Claim] = []
        new_evidences: list[Evidence] = []
        done: list[Subtask] = []
        errors: list[str] = []
        cell_claims: dict[tuple[str, str], list[str]] = {}
        system_prompt = build_system_prompt(
            _COLLECTOR_BASE, skill_registry, StageName.COLLECT, core_memory=core_memory
        )

        for t in pending:
            # 1. 用检索工具拿真实来源（search 为 None 时跳过，便于测试注入）
            #    s04 权限判定：gate 拒绝 search 权限时跳过检索
            if search is not None and gate is not None and not gate.can(SEARCH_PERMISSION):
                results = []
            else:
                results = search.search(t.question) if search else []
            valid_urls = {r.url for r in results}
            sources_text = _format_results(results)
            # 输出外化：检索结果过大时写磁盘，只给 LLM 摘要 + head/tail + 路径（s13）
            sources_text = externalize(sources_text)

            try:
                result = llm.complete_structured(
                    [
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": (
                                f"子任务：{t.question}\n\n"
                                f"检索到的来源：\n{sources_text}\n\n"
                                "请基于以上来源抽取结论，每条结论标注 evidence_urls"
                                "（只能引用上述来源的 URL）。"
                            ),
                        },
                    ],
                    tool_name="submit_claims",
                    input_schema=_COLLECT_SCHEMA,
                )
            except LLMError as exc:
                # 失败兜底：单个子任务失败标 unresolved，不中断整个搜集循环
                done.append(t.model_copy(update={"status": TaskStatus.UNRESOLVED}))
                errors.append(f"搜集失败[{t.question}]：{exc}")
                continue
            claim_ids: list[str] = []
            for c in result.get("claims", []):
                # 隐私脱敏：结论文本里的 PII 进入状态前脱敏（security.md 边界二）
                text = sanitize(c.get("text", ""))
                # 注入防护：外部采集内容进入状态前扫描，命中则跳过（security.md 边界一）
                if not is_safe(text):
                    continue
                ev_ids: list[str] = []
                for url in c.get("evidence_urls", []):
                    # 生产环境（search 非 None）：只接受检索返回的真实 URL，过滤 LLM 编造的
                    if search is not None and url not in valid_urls:
                        continue
                    ev = Evidence(
                        id=f"ev-{uuid.uuid4().hex[:8]}", url=url, credibility=0.5
                    )
                    new_evidences.append(ev)
                    ev_ids.append(ev.id)
                claim = Claim(
                    id=f"cl-{uuid.uuid4().hex[:8]}",
                    text=text,
                    strength=EvidenceStrength.INFERRED,
                    evidence_refs=ev_ids,
                    role=AgentRole.COLLECTOR,
                )
                new_claims.append(claim)
                claim_ids.append(claim.id)
            done.append(
                t.model_copy(
                    update={
                        "status": TaskStatus.COMPLETED,
                        "output_ref": claim_ids[0] if claim_ids else None,
                    }
                )
            )
            # 只在产出结论时才标 covered；空结果保持 gap，交给 verify 重派
            if claim_ids:
                cell_claims[(t.company, t.dim)] = claim_ids

        # 精确更新：子任务绑定的格子置 covered，关联该格子产出的结论
        matrix = state["matrix"]
        updated_cells = [
            cell.model_copy(
                update={
                    "status": CellStatus.COVERED,
                    "claim_refs": cell_claims.get((cell.company, cell.dim), []),
                }
            )
            if (cell.company, cell.dim) in cell_claims
            else cell
            for cell in matrix.cells
        ]

        return {
            "claims": new_claims,
            "evidences": new_evidences,
            "subtasks": done,
            "matrix": matrix.model_copy(update={"cells": updated_cells}),
            "snapshots": [snapshot],
            "errors": errors,
            "stage": StageName.VERIFY,
        }

    return node
