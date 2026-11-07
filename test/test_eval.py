"""评估模块测试：报告质量、事实引用、过程质量。"""
from backend.app.llm.client import ChatMessage
from backend.app.state.graph import initial_state
from backend.app.state.schema import (
    AgentRole,
    Claim,
    EvidenceStrength,
    MatrixCell,
    ResearchMatrix,
    CellStatus,
)
from eval.report_quality import score_report
from eval.factuality import verify_claim
from eval.process import score_process


class MockLLM:
    model = "mock"

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        content = messages[-1]["content"]
        if "评估者" in content:
            return '{"全面性": 5, "洞察力": 4, "指令遵循": 4, "信息密度": 5}'
        if "事实核查者" in content:
            return '{"verdict": "supported"}'
        return "{}"


def test_score_report():
    result = score_report(MockLLM(), "这是一份报告")
    assert result["全面性"] == 5
    assert result["信息密度"] == 5


def test_verify_claim():
    claim = Claim(id="c1", text="市场规模 52 亿", strength=EvidenceStrength.SOLID, role=AgentRole.COLLECTOR)
    assert verify_claim(MockLLM(), claim) == "supported"


def test_score_process_reuses_metrics():
    state = initial_state("r1", "u1", "intent")
    state["matrix"] = ResearchMatrix(
        companies=["A"], dims=["规模"],
        cells=[MatrixCell(company="A", dim="规模", status=CellStatus.COVERED)],
    )
    state["claims"] = [
        Claim(id="c1", text="x", strength=EvidenceStrength.SOLID, role=AgentRole.COLLECTOR),
        Claim(id="c2", text="y", strength=EvidenceStrength.INFERRED, role=AgentRole.COLLECTOR),
    ]
    result = score_process(state)
    assert result["coverage"] == 1.0
    assert result["coverage_ok"] is True
    assert result["solid_ratio"] == 0.5
