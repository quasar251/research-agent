"""可观测性模块测试：指标、追踪、审计。"""
from backend.app.state.graph import initial_state
from backend.app.state.schema import (
    AgentRole,
    Claim,
    Evidence,
    EvidenceStrength,
    MatrixCell,
    ResearchMatrix,
    CellStatus,
)
from backend.app.observability.metrics import compute_metrics
from backend.app.observability.trace import trace_claim
from backend.app.observability.audit import AuditLog


def test_compute_metrics():
    state = initial_state("r1", "u1", "intent")
    state["matrix"] = ResearchMatrix(
        companies=["A"], dims=["规模"],
        cells=[MatrixCell(company="A", dim="规模", status=CellStatus.COVERED)],
    )
    state["claims"] = [
        Claim(id="c1", text="x", strength=EvidenceStrength.SOLID, role=AgentRole.COLLECTOR),
        Claim(id="c2", text="y", strength=EvidenceStrength.INFERRED, role=AgentRole.COLLECTOR),
    ]
    m = compute_metrics(state)
    assert m["coverage"] == 1.0
    assert m["strength_distribution"] == {"solid": 1, "inferred": 1}
    assert m["claim_count"] == 2


def test_trace_claim():
    evidence = Evidence(id="e1", url="https://example.com", credibility=0.9)
    claim = Claim(
        id="c1", text="结论", strength=EvidenceStrength.SOLID,
        role=AgentRole.COLLECTOR, evidence_refs=["e1"],
    )
    trace = trace_claim(claim, [evidence])
    assert trace["claim_id"] == "c1"
    assert trace["role"] == "collector"
    assert trace["sources"][0]["url"] == "https://example.com"


def test_audit_log_query():
    log = AuditLog()
    log.record("工具调用", "collector")
    log.record("派发", "supervisor")
    log.record("工具调用", "collector")
    assert len(log.query()) == 3
    assert len(log.query("工具调用")) == 2
