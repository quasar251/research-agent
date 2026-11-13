"""冒烟测试：Python 模拟 LLM 响应，验证前后端交互全链路。

运行：
    uv run python backend/smoke_test.py            # 进程内 TestClient（秒级，不依赖服务）
    uv run python backend/smoke_test.py --http    # 额外检查已运行的 8000 服务

不联网、不需要 API key。LLM 响应全部由 SmokeLLM 确定性模拟，
覆盖：/research(simple) / SSE 四阶段 / deep HITL 审批 / 追问 /
/demo/* 演示数据端点 / 错误码 / 部署态 HTTP。
"""
from __future__ import annotations

import json
import logging
import sys
import tempfile
import time
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# checkpoint 反序列化自定义类型的告警与冒烟结果无关
warnings.filterwarnings("ignore", message="Deserializing unregistered type")
logging.getLogger("langgraph").setLevel(logging.ERROR)

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.llm.mock import OfflineMockLLM  # noqa: E402
from backend.app.main import create_app  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

RESULTS: list[tuple[str, bool]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((label, bool(ok)))
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" | {detail}" if detail else ""))


class SmokeLLM(OfflineMockLLM):
    """模拟 LLM：复用确定性四阶段输出，同时记录每次调用与返回内容。"""

    def __init__(self) -> None:
        super().__init__(delay_s=0)
        # 父类 calls 是 list[tuple[str, float]] 时间轴，这里用独立列表存详细记录
        self.records: list[dict] = []

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=4096) -> dict:
        out = super().complete_structured(messages, tool_name, input_schema, max_tokens)
        self.records.append(
            {
                "tool": tool_name,
                "prompt": messages[-1]["content"] if messages else "",
                "output": out,
            }
        )
        return out

    def dump_responses(self) -> None:
        """打印模拟 LLM 的每类响应样例 + 调用统计。"""
        seen: set[str] = set()
        for c in self.records:
            if c["tool"] in seen:
                continue
            seen.add(c["tool"])
            print(
                f"    [模拟LLM响应] {c['tool']} -> "
                f"{json.dumps(c['output'], ensure_ascii=False)[:200]}"
            )
        counts: dict[str, int] = {}
        for c in self.records:
            counts[c["tool"]] = counts.get(c["tool"], 0) + 1
        print(f"    [模拟LLM调用统计] {counts}")


def wait_status(client: TestClient, run_id: str, target: str, timeout: float = 15.0) -> tuple[dict, list[str]]:
    """轮询任务状态，返回 (最终响应, 去重状态轨迹)。"""
    deadline = time.monotonic() + timeout
    seen: list[str] = []
    last: dict = {}
    while time.monotonic() < deadline:
        last = client.get(f"/research/{run_id}").json()
        status = last.get("status")
        if not seen or seen[-1] != status:
            seen.append(status)
        if status == target:
            return last, seen
        time.sleep(0.01)
    raise AssertionError(f"等待 {target} 超时；轨迹={seen}；最后={last}")


def sse_payloads(body: str) -> list[str]:
    return [ln[6:] for ln in body.splitlines() if ln.startswith("data: ")]


def make_client(llm: SmokeLLM, tmp: Path) -> TestClient:
    app = create_app(
        llm,
        checkpoint_db=str(tmp / "checkpoints.sqlite"),
        task_db=str(tmp / "tasks.sqlite"),
    )
    return TestClient(app)


