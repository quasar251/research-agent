"""状态模块：台账 SQLite 持久化（state.md §三）。

把图状态里的台账实体（研究矩阵格子 / 子任务 / 证据 / 结论 / 人工干预）落到
独立 SQLite 表，供「按 run 查询台账」「缺口重派快速筛选」「会话历史」等诉求使用。
检查点仍由 LangGraph SqliteSaver 管理（checkpoint.py），此处不重复。

与 TaskStore（api/store.py）分工：
- TaskStore 管 run 级运行状态（status / report / metrics / 幂等）。
- LedgerStore 管 run 内的台账明细（matrix_cells / subtasks / evidences / claims / interventions）。

迁移策略：schema_meta 记录版本号，_migrate 做增量迁移，不破坏旧数据（state.md §3.3）。
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1


def _json(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False, default=str)


class LedgerStore:
    """台账明细的 SQLite 存储。"""

    def __init__(self, db_path: str | Path = ":memory:") -> None:
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._migrate()

    # ------------------------------------------------------------------
    # schema 迁移
    # ------------------------------------------------------------------

    def _migrate(self) -> None:
        """按 schema_meta 版本号做增量迁移（当前 v1 全量建表）。"""
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)"
        )
        row = self._conn.execute(
            "SELECT value FROM schema_meta WHERE key='schema_version'"
        ).fetchone()
        current = int(row[0]) if row else 0

        if current < 1:
            self._create_v1()
            self._conn.execute(
                "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', ?)",
                (str(SCHEMA_VERSION),),
            )
            self._conn.commit()

    def _create_v1(self) -> None:
        ddl = [
            # run 级元数据（state.md §3.1 runs）
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id     TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL DEFAULT '',
                intent     TEXT NOT NULL DEFAULT '',
                stage      TEXT NOT NULL DEFAULT '',
                status     TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT ''
            )
            """,
            # 研究矩阵格子（联合主键 (run_id, company, dim)）
            """
            CREATE TABLE IF NOT EXISTS matrix_cells (
                run_id    TEXT NOT NULL,
                company   TEXT NOT NULL,
                dim       TEXT NOT NULL,
                status    TEXT NOT NULL DEFAULT 'gap',
                evidence_refs TEXT NOT NULL DEFAULT '[]',
                claim_refs TEXT NOT NULL DEFAULT '[]',
                summary   TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (run_id, company, dim)
            )
            """,
            # 子任务台账
            """
            CREATE TABLE IF NOT EXISTS subtasks (
                id           TEXT PRIMARY KEY,
                run_id       TEXT NOT NULL,
                question     TEXT NOT NULL DEFAULT '',
                role         TEXT NOT NULL DEFAULT '',
                stage        TEXT NOT NULL DEFAULT '',
                company      TEXT NOT NULL DEFAULT '',
                dim          TEXT NOT NULL DEFAULT '',
                status       TEXT NOT NULL DEFAULT 'pending',
                dependencies TEXT NOT NULL DEFAULT '[]',
                retry_count  INTEGER NOT NULL DEFAULT 0,
                retry_limit  INTEGER NOT NULL DEFAULT 3,
                output_ref   TEXT
            )
            """,
            # 证据台账
            """
            CREATE TABLE IF NOT EXISTS evidences (
                id           TEXT PRIMARY KEY,
                run_id       TEXT NOT NULL,
                url          TEXT NOT NULL DEFAULT '',
                fetched_at   TEXT NOT NULL DEFAULT '',
                credibility  REAL NOT NULL DEFAULT 0.0,
                source_level INTEGER NOT NULL DEFAULT 2
            )
            """,
            # 结论台账
            """
            CREATE TABLE IF NOT EXISTS claims (
                id            TEXT PRIMARY KEY,
                run_id        TEXT NOT NULL,
                text          TEXT NOT NULL DEFAULT '',
                strength      TEXT NOT NULL DEFAULT 'inferred',
                evidence_refs TEXT NOT NULL DEFAULT '[]',
                role          TEXT NOT NULL DEFAULT '',
                status        TEXT NOT NULL DEFAULT 'draft',
                created_at    TEXT NOT NULL DEFAULT ''
            )
            """,
            # 人工干预记录
            """
            CREATE TABLE IF NOT EXISTS interventions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id        TEXT NOT NULL,
                checkpoint_id TEXT NOT NULL DEFAULT '',
                operator      TEXT NOT NULL DEFAULT '',
                decision      TEXT NOT NULL DEFAULT '',
                timestamp     TEXT NOT NULL DEFAULT ''
            )
            """,
        ]
        for stmt in ddl:
            self._conn.execute(stmt)
        # 索引（state.md §3.2）
        for stmt in (
            "CREATE INDEX IF NOT EXISTS idx_subtasks_run ON subtasks(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_subtasks_status ON subtasks(status)",
            "CREATE INDEX IF NOT EXISTS idx_claims_run ON claims(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_evidences_run ON evidences(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)",
            "CREATE INDEX IF NOT EXISTS idx_interventions_run ON interventions(run_id)",
        ):
            self._conn.execute(stmt)

    # ------------------------------------------------------------------
    # 写入
    # ------------------------------------------------------------------

    def save(self, state: dict) -> None:
        """把图状态里的台账实体 upsert 到各表（按 id upsert，子任务级幂等）。"""
        run_id = state.get("run_id", "")
        stage = state.get("stage")
        stage_v = stage.value if hasattr(stage, "value") else str(stage or "")

        self._conn.execute(
            """
            INSERT INTO runs (run_id, user_id, intent, stage, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(run_id) DO UPDATE SET
                user_id=excluded.user_id, intent=excluded.intent, stage=excluded.stage
            """,
            (run_id, state.get("user_id", ""), state.get("intent", ""), stage_v),
        )

        matrix = state.get("matrix")
        if matrix is not None:
            for c in matrix.cells:
                self._conn.execute(
                    """
                    INSERT INTO matrix_cells
                        (run_id, company, dim, status, evidence_refs, claim_refs, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(run_id, company, dim) DO UPDATE SET
                        status=excluded.status, evidence_refs=excluded.evidence_refs,
                        claim_refs=excluded.claim_refs, summary=excluded.summary
                    """,
                    (
                        run_id, c.company, c.dim, c.status.value,
                        _json(c.evidence_refs), _json(c.claim_refs), c.summary,
                    ),
                )

        for t in state.get("subtasks", []):
            self._conn.execute(
                """
                INSERT INTO subtasks
                    (id, run_id, question, role, stage, company, dim, status,
                     dependencies, retry_count, retry_limit, output_ref)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status, retry_count=excluded.retry_count,
                    output_ref=excluded.output_ref
                """,
                (
                    t.id, run_id, t.question, t.role.value, t.stage.value,
                    t.company, t.dim, t.status.value, _json(t.dependencies),
                    t.retry_count, t.retry_limit, t.output_ref,
                ),
            )

        for e in state.get("evidences", []):
            self._conn.execute(
                """
                INSERT OR REPLACE INTO evidences
                    (id, run_id, url, fetched_at, credibility, source_level)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    e.id, run_id, e.url, e.fetched_at.isoformat(),
                    e.credibility, e.source_level,
                ),
            )

        for c in state.get("claims", []):
            self._conn.execute(
                """
                INSERT OR REPLACE INTO claims
                    (id, run_id, text, strength, evidence_refs, role, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    c.id, run_id, c.text, c.strength.value, _json(c.evidence_refs),
                    c.role.value, c.status.value, c.created_at.isoformat(),
                ),
            )

        for i in state.get("interventions", []):
            self._conn.execute(
                """
                INSERT INTO interventions (run_id, checkpoint_id, operator, decision, timestamp)
                VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, i.checkpoint_id, i.operator, i.decision, i.timestamp.isoformat()),
            )
        self._conn.commit()

    # ------------------------------------------------------------------
    # 查询
    # ------------------------------------------------------------------

    def load(self, run_id: str) -> dict | None:
        """按 run_id 重建台账明细（JSON 形态），无记录返回 None。"""
        run = self._conn.execute(
            "SELECT run_id, user_id, intent, stage, status, created_at FROM runs WHERE run_id=?",
            (run_id,),
        ).fetchone()
        if run is None:
            return None
        return {
            "run_id": run[0],
            "user_id": run[1],
            "intent": run[2],
            "stage": run[3],
            "status": run[4],
            "created_at": run[5],
            "subtasks": self._rows(
                "SELECT id, question, role, stage, company, dim, status, dependencies, retry_count, retry_limit, output_ref FROM subtasks WHERE run_id=?",
                (run_id,),
            ),
            "evidences": self._rows(
                "SELECT id, url, fetched_at, credibility, source_level FROM evidences WHERE run_id=?",
                (run_id,),
            ),
            "claims": self._rows(
                "SELECT id, text, strength, evidence_refs, role, status, created_at FROM claims WHERE run_id=?",
                (run_id,),
            ),
            "interventions": self._rows(
                "SELECT checkpoint_id, operator, decision, timestamp FROM interventions WHERE run_id=?",
                (run_id,),
            ),
        }

    def list_runs(self, limit: int = 20, cursor: str | None = None) -> dict:
        """分页列出 run 元数据（会话历史，api.md §5 分页 + api-integration §7）。"""
        rows = self._conn.execute(
            """
            SELECT run_id, user_id, intent, stage, status, created_at
            FROM runs
            WHERE (? = '' OR run_id > ?)
            ORDER BY created_at DESC, run_id DESC
            LIMIT ?
            """,
            (cursor or "", cursor or "", limit + 1),
        ).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [
            {
                "run_id": r[0], "user_id": r[1], "intent": r[2],
                "stage": r[3], "status": r[4], "created_at": r[5],
            }
            for r in rows
        ]
        next_cursor = items[-1]["run_id"] if has_more and items else None
        return {"items": items, "next_cursor": next_cursor}

    # ------------------------------------------------------------------
    # 工具
    # ------------------------------------------------------------------

    def _rows(self, sql: str, params: tuple) -> list[dict]:
        cols = [d[0] for d in self._conn.execute(sql, params).description]
        return [dict(zip(cols, r)) for r in self._conn.execute(sql, params).fetchall()]

    def close(self) -> None:
        self._conn.close()
