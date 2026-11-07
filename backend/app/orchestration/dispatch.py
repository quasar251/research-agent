"""调度模块：派发单元与聚合结果（纯逻辑，不调 LLM）。"""
from __future__ import annotations

from collections import defaultdict

from ..state.schema import AgentRole, CellStatus, MatrixCell, Subtask, TaskStatus


def group_by_role(subtasks: list[Subtask]) -> dict[AgentRole, list[Subtask]]:
    """把待派发子任务按指派角色分组。"""
    grouped: dict[AgentRole, list[Subtask]] = defaultdict(list)
    for t in subtasks:
        grouped[t.role].append(t)
    return dict(grouped)


def aggregate(matrix_cells: list[MatrixCell], subtasks: list[Subtask]) -> dict[str, list]:
    """聚合结果：对比预期产出 vs 实际落地。

    返回：
    - gaps: 仍为 gap 的矩阵格子（需重派）
    - unresolved: 已显式标记无法解决的子任务
    """
    gaps = [c for c in matrix_cells if c.status == CellStatus.GAP]
    unresolved = [t for t in subtasks if t.status == TaskStatus.UNRESOLVED]
    return {"gaps": gaps, "unresolved": unresolved}
