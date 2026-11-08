# -*- coding: utf-8 -*-
"""临时诊断脚本：模拟 LLM 输出，端到端验证前后端 HTTP 交互（无需浏览器 / 无需 API key）。

运行：
    uv run python backend/_check_interaction.py            # 诊断 + 自测
    uv run python backend/_check_interaction.py --serve    # 在 8000 常驻一个模拟 LLM 后端，供网页直接测

做两件事：
[A] 诊断当前网页环境：8000 后端 / 5173 前端是否在跑，CORS 是否放行前端域，
    并复现「历史会话回放旧 run_id」为什么会显示「报告不可用」。
[B] 在独立端口启动一个「模拟 LLM」后端（复用 OfflineMockLLM 的四阶段确定性输出），
    用真实 HTTP 请求复现前端 api.ts 的完整调用序列：
        SSE 订阅 → GET 查询 → (deep) 审批 retry/confirm → 追问 → 错误码
    每步打印 PASS/FAIL，并把每次模拟 LLM 的输出 JSON 打印出来。
"""
from __future__ import annotations

import argparse
import json
import logging
import socket
import sys
import tempfile
import threading
import time
import uuid
import warnings
from pathlib import Path

# checkpoint 里存了 pydantic 对象，LangGraph 会发「未来版本将阻止」的告警，与本次验证无关
warnings.filterwarnings("ignore", message="Deserializing unregistered type")
logging.getLogger("langgraph").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import httpx  # noqa: E402
import uvicorn  # noqa: E402

from app.llm.mock import OfflineMockLLM  # noqa: E402
from app.main import create_app  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass


class ScriptedLLM(OfflineMockLLM):
    """模拟 LLM：复用离线确定性输出，静默记录调用（避免刷屏），按需汇总。"""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=4096) -> dict:
        out = super().complete_structured(messages, tool_name, input_schema, max_tokens)
        prompt = messages[-1]["content"] if messages else ""
        self.calls.append({"tool": tool_name, "prompt": prompt, "output": out})
        return out

    def dump_script(self) -> None:
        """打印模拟 LLM 的四阶段输出（每种 tool 只打印一次样例）。"""
        seen: set[str] = set()
        for call in self.calls:
            name = call["tool"]
            if name in seen:
                continue
            seen.add(name)
            print(
                f"    [模拟LLM输出] {name} -> "
                f"{json.dumps(call['output'], ensure_ascii=False)[:220]}"
            )
        counts: dict[str, int] = {}
        for call in self.calls:
            counts[call["tool"]] = counts.get(call["tool"], 0) + 1
        print(f"    [模拟LLM调用次数] {counts}")


RESULTS: list[tuple[str, bool]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((label, bool(ok)))
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}" + (f" | {detail}" if detail else ""))


def port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(port: int, workdir: Path):
    """在后台线程起真实 uvicorn（带 SQLite 检查点，支持 HITL resume）。"""
    llm = ScriptedLLM()
    app = create_app(
        llm,
        checkpoint_db=str(workdir / "ckpt.sqlite"),
        task_db=str(workdir / "tasks.sqlite"),
    )
    config = uvicorn.Config(
        app, host="127.0.0.1", port=port, log_level="error", access_log=False
    )
    server = uvicorn.Server(config)
    server.install_signal_handlers = lambda: None  # 非主线程不装 signal
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if port_open(port):
            return llm, server, thread
        time.sleep(0.05)
    raise RuntimeError(f"端口 {port} 上的服务未能启动")


# ------------------------------------------------------------------
# [A] 诊断当前网页环境
# ------------------------------------------------------------------
def diagnose() -> None:
    print("\n=== [A] 当前网页环境诊断 ===")
    back = port_open(8000)
    front = port_open(5173)
    print(f"  前端 5173: {'运行中' if front else '未运行'}")
    print(f"  后端 8000: {'运行中' if back else '未运行'}  <- 前端 api.ts 的 BASE 指向这里")

    if not front:
        print("  ! 前端没起：网页打不开")
    if not back:
        print("  ! 后端没起：页面能开，但所有 /research 请求都会失败")
        print("    => 这正是「无法执行调研 / 报告不可用，请重新发起调研」的直接原因")

    if back:
        try:
            r = httpx.get(
                "http://127.0.0.1:8000/openapi.json",
                headers={"Origin": "http://localhost:5173"},
                timeout=3,
            )
            allow = r.headers.get("access-control-allow-origin", "(缺失)")
            print(f"  后端 /openapi.json: {r.status_code} | CORS: {allow}")
            check("CORS 放行前端域", allow in ("http://localhost:5173", "*"))
            # 复现历史会话回放：localStorage 里残留的旧 run_id，新后端查不到
            r2 = httpx.get("http://127.0.0.1:8000/research/oldrunid", timeout=3)
            print(f"  回放旧 run_id: {r2.status_code} (404 会让前端显示『报告不可用』)")
        except Exception as exc:  # noqa: BLE001
            print(f"  ! 后端探测失败: {exc}")


# ------------------------------------------------------------------
# [B] 模拟 LLM 输出 + 真实 HTTP 前后端交互
# ------------------------------------------------------------------
def read_sse(client: httpx.Client, run_id: str, intent: str, depth: str) -> list[str]:
    """逐行读 SSE，模拟前端 EventSource 收事件。"""
    events: list[str] = []
    with client.stream(
        "GET",
        f"/research/{run_id}/events",
        params={"intent": intent, "depth": depth},
        timeout=30,
    ) as resp:
        print(f"    SSE HTTP {resp.status_code} | {resp.headers.get('content-type')}")
        for line in resp.iter_lines():
            if line.startswith("data:"):
                payload = line[5:].strip()
                events.append(payload)
                print(f"    SSE <- {payload}")
    return events


