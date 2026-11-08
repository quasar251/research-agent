"""接口层：任务创建（异步）与查询（api.md）。"""
from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..observability.metrics import compute_metrics
from .store import TaskStore

router = APIRouter()


class ResearchRequest(BaseModel):
    intent: str


def _task_store(request: Request) -> TaskStore:
    return request.app.state.task_store


async def _run_task(runtime, store: TaskStore, run_id: str, intent: str) -> None:
    """后台执行调研，更新任务状态。同步 runtime.run 放入线程池避免阻塞事件循环。"""
    store.update(run_id, "running")
    try:
        result = await asyncio.to_thread(runtime.run, run_id, "demo", intent)
        store.update(run_id, "completed", result)
    except Exception:  # noqa: BLE001 - 失败态
        store.update(run_id, "failed")


@router.post("/research")
async def create_research(req: ResearchRequest, request: Request):
    """创建调研任务（异步）：立即返回 run_id，后台执行。"""
    run_id = uuid.uuid4().hex[:8]
    store = _task_store(request)
    store.create(run_id, req.intent)
    asyncio.create_task(_run_task(request.app.state.runtime, store, run_id, req.intent))
    return {"run_id": run_id, "status": "pending"}


@router.get("/research/{run_id}")
async def get_research(run_id: str, request: Request):
    """查询任务状态与结果。"""
    task = _task_store(request).get(run_id)
    if task is None:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    if task["status"] != "completed":
        return {"run_id": run_id, "status": task["status"]}
    result = task["result"]
    return {
        "run_id": run_id,
        "status": "completed",
        "report": result.get("report"),
        "metrics": compute_metrics(result),
    }
