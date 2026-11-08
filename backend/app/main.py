"""FastAPI 入口：装配 runtime 并挂载路由。"""
from __future__ import annotations

from fastapi import FastAPI

from .api.routes import router as research_router
from .api.sse import router as sse_router
from .api.store import TaskStore
from .runtime import ResearchRuntime


def create_app(llm) -> FastAPI:
    """创建 FastAPI 应用，注入 runtime 与任务存储。"""
    app = FastAPI(title="研小报 · deep research")
    app.state.runtime = ResearchRuntime(llm)
    app.state.task_store = TaskStore()
    # SSE 精确路径须先于 /research/{run_id} 注册，避免 stream 被当成 run_id
    app.include_router(sse_router)
    app.include_router(research_router)
    return app
