"""接口层：任务创建（异步）与查询（api.md）。"""
from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from .store import TaskStore

router = APIRouter()


class ResearchRequest(BaseModel):
    intent: str
    depth: str = "simple"  # simple / deep（deep 为深度调研，含 HITL 审批）


class ActionRequest(BaseModel):
    action: str  # confirm / retry
    feedback: str = ""  # 可选：retry 时的补充说明


def _task_store(request: Request) -> TaskStore:
    return request.app.state.task_store


async def _run_task(runtime, store: TaskStore, run_id: str, intent: str, depth: str) -> None:
    """后台执行调研，更新任务状态。同步 runtime.run 放入线程池避免阻塞事件循环。

    deep 模式在 HITL 审批点暂停时标记 waiting_approval。
    """
    store.update(run_id, "running")
    try:
        result = await asyncio.to_thread(runtime.run, run_id, "demo", intent, depth)
        if result.get("__interrupt__"):
            store.update(run_id, "waiting_approval")
        else:
            store.update(run_id, "completed", result)
    except Exception:  # noqa: BLE001 - 失败态
        store.update(run_id, "failed")


@router.post("/research")
async def create_research(
    req: ResearchRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    """创建调研任务（异步）：立即返回 run_id，后台执行。

    - intent 为空 → 400 INVALID_PARAM（api.md §4）
    - 携带 Idempotency-Key 时幂等：同 key 重复提交返回同一 run_id（api.md §5）
    """
    intent = (req.intent or "").strip()
    if not intent:
        raise HTTPException(status_code=400, detail="INVALID_PARAM")
    store = _task_store(request)

    # 幂等：已有同 key 的任务则直接返回，不重复创建
    if idempotency_key:
        existing = store.get_by_idempotency(idempotency_key)
        if existing:
            task = store.get(existing)
            return {"run_id": existing, "status": task["status"] if task else "pending"}

    run_id = uuid.uuid4().hex[:8]
    store.create(run_id, intent)
    if idempotency_key:
        store.set_idempotency(idempotency_key, run_id)
    asyncio.create_task(_run_task(request.app.state.runtime, store, run_id, intent, req.depth))
    return {"run_id": run_id, "status": "pending"}


@router.get("/research/{run_id}")
async def get_research(run_id: str, request: Request):
    """查询任务状态与结果。waiting_approval 时额外返回 approval_hint（api.md §3.2）。"""
    task = _task_store(request).get(run_id)
    if task is None:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    if task["status"] != "completed":
        resp = {"run_id": run_id, "status": task["status"]}
        if task["status"] == "waiting_approval":
            resp["approval_hint"] = "align"
        return resp
    return {
        "run_id": run_id,
        "status": "completed",
        "report": task["report"],
        "metrics": task["metrics"],
    }


@router.post("/research/{run_id}/action")
async def research_action(run_id: str, req: ActionRequest, request: Request):
    """HITL 审批：confirm 继续，retry 打回重新规划（api.md §3.4）。

    对非 waiting_approval 任务发 action → 409 WRONG_STATE（api.md §4）。
    """
    store = _task_store(request)
    task = store.get(run_id)
    if task is None:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    if task["status"] != "waiting_approval":
        raise HTTPException(status_code=409, detail="WRONG_STATE")

    decision = req.action
    if decision not in {"confirm", "retry"}:
        raise HTTPException(status_code=400, detail="INVALID_PARAM")

    result = await asyncio.to_thread(request.app.state.runtime.resume, run_id, decision)
    if result.get("__interrupt__"):
        store.update(run_id, "waiting_approval")
    else:
        store.update(run_id, "completed", result)
    return {"run_id": run_id, "status": store.get(run_id)["status"]}
