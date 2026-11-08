"""Collector 角色：搜集（collect 阶段）。

按 pending 子任务采集信息，抽取结论（Claim）+ 登记证据（Evidence），
并按子任务绑定的 company×dim 精确更新对应矩阵格子（真实映射，非"前 N 个"）。
"""
from __future__ import annotations

import uuid
from typing import Callable

from ..llm.client import LLMClient
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


def make_collector_node(llm: LLMClient) -> Callable[[AgentState], dict]:
    """返回 collect 阶段的节点函数。"""

    def node(state: AgentState) -> dict:
        pending = [
            t
            for t in state.get("subtasks", [])
            if t.status == TaskStatus.PENDING and t.stage == StageName.COLLECT
        ]

        new_claims: list[Claim] = []
        new_evidences: list[Evidence] = []
        done: list[Subtask] = []
        cell_claims: dict[tuple[str, str], list[str]] = {}

        for t in pending:
            result = llm.complete_structured(
                [{"role": "user", "content": f"子任务：{t.question}"}],
                tool_name="submit_claims",
                input_schema=_COLLECT_SCHEMA,
            )
            claim_ids: list[str] = []
            for c in result.get("claims", []):
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
