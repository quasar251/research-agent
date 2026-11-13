"""FastAPI 入口：装配 runtime 并挂载路由。"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.demo import router as demo_router
from .api.routes import router as research_router
from .api.sse import router as sse_router
from .api.store import TaskStore
from .runtime import ResearchRuntime
from .tools.search import SearchProvider


def create_app(
    llm,
    checkpoint_db: str | None = None,
    task_db: str = ":memory:",
    search: SearchProvider | None = None,
    task_timeout_s: float = 1800.0,
    core_memory: str = "",
) -> FastAPI:
    """创建 FastAPI 应用，注入 runtime 与任务存储。

    checkpoint_db 提供时接 SQLite 检查点（断点续跑）；task_db 提供时任务结果落 SQLite；
    search 提供时 collector 用真实检索（默认 None 跳过，测试/离线不触发网络）。
    task_timeout_s / core_memory 透传给 runtime（reliability.md §5 / memory.md §1）。
    """
    app = FastAPI(title="研小报 · deep research", version="0.1.0")
    # 允许前端 Vite 开发服务器跨域访问
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.runtime = ResearchRuntime(
        llm,
        db_path=checkpoint_db,
        search=search,
        task_timeout_s=task_timeout_s,
        core_memory=core_memory,
    )
    app.state.task_store = TaskStore(task_db)

    # 响应统一带版本头（api.md §5 版本）
    @app.middleware("http")
    async def add_api_version(request, call_next):
        response = await call_next(request)
        response.headers["X-Api-Version"] = "v1"
        return response

    # SSE 挂在 /research/{run_id}/events 下，与 /research/{run_id} 无路径冲突
    # 主 API 挂 /v1 前缀（api.md §5 版本），同时保留无前缀路由兼容旧前端/测试
    app.include_router(sse_router)
    app.include_router(research_router)
    app.include_router(sse_router, prefix="/v1")
    app.include_router(research_router, prefix="/v1")
    # 演示数据 API：旧版 DAG 前端的全部模拟数据由 Python 后端提供
    app.include_router(demo_router)
    return app
