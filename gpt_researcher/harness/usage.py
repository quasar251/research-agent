"""Append-only JSONL token-usage ledger.

Adapted from ``research-agent-xhs`` (``token_usage.record_stage_usage``). In xhs
every stage's token usage was folded back into the project's ``state`` so a
cost heat-map could be rendered per stage. gpt-researcher collects usage during
a stage (:func:`gpt_researcher.harness.stage.collect_stage`) but drops it when
the stage returns — the numbers only ever reach the live WebSocket stream, so a
finished run leaves no cost trail.

This module persists one record per completed stage, tagged with ``run_id`` so
records can be read back for a single run or aggregated across runs. Writes are
best-effort: usage accounting is auxiliary and must never abort research.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

logger = logging.getLogger(__name__)

__all__ = ["usage_log_path", "record_usage", "read_usage", "sum_usage"]

DEFAULT_USAGE_PATH = os.path.join("data", "usage.jsonl")

_SUMMED_KEYS = ("prompt_tokens", "completion_tokens", "total_tokens", "calls")


def usage_log_path() -> Path:
    """Path of the usage ledger (``USAGE_LOG_PATH`` overridable)."""
    return Path(os.getenv("USAGE_LOG_PATH", DEFAULT_USAGE_PATH))


def record_usage(
    run_id: str | None,
    stage: str,
    usage: dict[str, Any] | None,
    *,
    path: str | os.PathLike[str] | None = None,
) -> dict[str, Any] | None:
    """Persist one stage's usage. Returns the entry, or ``None`` if skipped."""
    if not usage:
        return None
    entry: dict[str, Any] = {
        "ts": datetime.now().isoformat(),
        "run_id": run_id,
        "stage": stage,
    }
    entry.update(usage)
    target = Path(path) if path is not None else usage_log_path()
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as exc:
        logger.debug("Usage write failed (%s); continuing", exc)
        return None
    return entry


def read_usage(
    run_id: str | None = None,
    stage: str | None = None,
    limit: int | None = None,
    *,
    path: str | os.PathLike[str] | None = None,
) -> list[dict[str, Any]]:
    """Read usage records, newest last, optionally filtered by run/stage.

    Missing or corrupt files yield whatever could be parsed.
    """
    target = Path(path) if path is not None else usage_log_path()
    if not target.is_file():
        return []
    records: list[dict[str, Any]] = []
    try:
        with target.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue  # skip a truncated tail line
                if not isinstance(value, dict) or "stage" not in value:
                    continue
                if run_id is not None and value.get("run_id") != run_id:
                    continue
                if stage is not None and value.get("stage") != stage:
                    continue
                records.append(value)
    except OSError:
        return []
    return records[-limit:] if limit is not None else records


def sum_usage(records: Iterable[dict[str, Any]]) -> dict[str, int]:
    """Total the token counters across ``records``."""
    totals = {key: 0 for key in _SUMMED_KEYS}
    for record in records:
        for key in _SUMMED_KEYS:
            value = record.get(key)
            if isinstance(value, (int, float)):
                totals[key] += int(value)
    return totals