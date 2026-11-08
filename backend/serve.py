"""启动入口：有 API key 用真实 LLM，无 key 用离线 MockLLM（前端联调不依赖真实模型）。

运行：uv run python backend/serve.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


def main() -> None:
    settings = Settings.from_env()
    if settings.llm.api_key:
        from app.llm.client import from_settings

        llm = from_settings(settings)
        print(f"[serve] 真实 LLM：{settings.llm.model}")
    else:
        from app.llm.mock import OfflineMockLLM

        llm = OfflineMockLLM()
        print("[serve] 无 API key，使用离线 MockLLM（演示数据）")

    app = create_app(llm, checkpoint_db="checkpoints.sqlite", task_db="tasks.sqlite")

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
