"""调度模块测试：阶段机、依赖感知、缺口识别、派发分组、聚合。"""
from backend.app.state.schema import (
    AgentRole,
    CellStatus,
    MatrixCell,
    ResearchMatrix,
    StageName,
    Subtask,
    TaskStatus,
)
from backend.app.orchestration.supervisor import (
    next_stage,
    ready_subtasks,
    find_gaps,
    exhausted,
    reopen_gaps,
    has_pending_collect,
)
from backend.app.orchestration.dispatch import group_by_role, aggregate


def _subtask(id: str, role: AgentRole, deps: list[str] | None = None) -> Subtask:
    return Subtask(
        id=id, question="q", role=role, stage=StageName.COLLECT,
        company="A", dim="规模", dependencies=deps or [],
    )


def test_next_stage_linear_order():
    assert next_stage(StageName.ALIGN) == StageName.COLLECT
    assert next_stage(StageName.COLLECT) == StageName.VERIFY
    assert next_stage(StageName.VERIFY) == StageName.SYNTHESIZE
    assert next_stage(StageName.SYNTHESIZE) == StageName.SYNTHESIZE


def test_ready_subtasks_respects_dependencies():
    t1 = _subtask("t1", AgentRole.COLLECTOR, deps=[])
    t2 = _subtask("t2", AgentRole.VERIFIER, deps=["t1"])
    ready = ready_subtasks([t1, t2], completed_ids=set())
    # t1 无依赖可派发；t2 依赖 t1 未完成，不可派发
    assert [t.id for t in ready] == ["t1"]


def test_ready_subtasks_after_dependency_completed():
    t2 = _subtask("t2", AgentRole.VERIFIER, deps=["t1"])
    ready = ready_subtasks([t2], completed_ids={"t1"})
    assert [t.id for t in ready] == ["t2"]


def test_find_gaps():
    cells = [
        MatrixCell(company="A", dim="规模", status=CellStatus.GAP),
        MatrixCell(company="A", dim="格局", status=CellStatus.COVERED),
    ]
    gaps = find_gaps(cells)
    assert len(gaps) == 1
    assert gaps[0].dim == "规模"


def test_exhausted_at_limit():
    t = _subtask("t1", AgentRole.COLLECTOR)
    assert not exhausted(t)  # retry_count=0 < limit=3
    t = t.model_copy(update={"retry_count": 3})
    assert exhausted(t)


def test_group_by_role():
    t1 = _subtask("t1", AgentRole.COLLECTOR)
    t2 = _subtask("t2", AgentRole.COLLECTOR)
    t3 = _subtask("t3", AgentRole.VERIFIER)
    grouped = group_by_role([t1, t2, t3])
    assert len(grouped[AgentRole.COLLECTOR]) == 2
    assert len(grouped[AgentRole.VERIFIER]) == 1


def test_aggregate_reports_gaps_and_unresolved():
    cells = [MatrixCell(company="A", dim="规模", status=CellStatus.GAP)]
    t = _subtask("t1", AgentRole.COLLECTOR).model_copy(update={"status": TaskStatus.UNRESOLVED})
    result = aggregate(cells, [t])
    assert len(result["gaps"]) == 1
    assert len(result["unresolved"]) == 1


def test_reopen_gaps_reopens_gap_subtask():
    cells = [MatrixCell(company="A", dim="规模", status=CellStatus.GAP)]
    matrix = ResearchMatrix(companies=["A"], dims=["规模"], cells=cells)
    t = _subtask("t1", AgentRole.COLLECTOR).model_copy(
        update={"status": TaskStatus.COMPLETED}
    )
    subtasks, new_matrix = reopen_gaps([t], matrix)
    assert subtasks[0].status == TaskStatus.PENDING
    assert subtasks[0].retry_count == 1


def test_reopen_gaps_marks_unresolved_at_limit():
    cells = [MatrixCell(company="A", dim="规模", status=CellStatus.GAP)]
    matrix = ResearchMatrix(companies=["A"], dims=["规模"], cells=cells)
    t = _subtask("t1", AgentRole.COLLECTOR).model_copy(
        update={"status": TaskStatus.COMPLETED, "retry_count": 2, "retry_limit": 3}
    )
    subtasks, new_matrix = reopen_gaps([t], matrix)
    assert subtasks[0].status == TaskStatus.UNRESOLVED
    assert new_matrix.cells[0].status == CellStatus.UNRESOLVED


def test_has_pending_collect():
    pending = _subtask("t1", AgentRole.COLLECTOR)
    done = _subtask("t2", AgentRole.COLLECTOR).model_copy(update={"status": TaskStatus.COMPLETED})
    assert has_pending_collect([pending, done]) is True
    assert has_pending_collect([done]) is False
