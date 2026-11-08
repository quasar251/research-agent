"""接口层：任务存储（SQLite 持久化，见 state.md §三）。

update 时把最终状态派生成 report + metrics 落库，重启不丢任务。
db_path 默认 :memory:（测试无文件副作用），生产传文件路径。
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from ..observability.metrics import compute_metrics


class TaskStore:
    """按 run_id 存储任务状态与结果（SQLite）。"""

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                run_id  TEXT PRIMARY KEY,
                status  TEXT NOT NULL,
                intent  TEXT NOT NULL DEFAULT '',
                report  TEXT,
                metrics TEXT
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS idempotency (
                key    TEXT PRIMARY KEY,
                run_id TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    def create(self, run_id: str, intent: str) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO tasks (run_id, status, intent) VALUES (?, 'pending', ?)",
            (run_id, intent),
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # 幂等（api.md §5）：同 Idempotency-Key 重复提交返回同一 run_id
    # ------------------------------------------------------------------

    def get_by_idempotency(self, key: str) -> str | None:
        """按幂等键查已存在的 run_id，无则返回 None。"""
        row = self._conn.execute(
            "SELECT run_id FROM idempotency WHERE key=?", (key,)
        ).fetchone()
        return row[0] if row else None

    def set_idempotency(self, key: str, run_id: str) -> None:
        """登记幂等键 → run_id 映射。"""
        self._conn.execute(
            "INSERT OR REPLACE INTO idempotency (key, run_id) VALUES (?, ?)",
            (key, run_id),
        )
        self._conn.commit()

    def update(self, run_id: str, status: str, result: dict | None = None) -> None:
        """更新任务状态；result 非空时派生 report + metrics 落库。"""
        if result is None:
            self._conn.execute(
                "UPDATE tasks SET status=? WHERE run_id=?", (status, run_id)
            )
        else:
            report = result.get("report")
            report_json = json.dumps(
                report.model_dump(mode="json")
                if hasattr(report, "model_dump")
                else (report or None),
                ensure_ascii=False,
                default=str,
            )
            metrics_json = json.dumps(compute_metrics(result), ensure_ascii=False)
            self._conn.execute(
                "UPDATE tasks SET status=?, report=?, metrics=? WHERE run_id=?",
                (status, report_json, metrics_json, run_id),
            )
        self._conn.commit()

    def get(self, run_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT run_id, status, intent, report, metrics FROM tasks WHERE run_id=?",
            (run_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "run_id": row[0],
            "status": row[1],
            "intent": row[2],
            "report": json.loads(row[3]) if row[3] else None,
            "metrics": json.loads(row[4]) if row[4] else None,
        }
