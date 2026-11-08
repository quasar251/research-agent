"""FastAPI 入口：装配 runtime 并挂载路由。"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
) -> FastAPI:
    """创建 FastAPI 应用，注入 runtime 与任务存储。

    checkpoint_db 提供时接 SQLite 检查点（断点续跑）；task_db 提供时任务结果落 SQLite；
    search 提供时 collector 用真实检索（默认 None 跳过，测试/离线不触发网络）。
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
    app.state.runtime = ResearchRuntime(llm, db_path=checkpoint_db, search=search)
    app.state.task_store = TaskStore(task_db)
    # SSE 挂在 /research/{run_id}/events 下，与 /research/{run_id} 无路径冲突
    app.include_router(sse_router)
    app.include_router(research_router)
    return app
