"""状态模块测试：schema 实体、coverage 派生、reducer 合并、检查点。"""
from backend.app.state.schema import (
    AgentRole,
    CellStatus,
    Claim,
    ClaimStatus,
    Evidence,
    EvidenceStrength,
    MatrixCell,
    ResearchMatrix,
    RootState,
    StageName,
    Subtask,
    TaskStatus,
)
from backend.app.state.graph import _upsert_by_id, initial_state


def test_coverage_derived_from_cells():
    m = ResearchMatrix(
        companies=["A", "B"],
        dims=["规模", "格局"],
        cells=[
            MatrixCell(company="A", dim="规模", status=CellStatus.COVERED),
            MatrixCell(company="A", dim="格局", status=CellStatus.GAP),
        ],
    )
    assert m.coverage == 0.5


def test_coverage_empty_matrix_is_zero():
    assert ResearchMatrix().coverage == 0.0


def test_upsert_by_id_merges_same_id():
    a = Subtask(id="t1", question="q", role=AgentRole.COLLECTOR, stage=StageName.COLLECT)
    b = Subtask(
        id="t1",
        question="q2",
        role=AgentRole.COLLECTOR,
        stage=StageName.COLLECT,
        status=TaskStatus.COMPLETED,
    )
    merged = _upsert_by_id([a], [b])
    assert len(merged) == 1
    assert merged[0].status == TaskStatus.COMPLETED


def test_upsert_by_id_keeps_distinct_ids():
    a = Subtask(id="t1", question="q", role=AgentRole.COLLECTOR, stage=StageName.COLLECT)
    b = Subtask(id="t2", question="q", role=AgentRole.VERIFIER, stage=StageName.VERIFY)
    merged = _upsert_by_id([a], [b])
    assert len(merged) == 2


def test_initial_state_shape():
    s = initial_state("r1", "u1", "调研 AI 智能体")
    assert s["run_id"] == "r1"
    assert s["user_id"] == "u1"
    assert s["intent"] == "调研 AI 智能体"
    assert s["stage"] == StageName.ALIGN
    assert s["matrix"].coverage == 0.0
    assert s["subtasks"] == []


def test_root_state_assembles_entities():
    claim = Claim(
        id="c1",
        text="市场规模约 52 亿美元",
        strength=EvidenceStrength.SOLID,
        role=AgentRole.COLLECTOR,
    )
    evidence = Evidence(id="e1", url="https://example.com", credibility=0.9, source_level=1)
    root = RootState(
        run_id="r1",
        user_id="u1",
        intent="调研",
        stage=StageName.ALIGN,
        claims=[claim],
        evidences=[evidence],
    )
    assert root.claims[0].id == "c1"
    assert root.claims[0].status == ClaimStatus.DRAFT
    assert root.evidences[0].source_level == 1
