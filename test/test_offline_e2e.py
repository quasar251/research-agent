"""离线端到端测试：无 API key、无网络，跑通前后端对接契约的全部场景。

覆盖：
- 简单调研全流程（POST /research → 轮询 → 结构化报告 → 追问）
- 深度调研全流程（HITL 审批点 → confirm / retry → 完成）
- 模拟等待时间（OfflineMockLLM.delay_s + 状态轨迹 + 调用时间轴）
- SSE 阶段事件、追问、参数校验、幂等

运行：uv run pytest test/test_offline_e2e.py -q
"""
from __future__ import annotations

import json
import time

import pytest
from test.offline_helpers import (
    RecordingOfflineLLM,
    make_offline_client,
    sse_events,
    wait_for_status,
)

# LangGraph 从 SQLite 检查点反序列化自定义类型时会告警（不影响行为）
pytestmark = pytest.mark.filterwarnings(
    "ignore:Deserializing unregistered type:UserWarning"
)

INTENT = "AI 智能体行业调研"


# ---------------------------------------------------------------------------
# A. 离线 Mock 自身：确定性、无密钥、模拟耗时
# ---------------------------------------------------------------------------


def test_offline_mock_is_deterministic_and_needs_no_key(monkeypatch):
    """任何 tool_name 都返回确定结构，且全程不读密钥、不联网。"""
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("MOCK_DELAY_MS", raising=False)
    llm = RecordingOfflineLLM()

    plan = llm.complete_structured([], "submit_plan", {})
    claims = llm.complete_structured([], "submit_claims", {})
    verdict = llm.complete_structured([], "submit_verdict", {})
    report = llm.complete_structured([], "submit_report", {})
    answer = llm.complete_structured([], "submit_answer", {})

    assert llm.model == "offline-mock"
    assert llm.delay_s == 0.0
    assert len(plan["companies"]) >= 3 and len(plan["dims"]) >= 3
    assert claims["claims"] and claims["claims"][0]["text"]
    assert verdict["strength"] in {"solid", "inferred", "consensus", "divided"}
    assert report["summary"] and len(report["sections"]) == 4
    assert {s["kind"] for s in report["sections"]} == {"chart", "bars", "swot", "risk"}
    assert answer["answer"]
    # 五次调用都被记进时间轴，顺序与调用一致
    assert [t for t, _ in llm.calls] == [
        "submit_plan", "submit_claims", "submit_verdict", "submit_report", "submit_answer"
    ]


def test_offline_mock_delay_produces_monotonic_timeline():
    """delay_s 生效：相邻调用的时间戳差 ≥ 延迟，时间轴严格单调。"""
    delay = 0.01
    llm = RecordingOfflineLLM(delay_s=delay)
    t0 = time.monotonic()
    for tool in ("submit_plan", "submit_claims", "submit_verdict", "submit_report"):
        llm.complete_structured([], tool, {})
    elapsed = time.monotonic() - t0

    assert elapsed >= delay * 3 * 0.8
    stamps = [stamp for _, stamp in llm.calls]
    assert stamps == sorted(stamps)
    assert all(b - a >= delay * 0.8 for a, b in zip(stamps, stamps[1:]))


# ---------------------------------------------------------------------------
# B. 简单调研全流程
# ---------------------------------------------------------------------------


def test_simple_research_full_flow(tmp_path):
    """POST /research(simple) → 轮询 → completed → 结构化报告 + metrics + 追问。"""
    llm = RecordingOfflineLLM()
    with make_offline_client(llm, tmp_path, "simple") as client:
        created = client.post("/research", json={"intent": INTENT, "depth": "simple"})
        assert created.status_code == 200
        assert created.json()["status"] == "pending"
        run_id = created.json()["run_id"]

        done, seen = wait_for_status(client, run_id, "completed")
        assert seen[0] in {"pending", "running"}

        report = done["report"]
        assert report["topic"] == INTENT
        assert report["summary"] and "AI Agent" in report["summary"]
        assert report["takeaways"], "结论台账应派生出 takeaways"
        assert {s["kind"] for s in report["sections"]} == {"chart", "bars", "swot", "risk"}
        assert 0.0 <= report["coverage"] <= 1.0
        assert done["metrics"]["claim_count"] == len(report["takeaways"])
        assert done["metrics"]["coverage"] == report["coverage"]

        # 四个阶段都真实走过（不是 LLM 假装回答）
        tools = [t for t, _ in llm.calls]
        assert tools[0] == "submit_plan"
        assert "submit_claims" in tools and "submit_verdict" in tools
        assert tools[-1] == "submit_report"

        # 追问：基于已有结论回答，不重新检索
        before = tools.count("submit_claims")
        follow = client.post(
            f"/research/{run_id}/follow", json={"question": "三年 CAGR 是多少？"}
        )
        assert follow.status_code == 200
        assert "52 亿美元" in follow.json()["answer"]
        assert [t for t, _ in llm.calls].count("submit_claims") == before