# ------------------------------------------------------------------
# [1] /demo/* 演示数据端点（旧版 DAG 前端的数据源）
# ------------------------------------------------------------------
def smoke_demo(client: TestClient) -> None:
    print("\n[1] /demo/* 演示数据端点")
    r = client.get("/demo/bootstrap")
    check("bootstrap 200", r.status_code == 200, f"HTTP {r.status_code}")
    d = r.json()
    reports = d.get("reports", {})
    stages = d.get("stages", {})
    check("3 份报告", len(reports) == 3, str(list(reports)))
    check("6 组阶段定义", len(stages) == 6, str(len(stages)))
    check(
        "deep 5 阶段 / simple 3 阶段",
        len(stages.get("ai-agent:deep", [])) == 5 and len(stages.get("ai-agent:simple", [])) == 3,
    )
    check("suggestions 非空", len(d.get("suggestions", [])) > 0)
    check(
        "报告字段齐全",
        all(k in reports["ai-agent"] for k in ("headline", "cagr", "takeaways", "sections", "followUpHints")),
    )
    check("品牌无残留", "研衡" not in json.dumps(d, ensure_ascii=False))

    r = client.post("/demo/match", json={"query": "人形机器人产业链"})
    check("/demo/match 命中 humanoid", r.json().get("report_id") == "humanoid", str(r.json().get("report_id")))

    r = client.post("/demo/follow", json={"question": "增速如何", "report_id": "ai-agent", "model": "pro"})
    body = r.json()
    check("追问返回 label + bullets", bool(body.get("label")) and len(body.get("bullets", [])) == 2)
    check("追问品牌为研小报", "研小报" in body.get("label", ""))

    r = client.post("/demo/action", json={"action": "retry", "report_id": "ai-agent", "stage": 0, "feedback": "增加海外市场"})
    check("审批返回 ok", r.json().get("ok") is True)
    r = client.get("/demo/actions")
    check("审批流水可查", any(x.get("feedback") == "增加海外市场" for x in r.json()))


# ------------------------------------------------------------------
# [2] /research simple：模拟 LLM 四阶段 → 报告 → 追问
# ------------------------------------------------------------------
def smoke_simple(client: TestClient, llm: SmokeLLM) -> str:
    print("\n[2] /research simple（模拟 LLM 四阶段）")
    r = client.post("/research", json={"intent": "调研 AI 智能体", "depth": "simple"})
    check("创建任务 200/pending", r.status_code == 200 and r.json().get("status") == "pending")
    run_id = r.json()["run_id"]

    done, seen = wait_status(client, run_id, "completed")
    check("状态机经过 running", "running" in seen or "pending" in seen, str(seen))
    report = done.get("report") or {}
    for key in ("topic", "summary", "takeaways", "citations", "sections", "coverage"):
        check(f"report.{key} 存在", key in report)
    check("metrics.coverage == 1.0", (done.get("metrics") or {}).get("coverage") == 1.0)

    tools = [c["tool"] for c in llm.records]
    check("四阶段都调用 LLM", all(t in tools for t in ("submit_plan", "submit_claims", "submit_verdict", "submit_report")), str(sorted(set(tools))))

    before = tools.count("submit_claims")
    r = client.post(f"/research/{run_id}/follow", json={"question": "市场规模？"})
    check("追问返回 answer", bool(r.json().get("answer")), f"HTTP {r.status_code}")
    check("追问不重新检索", [c["tool"] for c in llm.records].count("submit_claims") == before)
    return run_id


# ------------------------------------------------------------------
# [3] SSE 四阶段事件
# ------------------------------------------------------------------
def smoke_sse(client: TestClient) -> None:
    print("\n[3] SSE 流式进度")
    r = client.get("/research/sse-smoke/events", params={"intent": "SSE 冒烟", "depth": "simple"})
    check("SSE 200", r.status_code == 200, f"HTTP {r.status_code}")
    payloads = sse_payloads(r.text)
    nodes = [json.loads(p)["node"] for p in payloads if p.startswith("{")]
    check("四阶段按序推送", nodes[:4] == ["align", "collect", "verify", "synthesize"], str(nodes))
    check("以 [DONE] 结束", payloads[-1] == "[DONE]")
    check("结果落库可查", client.get("/research/sse-smoke").json().get("status") == "completed")


