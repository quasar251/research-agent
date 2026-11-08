"""调度模块：Supervisor 调度逻辑（纯逻辑，不调 LLM）。

职责（orchestration.md）：
- 阶段机：四阶段线性推进（align → collect → verify → synthesize）
- 依赖感知：依赖满足才派发
- 缺口识别：研究矩阵的 gap 格子、子任务重试超限
"""
from __future__ import annotations

from ..state.schema import (
    CellStatus,
    MatrixCell,
    ResearchMatrix,
    StageName,
    Subtask,
    TaskStatus,
)

_STAGE_ORDER = (
    StageName.ALIGN,
    StageName.COLLECT,
    StageName.VERIFY,
    StageName.SYNTHESIZE,
)


def next_stage(current: StageName) -> StageName:
    """四阶段线性推进；synthesize 之后返回自身（已是末阶段）。"""
    idx = _STAGE_ORDER.index(current)
    return _STAGE_ORDER[min(idx + 1, len(_STAGE_ORDER) - 1)]


def ready_subtasks(subtasks: list[Subtask], completed_ids: set[str]) -> list[Subtask]:
    """依赖已满足且仍 pending 的子任务，可被派发（依赖感知）。"""
    return [
        t
        for t in subtasks
        if t.status == TaskStatus.PENDING and set(t.dependencies) <= completed_ids
    ]


def find_gaps(cells: list[MatrixCell]) -> list[MatrixCell]:
    """研究矩阵中 status=gap 的格子（待补缺口）。"""
    return [c for c in cells if c.status == CellStatus.GAP]


def exhausted(subtask: Subtask) -> bool:
    """子任务是否重试已达上限（应显式标 unresolved，不静默跳过）。"""
    return subtask.retry_count >= subtask.retry_limit


def reopen_gaps(
    subtasks: list[Subtask], matrix: ResearchMatrix
) -> tuple[list[Subtask], ResearchMatrix]:
    """缺口重派：把 gap 格子对应的已完成子任务重新打开（retry+1），超限标 unresolved。

    返回更新后的子任务列表与矩阵。静默缺口禁止：gap 要么重派、要么显式 unresolved。
    """
    gap_keys = {(c.company, c.dim) for c in matrix.cells if c.status == CellStatus.GAP}

    updated_subtasks: list[Subtask] = []
    for t in subtasks:
        if (t.company, t.dim) in gap_keys and t.status == TaskStatus.COMPLETED:
            next_count = t.retry_count + 1
            if next_count >= t.retry_limit:
                updated_subtasks.append(
                    t.model_copy(
                        update={"status": TaskStatus.UNRESOLVED, "retry_count": next_count}
                    )
                )
            else:
                updated_subtasks.append(
                    t.model_copy(
                        update={"status": TaskStatus.PENDING, "retry_count": next_count}
                    )
                )
        else:
            updated_subtasks.append(t)

    unresolved_keys = {
        (t.company, t.dim) for t in updated_subtasks if t.status == TaskStatus.UNRESOLVED
    }
    updated_cells = [
        c.model_copy(update={"status": CellStatus.UNRESOLVED})
        if (c.company, c.dim) in unresolved_keys and c.status == CellStatus.GAP
        else c
        for c in matrix.cells
    ]
    return updated_subtasks, matrix.model_copy(update={"cells": updated_cells})


def has_pending_collect(subtasks: list[Subtask]) -> bool:
    """是否还有待搜集的 pending 子任务（用于 verify 后路由）。"""
    return any(
        t.status == TaskStatus.PENDING and t.stage == StageName.COLLECT for t in subtasks
    )
