"""接口层：SSE 流式推送调研进度（api.md §3.3）。

即开即跑：用 runtime.run + on_node 回调把阶段推进事件实时推给前端，
跑完后结果落 TaskStore，前端再 GET /research/{run_id} 取报告。
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/research/{run_id}/events")
async def stream_research(run_id: str, intent: str, request: Request, depth: str = "simple"):
    """SSE 流式推送：每个阶段推进推送一次 node 事件，结束推 [DONE]。"""
    runtime = request.app.state.runtime
    store = request.app.state.task_store

    async def event_stream():
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()

        def on_node(node: str) -> None:
            # 回调在线程池线程，用 call_soon_threadsafe 转回事件循环
            loop.call_soon_threadsafe(q.put_nowait, {"node": node})

        store.create(run_id, intent)
        store.update(run_id, "running")

        def run_sync() -> None:
            try:
                result = runtime.run(run_id, "demo", intent, depth, None, on_node)
            except Exception:  # noqa: BLE001 - 失败态
                result = {"__error__": True}
            loop.call_soon_threadsafe(q.put_nowait, {"__done__": result})

        asyncio.create_task(asyncio.to_thread(run_sync))

        while True:
            item = await q.get()
            if "__done__" in item:
                result = item["__done__"]
                if result.get("__error__"):
                    store.update(run_id, "failed")
                elif result.get("__interrupt__"):
                    store.update(run_id, "waiting_approval")
                else:
                    store.update(run_id, "completed", result)
                yield "data: [DONE]\n\n"
                return
            yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
