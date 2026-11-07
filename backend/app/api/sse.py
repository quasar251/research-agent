"""接口层：SSE 流式推送调研进度。"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..state.graph import initial_state

router = APIRouter()


@router.get("/research/stream")
async def stream_research(intent: str, request: Request):
    """SSE 流式推送：每个节点执行后推送一次进度事件。"""
    runtime = request.app.state.runtime

    async def event_stream():
        state = initial_state(f"r-{uuid.uuid4().hex[:8]}", "demo", intent)
        config = {"configurable": {"thread_id": uuid.uuid4().hex[:8]}}
        async for event in runtime.graph.astream(state, config):
            node = next(iter(event))
            yield f"data: {json.dumps({'node': node}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