def self_test(port: int, llm: ScriptedLLM, client: httpx.Client) -> None:
    print(f"\n=== [B] 模拟 LLM 输出 + 真实 HTTP 交互（端口 {port}）===")
    print("  （模拟输出样例在最后汇总打印）")

    # --- 1. 服务与 CORS ---
    print("\n[1] 服务连通 / 跨域")
    r = client.get("/openapi.json", headers={"Origin": "http://localhost:5173"})
    check("后端可达", r.status_code == 200, f"HTTP {r.status_code}")
    check(
        "CORS 放行 5173",
        r.headers.get("access-control-allow-origin") == "http://localhost:5173",
        str(r.headers.get("access-control-allow-origin")),
    )

    # --- 2. simple 模式：SSE -> 报告 -> 追问 ---
    print("\n[2] simple 模式完整链路")
    rid = uuid.uuid4().hex[:8]
    events = read_sse(client, rid, "调研 AI 智能体", "simple")
    nodes = [e for e in events if '"node"' in e]
    check("SSE 以 [DONE] 结束", "[DONE]" in events)
    check("SSE 推了 4 个阶段事件", len(nodes) == 4, f"实际 {len(nodes)} 个: {nodes}")

    r = client.get(f"/research/{rid}")
    data = r.json()
    check("GET 状态 completed", data.get("status") == "completed", str(data.get("status")))
    report = data.get("report") or {}
    for key in ("topic", "summary", "takeaways", "citations", "sections", "coverage"):
        check(f"report.{key} 存在", key in report)
    check("metrics.coverage == 1.0", (data.get("metrics") or {}).get("coverage") == 1.0)

    r = client.post(f"/research/{rid}/follow", json={"question": "增速靠什么驱动？"})
    check("追问返回 answer", bool(r.json().get("answer")), f"HTTP {r.status_code}")

    # --- 3. deep 模式：SSE -> waiting_approval -> retry(带意见) -> confirm -> 报告 ---
    print("\n[3] deep 模式 HITL 审批链路")
    rid2 = uuid.uuid4().hex[:8]
    events2 = read_sse(client, rid2, "调研人形机器人", "deep")
    check("deep SSE 以 [DONE] 结束", "[DONE]" in events2)

    r = client.get(f"/research/{rid2}")
    d2 = r.json()
    check("进入 waiting_approval", d2.get("status") == "waiting_approval", str(d2.get("status")))
    check("返回 approval_hint", d2.get("approval_hint") == "align")

    plan_before = len([c for c in llm.calls if c["tool"] == "submit_plan"])
    r = client.post(
        f"/research/{rid2}/action",
        json={"action": "retry", "feedback": "补充海外市场分析"},
    )
    check("打回仍停在审批点", r.json().get("status") == "waiting_approval", str(r.json()))
    plan_after = [c for c in llm.calls if c["tool"] == "submit_plan"]
    check("打回触发重新规划", len(plan_after) > plan_before)
    check(
        "打回意见进入 LLM prompt",
        any("补充海外市场分析" in c["prompt"] for c in plan_after[plan_before:]),
    )

    r = client.post(f"/research/{rid2}/action", json={"action": "confirm"})
    check("确认后 completed", r.json().get("status") == "completed", str(r.json()))
    d3 = client.get(f"/research/{rid2}").json()
    check("确认后能取到报告", bool(d3.get("report")))

    # --- 4. 错误码 ---
    print("\n[4] 错误码契约")
    check("不存在的 run_id -> 404", client.get("/research/nope").status_code == 404)
    check(
        "completed 任务发 action -> 409",
        client.post(f"/research/{rid}/action", json={"action": "confirm"}).status_code == 409,
    )
    check(
        "追问空问题 -> 400",
        client.post(f"/research/{rid}/follow", json={"question": ""}).status_code == 400,
    )
    # 复现截图：历史会话里残留的旧 run_id
    r = client.get("/research/oldrunid")
    check(
        "旧 run_id 回放 -> 404（前端会显示『报告不可用』）",
        r.status_code == 404,
        str(r.json().get("detail")),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--serve", action="store_true", help="在 8000 常驻模拟 LLM 后端，供网页直接测"
    )
    args = parser.parse_args()

    if args.serve:
        with tempfile.TemporaryDirectory(prefix="ra-serve-") as tmp:
            llm, server, thread = start_server(8000, Path(tmp))
            print("模拟 LLM 后端已启动: http://127.0.0.1:8000 （Ctrl+C 结束）")
            print("网页请打开 http://127.0.0.1:5173/ ，并先清空历史对话再新建调研")
            try:
                while thread.is_alive():
                    time.sleep(1)
            except KeyboardInterrupt:
                server.should_exit = True
        return

    diagnose()
    with tempfile.TemporaryDirectory(prefix="ra-check-") as tmp:
        port = free_port()
        llm, server, thread = start_server(port, Path(tmp))
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=30) as client:
                self_test(port, llm, client)
        finally:
            server.should_exit = True
            thread.join(timeout=5)

    print("\n=== [C] 模拟 LLM 的四阶段输出内容 ===")
    llm.dump_script()

    passed = sum(1 for _, ok in RESULTS if ok)
    total = len(RESULTS)
    print(f"\n=== 汇总: {passed}/{total} 通过 ===")
    for label, ok in RESULTS:
        if not ok:
            print(f"  失败项: {label}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
