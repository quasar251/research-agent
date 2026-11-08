"""接口层测试：FastAPI 端点（用 mock LLM）。"""
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.llm.client import ChatMessage
from backend.app.state.schema import (
    AgentRole,
    CellStatus,
    Claim,
    EvidenceStrength,
    MatrixCell,
    ReportModel,
    ResearchMatrix,
)


class MockLLM:
    model = "mock"

    def complete(self, messages: list[ChatMessage], max_tokens: int = 1024) -> str:
        return "{}"

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=1024) -> dict:
        if tool_name == "submit_plan":
            return {
                "companies": ["公司A"],
                "dims": ["市场规模"],
                "subtasks": [
                    {
                        "id": "t1",
                        "question": "市场规模是多少",
                        "company": "公司A",
                        "dim": "市场规模",
                        "dependencies": [],
                    }
                ],
            }
        if tool_name == "submit_claims":
            return {"claims": [{"text": "规模约 52 亿美元", "evidence_urls": ["https://x.com"]}]}
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_report":
            return {"summary": "最终报告摘要"}
        if tool_name == "submit_answer":
            return {"answer": "基于结论的回答"}
        return {}


def _client():
    return TestClient(create_app(MockLLM()))


def test_create_research_returns_pending():
    resp = _client().post("/research", json={"intent": "调研 AI 智能体"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert "run_id" in data


def test_get_research_not_found():
    resp = _client().get("/research/nonexistent")
    assert resp.status_code == 404


def test_get_research_returns_completed_result():
    app = create_app(MockLLM())
    app.state.task_store.create("r1", "调研")
    matrix = ResearchMatrix(
        companies=["A"], dims=["规模"],
        cells=[MatrixCell(company="A", dim="规模", status=CellStatus.COVERED)],
    )
    app.state.task_store.update("r1", "completed", {
        "report": ReportModel(topic="调研", summary="最终报告摘要"),
        "matrix": matrix,
        "claims": [Claim(id="c1", text="x", strength=EvidenceStrength.SOLID, role=AgentRole.COLLECTOR)],
    })
    client = TestClient(app)
    resp = client.get("/research/r1")
    data = resp.json()
    assert data["status"] == "completed"
    assert data["report"]["summary"] == "最终报告摘要"
    assert data["metrics"]["coverage"] == 1.0


def test_stream_research():
    resp = _client().get("/research/r1/events", params={"intent": "调研 AI 智能体"})
    assert resp.status_code == 200
    assert "data:" in resp.text
    assert "[DONE]" in resp.text


def test_new_research_flow_end_to_end():
    """模拟前端「新建调研」完整链路：SSE 阶段事件 → 取报告 → 追问。"""
    client = _client()
    run_id = "flow1"

    # 1. SSE 即开即跑，四个阶段事件依次推送 + [DONE]
    resp = client.get(f"/research/{run_id}/events", params={"intent": "调研 AI 智能体", "depth": "simple"})
    assert resp.status_code == 200
    body = resp.text
    for stage in ["align", "collect", "verify", "synthesize"]:
        assert f'{{"node": "{stage}"}}' in body
    assert "[DONE]" in body

    # 2. onDone 后取报告
    resp = client.get(f"/research/{run_id}")
    data = resp.json()
    assert data["status"] == "completed"
    assert data["report"]["summary"]
    assert data["metrics"]["coverage"] == 1.0

    # 3. 追问
    resp = client.post(f"/research/{run_id}/follow", json={"question": "市场规模如何？"})
    assert resp.status_code == 200
    assert resp.json()["answer"]


def test_follow_research_returns_answer():
    client = _client()
    # SSE 即开即跑，跑完结果落 store + runtime 缓存
    client.get("/research/rf1/events", params={"intent": "调研 AI 智能体"})
    resp = client.post("/research/rf1/follow", json={"question": "市场规模如何？"})
    assert resp.status_code == 200
    assert resp.json()["answer"] == "基于结论的回答"


def test_follow_research_not_found():
    resp = _client().post("/research/nonexist/follow", json={"question": "x"})
    assert resp.status_code == 404


def test_follow_research_wrong_state():
    app = create_app(MockLLM())
    app.state.task_store.create("rpending", "调研")
    client = TestClient(app)
    resp = client.post("/research/rpending/follow", json={"question": "x"})
    assert resp.status_code == 409
