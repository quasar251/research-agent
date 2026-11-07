"""Collector 角色：搜集（collect 阶段）。

按 pending 子任务采集信息，抽取结构化结论（Claim）+ 登记证据（Evidence），
并把对应矩阵格子置为 covered。
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
from . import parse_json

_PROMPT = """你是行业调研的搜集者 Collector。请针对子任务采集信息，产出带证据的结论。

子任务：{question}

只输出 JSON，不要输出任何其他文字，格式如下：
{{
  "claims": [
    {{"text": "结论内容", "evidence_urls": ["https://example.com/source"]}}
  ]
}}
"""


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

        for t in pending:
            raw = llm.complete([{"role": "user", "content": _PROMPT.format(question=t.question)}])
            result = parse_json(raw)

            for c in result.get("claims", []):
                ev_ids: list[str] = []
                for url in c.get("evidence_urls", []):
                    ev = Evidence(id=f"ev-{uuid.uuid4().hex[:8]}", url=url, credibility=0.8)
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
                done.append(
                    t.model_copy(update={"status": TaskStatus.COMPLETED, "output_ref": claim.id})
                )

        # 把已搜集的格子置为 covered（简化：按完成的子任务数量覆盖前 N 个 gap 格子）
        cells = list(state.get("matrix", None).cells) if state.get("matrix") else []
        covered = 0
        updated_cells = []
        for cell in cells:
            if cell.status == CellStatus.GAP and covered < len(pending):
                updated_cells.append(
                    cell.model_copy(
                        update={"status": CellStatus.COVERED, "claim_refs": [c.id for c in new_claims[:1]]}
                    )
                )
                covered += 1
            else:
                updated_cells.append(cell)

        matrix = state["matrix"].model_copy(update={"cells": updated_cells})
        return {
            "claims": new_claims,
            "evidences": new_evidences,
            "subtasks": done,
            "matrix": matrix,
            "stage": StageName.VERIFY,
        }

    return node
