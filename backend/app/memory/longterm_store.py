"""记忆模块：长期记忆 SQLite 持久化（memory.md §6）。

检索式存储：结构化库（SQLite）+ 可选向量检索（runtime 的 MemoryIndex）。
- 索引 (namespace, scope)
- 冲突标记而非覆盖（写时处理）
- 淘汰：低频 + 过期归档，淘汰不影响已有关联结论溯源
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .store import LongTermMemory


class LongTermMemoryStore:
    """长期记忆的结构化 SQLite 存储。"""

    def __init__(self, db_path: str | Path = ":memory:") -> None:
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS longterm_memories (
                id           TEXT PRIMARY KEY,
                namespace    TEXT NOT NULL,
                content      TEXT NOT NULL,
                source_ref   TEXT,
                conflict     INTEGER NOT NULL DEFAULT 0,
                scope        TEXT NOT NULL DEFAULT 'user',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL,
                access_count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        # 索引 (namespace, scope)（memory.md §6.2）
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ltm_ns_scope "
            "ON longterm_memories(namespace, scope)"
        )
        self._conn.commit()

    def upsert_all(self, memories: list[LongTermMemory]) -> None:
        """写时合并：同 id 覆盖；内容变化时标 conflict（memory.md §3 冲突标记）。"""
        now = datetime.now(timezone.utc).isoformat()
        for m in memories:
            old = self._conn.execute(
                "SELECT content FROM longterm_memories WHERE id=?", (m.id,)
            ).fetchone()
            conflict = m.conflict or (old is not None and old[0] != m.content)
            self._conn.execute(
                """
                INSERT INTO longterm_memories
                    (id, namespace, content, source_ref, conflict, scope, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    namespace=excluded.namespace, content=excluded.content,
                    source_ref=excluded.source_ref, conflict=excluded.conflict,
                    scope=excluded.scope, updated_at=excluded.updated_at
                """,
                (m.id, m.namespace, m.content, m.source_ref, int(conflict), m.scope, now, now),
            )
        self._conn.commit()

    def load(self) -> list[LongTermMemory]:
        """加载全部长期记忆（跨会话复用）。"""
        rows = self._conn.execute(
            "SELECT id, namespace, content, source_ref, conflict, scope "
            "FROM longterm_memories ORDER BY updated_at DESC"
        ).fetchall()
        return [
            LongTermMemory(
                id=r[0], namespace=r[1], content=r[2],
                source_ref=r[3], conflict=bool(r[4]), scope=r[5],
            )
            for r in rows
        ]

    def search(
        self, query: str, namespace: str | None = None, limit: int = 5
    ) -> list[LongTermMemory]:
        """结构化检索：先按命名空间过滤，再按内容相似（LIKE）排序（memory.md §6.1）。"""
        like = f"%{query}%"
        if namespace:
            rows = self._conn.execute(
                """
                SELECT id, namespace, content, source_ref, conflict, scope
                FROM longterm_memories
                WHERE namespace=? AND content LIKE ?
                ORDER BY updated_at DESC LIMIT ?
                """,
                (namespace, like, limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                """
                SELECT id, namespace, content, source_ref, conflict, scope
                FROM longterm_memories
                WHERE content LIKE ?
                ORDER BY updated_at DESC LIMIT ?
                """,
                (like, limit),
            ).fetchall()
        for r in rows:
            self._conn.execute(
                "UPDATE longterm_memories SET access_count=access_count+1 WHERE id=?", (r[0],)
            )
        self._conn.commit()
        return [
            LongTermMemory(
                id=r[0], namespace=r[1], content=r[2],
                source_ref=r[3], conflict=bool(r[4]), scope=r[5],
            )
            for r in rows
        ]

    def evict(self, max_age_days: int = 90, min_access: int = 1) -> int:
        """淘汰：过期且低频的记忆归档删除（memory.md §6.3，不影响溯源）。"""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()
        cur = self._conn.execute(
            """
            DELETE FROM longterm_memories
            WHERE updated_at < ? AND access_count < ?
            """,
            (cutoff, min_access),
        )
        self._conn.commit()
        return cur.rowcount

    def close(self) -> None:
        self._conn.close()