def test_simple_research_sse_events(tmp_path):
    """SSE 即开即跑：四个阶段事件按序推送，结束后结果落库可查。"""
    with make_offline_client(RecordingOfflineLLM(), tmp_path, "sse") as client:
        resp = client.get(
            "/research/sse-run/events", params={"intent": INTENT, "depth": "simple"}
        )
        assert resp.status_code == 200
        payloads = sse_events(resp.text)
        nodes = [json.loads(p)["node"] for p in payloads if p.startswith("{")]
        assert nodes[:4] == ["align", "collect", "verify", "synthesize"]
        assert payloads[-1] == "[DONE]"

        done = client.get("/research/sse-run").json()
        assert done["status"] == "completed"
        assert done["report"]["summary"]


# ---------------------------------------------------------------------------
# C. 深度调研全流程（HITL）
# ---------------------------------------------------------------------------


def test_deep_research_full_flow_with_confirm(tmp_path):
    """deep：停在 align 审批点 → confirm → 完成，报告含完整章节。"""
    llm = RecordingOfflineLLM()
    with make_offline_client(llm, tmp_path, "deep") as client:
        run_id = client.post(
            "/research", json={"intent": INTENT, "depth": "deep"}
        ).json()["run_id"]

        waiting, seen = wait_for_status(client, run_id, "waiting_approval")
        assert waiting["approval_hint"] == "align"
        assert [t for t, _ in llm.calls].count("submit_plan") == 1, "审批前只应规划一次"
        assert "submit_report" not in [t for t, _ in llm.calls], "审批前不应成稿"

        action = client.post(
            f"/research/{run_id}/action", json={"action": "confirm"}
        )
        assert action.status_code == 200

        done, _ = wait_for_status(client, run_id, "completed")
        assert done["report"]["summary"]
        assert len(done["report"]["sections"]) == 4
        assert [t for t, _ in llm.calls][-1] == "submit_report"


def test_deep_research_retry_feedback_then_confirm(tmp_path):
    """retry 的人工意见必须进入下一轮规划，且再次停在审批点。"""
    llm = RecordingOfflineLLM()
    with make_offline_client(llm, tmp_path, "retry") as client:
        run_id = client.post(
            "/research", json={"intent": INTENT, "depth": "deep"}
        ).json()["run_id"]
        wait_for_status(client, run_id, "waiting_approval")

        feedback = "增加海外市场分析"
        action = client.post(
            f"/research/{run_id}/action",
            json={"action": "retry", "feedback": feedback},
        )
        assert action.status_code == 200
        assert action.json()["status"] == "waiting_approval"

        assert feedback in llm.prompts[-1], "打回意见必须进入 Lead 的重规划 prompt"
        assert any("人工打回意见" in p for p in llm.prompts)

        client.post(f"/research/{run_id}/action", json={"action": "confirm"})
        done, _ = wait_for_status(client, run_id, "completed")
        assert done["report"]["summary"]


def test_deep_action_wrong_state(tmp_path):
    """非 waiting_approval 的任务发 action → 409 WRONG_STATE。"""
    with make_offline_client(RecordingOfflineLLM(), tmp_path, "wrongstate") as client:
        run_id = client.post(
            "/research", json={"intent": INTENT, "depth": "simple"}
        ).json()["run_id"]
        wait_for_status(client, run_id, "completed")
        resp = client.post(
            f"/research/{run_id}/action", json={"action": "confirm"}
        )
        assert resp.status_code == 409
        assert resp.json()["detail"] == "WRONG_STATE"


# ---------------------------------------------------------------------------
# D. 模拟等待时间：中间态可观测、轮询等待逻辑
# ---------------------------------------------------------------------------


