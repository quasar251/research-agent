"""离线 E2E 测试辅助层（无 API key、无网络）。

提供三件东西：
- RecordingOfflineLLM：共享离线 Mock + prompt/时间轴记录
- make_offline_client：构造带 checkpointer 的 TestClient（deep 的 HITL 中断必需）
- wait_for_status：轮询等待异步任务，返回最终响应与观察到的状态轨迹
"""
from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.llm.mock import OfflineMockLLM
from backend.app.main import create_app


class RecordingOfflineLLM(OfflineMockLLM):
    """在共享离线 Mock 基础上，记录每次调用的 prompt 与工具名时间轴。"""

    def __init__(self, delay_s: float = 0.0) -> None:
        super().__init__(delay_s=delay_s)
        self.prompts: list[str] = []

    def complete_structured(
        self, messages, tool_name, input_schema, max_tokens: int = 4096
    ) -> dict:
        self.prompts.append(messages[-1]["content"] if messages else "")
        return super().complete_structured(
            messages, tool_name, input_schema, max_tokens
        )


def make_offline_client(llm, tmp_path: Path, tag: str) -> TestClient:
    """构造隔离的离线 app；checkpoint_db 让 deep 的 interrupt/resume 能恢复。"""
    app = create_app(
        llm,
        checkpoint_db=str(tmp_path / f"{tag}-checkpoints.sqlite"),
        task_db=str(tmp_path / f"{tag}-tasks.sqlite"),
    )
    return TestClient(app)


def wait_for_status(
    client: TestClient,
    run_id: str,
    targets,
    timeout: float = 15.0,
    interval: float = 0.01,
) -> tuple[dict, list[str]]:
    """轮询 GET /research/{run_id} 直到命中目标状态。

    返回 (最终响应 JSON, 去重后的状态轨迹)，供测试断言中间态与等待逻辑。
    超时抛 AssertionError，附带状态轨迹便于定位。
    """
    if isinstance(targets, str):
        targets = {targets}
    else:
        targets = set(targets)
    deadline = time.monotonic() + timeout
    seen: list[str] = []
    last: dict = {}
    while time.monotonic() < deadline:
        resp = client.get(f"/research/{run_id}")
        assert resp.status_code == 200, f"查询失败: {resp.status_code} {resp.text}"
        last = resp.json()
        status = last.get("status")
        if not seen or seen[-1] != status:
            seen.append(status)
        if status in targets:
            return last, seen
        time.sleep(interval)
    raise AssertionError(
        f"等待状态 {sorted(targets)} 超时（{timeout}s）；轨迹={seen}；最后响应={last}"
    )


def sse_events(body: str) -> list[str]:
    """从 SSE 响应文本中提取 data 行的 payload。"""
    return [
        line[len("data: ") :]
        for line in body.splitlines()
        if line.startswith("data: ")
    ]
