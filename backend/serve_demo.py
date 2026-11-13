"""启动演示版后端：旧版 DAG 前端 + Python 后端模拟数据。

运行：uv run python backend/serve_demo.py

所有业务数据（报告 / 五阶段流程 / 追问 / 审批）来自 /demo/* 端点，
由 OfflineMockLLM 兜底 /research 系列端点，全程无真实模型调用、无网络依赖。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.llm.mock import OfflineMockLLM  # noqa: E402
from app.main import create_app  # noqa: E402

if __name__ == "__main__":
    import uvicorn

    app = create_app(OfflineMockLLM())
    print("演示后端: http://127.0.0.1:8000  (数据由 Python /demo/* 模拟)")
    uvicorn.run(app, host="127.0.0.1", port=8000)
