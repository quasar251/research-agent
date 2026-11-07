"""接口层：任务创建与查询。"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..state.graph import initial_state
from ..observability.metrics import compute_metrics

router = APIRouter()


class ResearchRequest(BaseModel):
    intent: str


@router.post("/research")
async def create_research(req: ResearchRequest, request: Request):
    """创建并同步执行一次调研，返回最终结果摘要。"""
    runtime = request.app.state.runtime
    run_id = uuid.uuid4().hex[:8]
    result = runtime.run(run_id=run_id, user_id="demo", intent=req.intent)
    return {
        "run_id": run_id,
        "report": result.get("report", ""),
        "metrics": compute_metrics(result),
    }


@router.get("/research/{run_id}")
async def get_research(run_id: str):
    """查询调研结果（简版：仅返回 run_id 占位）。"""
    return {"run_id": run_id, "note": "完整结果查询依赖检查点存储，后续实现"}
