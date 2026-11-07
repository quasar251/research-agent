"""调度模块：Supervisor 调度逻辑（纯逻辑，不调 LLM）。

职责（orchestration.md）：
- 阶段机：四阶段线性推进（align → collect → verify → synthesize）
- 依赖感知：依赖满足才派发
- 缺口识别：研究矩阵的 gap 格子、子任务重试超限
"""
from __future__ import annotations

from ..state.schema import CellStatus, MatrixCell, StageName, Subtask, TaskStatus

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