# ------------------------------------------------------------------
# [4] deep HITL：审批 → 打回(意见进 prompt) → 确认 → 完成
# ------------------------------------------------------------------
def smoke_deep(client: TestClient, llm: SmokeLLM) -> None:
    print("\n[4] deep HITL 审批链路")
    # 只统计本次 deep 场景新增的调用，避免前面 simple/SSE 场景的记录干扰
    mark = len(llm.records)
    run_id = client.post("/research", json={"intent": "深度调研", "depth": "deep"}).json()["run_id"]
    waiting, _ = wait_status(client, run_id, "waiting_approval")
    check("停在 waiting_approval", waiting.get("approval_hint") == "align")
    check("审批前未成稿", "submit_report" not in [c["tool"] for c in llm.records[mark:]])

    r = client.post(f"/research/{run_id}/action", json={"action": "retry", "feedback": "补充海外市场分析"})
    check("打回仍等待审批", r.json().get("status") == "waiting_approval", str(r.json()))
    check(
        "打回意见进入 LLM prompt",
        any("补充海外市场分析" in c["prompt"] for c in llm.records[mark:] if c["tool"] == "submit_plan"),
    )

    r = client.post(f"/research/{run_id}/action", json={"action": "confirm"})
    check("确认后 completed", r.json().get("status") == "completed", str(r.json()))
    done, _ = wait_status(client, run_id, "completed")
    check("可取得报告", bool(done.get("report")))


# ------------------------------------------------------------------
# [5] 错误码契约
# ------------------------------------------------------------------
def smoke_errors(client: TestClient, simple_run_id: str) -> None:
    print("\n[5] 错误码")
    check("不存在 run_id -> 404", client.get("/research/nope").status_code == 404)
    check("空 intent -> 400", client.post("/research", json={"intent": "  "}).status_code == 400)
    check(
        "completed 发 action -> 409",
        client.post(f"/research/{simple_run_id}/action", json={"action": "confirm"}).status_code == 409,
    )
    check(
        "追问空问题 -> 400",
        client.post(f"/research/{simple_run_id}/follow", json={"question": ""}).status_code == 400,
    )


# ------------------------------------------------------------------
# [6] 部署态：已运行的 8000 服务（可选）
# ------------------------------------------------------------------
def smoke_http() -> None:
    print("\n[6] 部署态 HTTP（127.0.0.1:8000）")
    try:
        import httpx

        r = httpx.get("http://127.0.0.1:8000/demo/bootstrap", timeout=3)
        check("线上 bootstrap 200", r.status_code == 200, f"HTTP {r.status_code}")
        d = r.json()
        check("线上数据完整（3 报告）", len(d.get("reports", {})) == 3, f"{len(d.get('reports', {}))} 份")
        r2 = httpx.get(
            "http://127.0.0.1:8000/demo/bootstrap",
            headers={"Origin": "http://127.0.0.1:5173"},
            timeout=3,
        )
        check(
            "CORS 放行 5173",
            r2.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173",
            str(r2.headers.get("access-control-allow-origin")),
        )
    except Exception as exc:  # noqa: BLE001
        check("线上服务可达", False, f"未启动或无响应（{type(exc).__name__}）")


def main() -> None:
    print("=" * 66)
    print("冒烟测试 · Python 模拟 LLM 响应（无网络 / 无 API key）")
    print("=" * 66)

    llm = SmokeLLM()
    with tempfile.TemporaryDirectory(prefix="ra-smoke-", ignore_cleanup_errors=True) as tmp:
        with make_client(llm, Path(tmp)) as client:
            smoke_demo(client)
            simple_run_id = smoke_simple(client, llm)
            smoke_sse(client)
            smoke_deep(client, llm)
            smoke_errors(client, simple_run_id)

    if "--http" in sys.argv:
        smoke_http()

    print("\n" + "=" * 66)
    print("[模拟 LLM 响应样例]")
    llm.dump_responses()
    print("=" * 66)

    passed = sum(1 for _, ok in RESULTS if ok)
    total = len(RESULTS)
    print(f"汇总: {passed}/{total} 通过")
    for label, ok in RESULTS:
        if not ok:
            print(f"  失败项: {label}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
