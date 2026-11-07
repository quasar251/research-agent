"""FastAPI 入口：装配 runtime 并挂载路由。"""
from __future__ import annotations

from fastapi import FastAPI

from .api.routes import router as research_router
from .api.sse import router as sse_router
from .runtime import ResearchRuntime


def create_app(llm) -> FastAPI:
    """创建 FastAPI 应用，注入 runtime。"""
    app = FastAPI(title="研衡 · 行业调研助手")
    app.state.runtime = ResearchRuntime(llm)
    # SSE 精确路径须先于 /research/{run_id} 注册，避免 stream 被当成 run_id
    app.include_router(sse_router)
    app.include_router(research_router)
    return app
