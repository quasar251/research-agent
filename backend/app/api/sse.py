"""接口层：SSE 流式推送调研进度（api.md §3.3）。

路径挂在 run_id 下（/research/{run_id}/events），避免与 /research/{run_id} 的路径冲突；
run_id 同时作为 LangGraph thread_id，配了 checkpointer 时可断点续跑。
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..state.graph import initial_state

router = APIRouter()


@router.get("/research/{run_id}/events")
async def stream_research(run_id: str, intent: str, request: Request):
    """SSE 流式推送：每个节点执行后推送一次进度事件，结束推 [DONE]。"""
    runtime = request.app.state.runtime

    async def event_stream():
        state = initial_state(run_id, "demo", intent)
        config = {"configurable": {"thread_id": run_id}}
        async for event in runtime.graph.astream(state, config):
            node = next(iter(event))
            yield f"data: {json.dumps({'node': node}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
