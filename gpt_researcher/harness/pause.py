"""Persistent pause markers for quota-exhausted runs.

Adapted from ``research-agent-xhs`` (``orchestrator._safe_run`` sets
``state.notes["paused"]`` and saves before raising ``PipelinePausedError``).

gpt-researcher has no resumable state machine — ``researcher.run()`` mutates
accumulated context, so replaying a half-finished run would duplicate research
and double cost. A true "resume from step N" is therefore not implementable
here. What *is* implementable, and what this module provides, is an unambiguous
**paused** state: instead of dying as a generic error, a quota-exhausted run
writes a marker recording the stage and reason, so the service can tell the
operator "quota exhausted, top up and re-run" rather than "something failed".

Starting a run clears its marker; a quota failure during that run re-creates it.
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

__all__ = ["mark_paused", "clear_paused", "get_pause", "list_paused", "pause_dir"]

DEFAULT_PAUSE_DIR = os.path.join("data", "paused")


def _safe_segment(value: str) -> str:
    return re.sub(r"[^\w.-]", "_", str(value)).strip("_")[:120] or "run"


def pause_dir() -> Path:
    """Directory holding one marker per paused run (``PAUSE_DIR`` overridable)."""
    return Path(os.getenv("PAUSE_DIR", DEFAULT_PAUSE_DIR))


def _marker_path(run_id: str, path: str | os.PathLike[str] | None = None) -> Path:
    base = Path(path) if path is not None else pause_dir()
    return base / f"{_safe_segment(run_id)}.json"


def mark_paused(
    run_id: str | None,
    stage: str,
    reason: str,
    *,
    path: str | os.PathLike[str] | None = None,
) -> dict[str, Any] | None:
    """Record that ``run_id`` paused on quota exhaustion. Best-effort."""
    if not run_id:
        return None
    marker: dict[str, Any] = {
        "run_id": run_id,
        "stage": stage,
        "reason": reason,
        "paused_at": datetime.now().isoformat(),
        "resume_hint": (
            "额度已恢复后重新发起同一条查询即可（本管线无断点续跑，"
            "重跑会重新执行整个研究流程）"
        ),
    }
    target = _marker_path(run_id, path)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(marker, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.debug("Pause marker write failed (%s); continuing", exc)
        return None
    return marker


def clear_paused(
    run_id: str | None,
    *,
    path: str | os.PathLike[str] | None = None,
) -> bool:
    """Drop a run's pause marker (e.g. when it is retried). Returns True if removed."""
    if not run_id:
        return False
    try:
        _marker_path(run_id, path).unlink()
        return True
    except OSError:
        return False


def get_pause(
    run_id: str | None,
    *,
    path: str | os.PathLike[str] | None = None,
) -> dict[str, Any] | None:
    """Read a run's pause marker, or ``None`` when it is not paused."""
    if not run_id:
        return None
    target = _marker_path(run_id, path)
    if not target.is_file():
        return None
    try:
        value = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def list_paused(*, path: str | os.PathLike[str] | None = None) -> list[dict[str, Any]]:
    """All current pause markers (newest last)."""
    base = Path(path) if path is not None else pause_dir()
    if not base.is_dir():
        return []
    markers: list[dict[str, Any]] = []
    for entry in sorted(base.glob("*.json")):
        marker = get_pause(entry.stem, path=base)
        if marker is not None:
            markers.append(marker)
    markers.sort(key=lambda item: item.get("paused_at", ""))
    return markers