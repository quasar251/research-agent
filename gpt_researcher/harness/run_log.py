"""Bounded, append-only JSONL run log.

Adapted from ``research-agent-xhs`` (``run_log.py``). The service layer keeps
research progress only in memory (``WebSocketManager`` queues), so a restart
wipes the trail needed to diagnose a failed run. This appends one JSON object
per line to a project log file — JSONL rather than a JSON array so appending
never requires reading and rewriting the whole file.

Like xhs, logs are isolated **per run**: a run's trail lives in its own file
under ``data/run_logs/`` (see :func:`run_log_path`) so one task can be read back
without sifting through unrelated runs. Set ``RUN_LOG_PATH`` to force a single
shared file instead.

Writes are best-effort: the run log is auxiliary, so an ``OSError`` must never
abort research.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

__all__ = ["RunLog", "run_log_path", "run_log_for"]

#: Default cap on entries read back / retained after compaction.
DEFAULT_MAX_ENTRIES = 300
#: Compaction triggers once the file holds this multiple of ``max_entries``.
_COMPACT_FACTOR = 4

#: Fallback used when no run id is known (benchmarks, ad-hoc callers).
DEFAULT_RUN_LOG_PATH = os.path.join("data", "run_log.jsonl")
#: Directory holding one log file per run.
DEFAULT_RUN_LOG_DIR = os.path.join("data", "run_logs")


def _safe_segment(value: str) -> str:
    """Reduce a run id to a filesystem-safe single path segment."""
    return re.sub(r"[^\w.-]", "_", str(value)).strip("_")[:120] or "run"


def run_log_path(run_id: str | None = None) -> Path:
    """Resolve the log file for a run.

    Precedence: ``RUN_LOG_PATH`` (explicit single-file override) >
    ``RUN_LOG_DIR/<run_id>.jsonl`` (per-run isolation) >
    ``data/run_log.jsonl`` (shared fallback).
    """
    override = os.getenv("RUN_LOG_PATH")
    if override:
        return Path(override)
    if run_id:
        directory = os.getenv("RUN_LOG_DIR", DEFAULT_RUN_LOG_DIR)
        return Path(directory) / f"{_safe_segment(run_id)}.jsonl"
    return Path(DEFAULT_RUN_LOG_PATH)


def run_log_for(
    run_id: str | None = None,
    *,
    max_entries: int = DEFAULT_MAX_ENTRIES,
    enabled: bool = True,
) -> RunLog:
    """Build the :class:`RunLog` for ``run_id`` (see :func:`run_log_path`)."""
    return RunLog(run_log_path(run_id), max_entries=max_entries, enabled=enabled)


class RunLog:
    """Append-only run log for a single research run.

    Args:
        path: Target ``*.jsonl`` file.
        max_entries: Retained entries after compaction.
        enabled: When ``False`` all operations become no-ops (useful for tests
            and for callers that don't want on-disk logs).
    """

    def __init__(
        self,
        path: str | os.PathLike[str],
        max_entries: int = DEFAULT_MAX_ENTRIES,
        enabled: bool = True,
    ):
        self.path = Path(path)
        self.max_entries = max_entries
        self.enabled = enabled
        # Running line count, lazily seeded from the file on first append so the
        # compaction check is O(1) instead of re-reading the whole file every
        # write.
        self._lines: int | None = None

    def _seed_line_count(self) -> None:
        if self._lines is not None:
            return
        self._lines = 0
        if not self.path.is_file():
            return
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                self._lines = sum(1 for _ in handle)
        except OSError:
            self._lines = 0

    def append(self, message: str, **fields: Any) -> dict[str, Any]:
        """Append one entry and return it. Never raises on I/O failure.

        Extra keyword ``fields`` are merged into the entry, so callers can attach
        structured context (stage, status, duration) alongside the message.
        """
        now = datetime.now()
        entry: dict[str, Any] = {
            "ts": now.isoformat(),
            "time": now.strftime("%H:%M:%S"),
            "message": message,
        }
        entry.update(fields)
        if not self.enabled:
            return entry
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._seed_line_count()
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
            self._lines = (self._lines or 0) + 1
            self._compact_if_needed()
        except OSError as exc:
            logger.debug("Run log write failed (%s); continuing", exc)
        return entry

    def read(self, limit: int | None = None) -> list[dict[str, Any]]:
        """Read back the most recent ``limit`` entries (default ``max_entries``).

        Missing or corrupt files yield the entries that could be parsed.
        """
        limit = self.max_entries if limit is None else limit
        if not self.path.is_file():
            return []
        entries: list[dict[str, Any]] = []
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        value = json.loads(line)
                    except json.JSONDecodeError:
                        continue  # skip a truncated tail line
                    if isinstance(value, dict) and "message" in value:
                        entries.append(value)
        except OSError:
            return entries[-limit:]
        return entries[-limit:]

    def _compact_if_needed(self) -> None:
        """Trim to the newest ``max_entries`` once the file grows past the cap.

        Driven by the in-memory line counter, so the common path is a single
        integer comparison. The file is only read when a compaction is actually
        due — i.e. once every ``max_entries * (``_COMPACT_FACTOR`` - 1)``
        appends — which keeps ``append`` amortized O(1).
        """
        threshold = self.max_entries * _COMPACT_FACTOR
        if (self._lines or 0) <= threshold:
            return
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                lines = handle.readlines()
            if len(lines) <= threshold:
                return
            temp = self.path.with_suffix(self.path.suffix + ".tmp")
            temp.write_text("".join(lines[-self.max_entries :]), encoding="utf-8")
            temp.replace(self.path)
            self._lines = self.max_entries
        except OSError as exc:
            logger.debug("Run log compaction failed (%s); continuing", exc)