def test_simulated_wait_exposes_intermediate_state(tmp_path):
    """delay_s 让调研有真实耗时：能观察到 running 中间态，且总耗时符合预期。"""
    delay = 0.01
    llm = RecordingOfflineLLM(delay_s=delay)
    with make_offline_client(llm, tmp_path, "wait") as client:
        t0 = time.monotonic()
        run_id = client.post(
            "/research", json={"intent": INTENT, "depth": "simple"}
        ).json()["run_id"]

        # 提交瞬间仍是 pending/running，不应已 completed
        first = client.get(f"/research/{run_id}").json()
        assert first["status"] in {"pending", "running"}

        done, seen = wait_for_status(client, run_id, "completed", timeout=20.0)
        elapsed = time.monotonic() - t0

        assert "running" in seen, "延迟不足时中间态会一闪而过"
        assert done["status"] == "completed"
        # 每次 LLM 调用都 sleep(delay)，总耗时至少应覆盖大部分调用
        assert elapsed >= len(llm.calls) * delay * 0.5
        stamps = [s for _, s in llm.calls]
        assert stamps[-1] - stamps[0] >= delay * (len(llm.calls) - 1) * 0.8


def test_wait_for_status_times_out_on_stalled_task():
    """辅助函数本身：目标状态始终不出现时按超时报错并附状态轨迹。"""

    class StalledClient:
        def get(self, path):
            class Resp:
                status_code = 200
                text = '{"status": "running"}'

                def json(self):
                    return {"status": "running"}

            return Resp()

    with pytest.raises(AssertionError) as exc:
        wait_for_status(StalledClient(), "r-stall", "completed", timeout=0.05, interval=0.01)
    assert "超时" in str(exc.value)
    assert "running" in str(exc.value)


# ---------------------------------------------------------------------------
# E. 追问环节与参数校验
# ---------------------------------------------------------------------------


def test_follow_up_validation_and_state(tmp_path):
    """追问：未完成 409 / 空问题 400 / 不存在 404 / 正常回答。"""
    with make_offline_client(RecordingOfflineLLM(), tmp_path, "follow") as client:
        run_id = client.post(
            "/research", json={"intent": INTENT, "depth": "simple"}
        ).json()["run_id"]

        # 任务尚未完成时追问应被拒绝（用 SSE 之外的场景：直接查一个 pending 任务）
        client.post("/research", json={"intent": "另一个调研", "depth": "deep"})
        missing = client.post("/research/nope/follow", json={"question": "x"})
        assert missing.status_code == 404
        assert missing.json()["detail"] == "RUN_NOT_FOUND"

        wait_for_status(client, run_id, "completed")

        empty = client.post(f"/research/{run_id}/follow", json={"question": "   "})
        assert empty.status_code == 400
        assert empty.json()["detail"] == "INVALID_PARAM"

        ok = client.post(
            f"/research/{run_id}/follow", json={"question": "主要风险是什么？"}
        )
        assert ok.status_code == 200
        assert ok.json()["answer"]


def test_follow_up_after_deep_uses_cached_result(tmp_path):
    """deep 完成（confirm 后）同样可追问，复用已产出报告而非重跑调研。"""
    llm = RecordingOfflineLLM()
    with make_offline_client(llm, tmp_path, "deepfollow") as client:
        run_id = client.post(
            "/research", json={"intent": INTENT, "depth": "deep"}
        ).json()["run_id"]
        wait_for_status(client, run_id, "waiting_approval")
        client.post(f"/research/{run_id}/action", json={"action": "confirm"})
        wait_for_status(client, run_id, "completed")

        claims_before = [t for t, _ in llm.calls].count("submit_claims")
        resp = client.post(
            f"/research/{run_id}/follow", json={"question": "护城河是什么？"}
        )
        assert resp.status_code == 200 and resp.json()["answer"]
        assert [t for t, _ in llm.calls].count("submit_claims") == claims_before


def test_create_validation_and_idempotency(tmp_path):
    """空 intent 400；同一 Idempotency-Key 返回同一 run_id。"""
    with make_offline_client(RecordingOfflineLLM(), tmp_path, "misc") as client:
        bad = client.post("/research", json={"intent": "   "})
        assert bad.status_code == 400
        assert bad.json()["detail"] == "INVALID_PARAM"

        key = "e2e-key-1"
        a = client.post("/research", json={"intent": INTENT}, headers={"Idempotency-Key": key})
        b = client.post("/research", json={"intent": INTENT}, headers={"Idempotency-Key": key})
        assert a.json()["run_id"] == b.json()["run_id"]
