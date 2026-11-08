"""Collector 角色：搜集（collect 阶段）。

按 pending 子任务采集信息，抽取结论（Claim）+ 登记证据（Evidence），
并按子任务绑定的 company×dim 精确更新对应矩阵格子（真实映射，非"前 N 个"）。
"""
from __future__ import annotations

import uuid
from typing import Callable

from ..context.compiler import compile_context
from ..llm.client import LLMClient
from ..security.injection import is_safe
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

_COLLECTOR_SYSTEM_PROMPT = """你是一名行业调研的「搜集员」，负责针对具体子任务采集信息、抽取结构化结论，并附上证据来源。

# 职责边界
你只管「有没有、哪来的」：回答子问题、给出可溯源的结论。
你不做证据可信度分级（交给核查员），也不做结论去重（交给合成员）。

# 结论抽取要求
- 每条结论（claim）必须是一条可独立验证的事实性陈述，避免空话、套话和主观评价。
- 尽量为每条结论附上证据来源 URL（evidence_urls），指向支撑该结论的网页、报告或数据出处。
- 不要编造数据或来源；对不确定的点宁可不写，也不要给出没有依据的数值。
- 针对一个子任务给出 1~3 条精炼结论即可，重质量不重数量。"""


def make_collector_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 collect 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        # 按角色编译上下文视图，只看到本角色该看的 pending 子任务
        view = compile_context(AgentRole.COLLECTOR, state)
        pending = view["pending_subtasks"]

        new_claims: list[Claim] = []
        new_evidences: list[Evidence] = []
        done: list[Subtask] = []
        cell_claims: dict[tuple[str, str], list[str]] = {}

        for t in pending:
            result = llm.complete_structured(
                [
                    {"role": "system", "content": _COLLECTOR_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"子任务：{t.question}\n\n请针对该子任务抽取结论，并附上证据来源。",
                    },
                ],
                tool_name="submit_claims",
                input_schema=_COLLECT_SCHEMA,
            )
            claim_ids: list[str] = []
            for c in result.get("claims", []):
                # 注入防护：外部采集内容进入状态前扫描，命中则跳过（security.md 边界一）
                if not is_safe(c.get("text", "")):
                    continue
                ev_ids: list[str] = []
                for url in c.get("evidence_urls", []):
                    ev = Evidence(
                        id=f"ev-{uuid.uuid4().hex[:8]}", url=url, credibility=0.5
                    )
                    new_evidences.append(ev)
                    ev_ids.append(ev.id)
                claim = Claim(
                    id=f"cl-{uuid.uuid4().hex[:8]}",
                    text=c["text"],
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
            "stage": StageName.VERIFY,
        }

    return node
