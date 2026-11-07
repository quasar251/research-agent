"""状态模块：SQLite 检查点（LangGraph SqliteSaver）。

检查点持久化交给 LangGraph，支持从断点确定性续跑（agent-core.md §4.4）。
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver


def create_checkpointer(db_path: str | Path) -> SqliteSaver:
    """创建基于 SQLite 的检查点存储。

    `check_same_thread=False` 允许 FastAPI 异步线程复用同一连接。
    """
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    return SqliteSaver(conn)
