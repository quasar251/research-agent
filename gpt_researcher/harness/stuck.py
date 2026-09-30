"""Repeated-tool-failure detection (the "stuck loop" guard).

Adapted from ``research-agent-xhs`` (``agent_loop`` aborts when the same
``(tool, args, error)`` triple repeats, raising ``AgentLoopStuckError``).

gpt-researcher has no single multi-turn tool loop to hang this off: tool calls
are executed in two independent places (`utils/tools.py` and `mcp/research.py`),
each a single "LLM → run tools → LLM" round. Across a long run, however, a
broken tool (expired key, unreachable MCP server) gets invoked over and over
with equivalent arguments and the same error, burning tokens and wall-clock
until the outer timeout. A run-scoped detector catches exactly that.

The detector is installed for the duration of a run via
:func:`guard_against_stuck`; call sites report failures with
:func:`note_tool_failure` and abort by raising :class:`ToolStuckError` once it
returns ``True``. Outside a guard the call is a no-op, so standalone tool
invocations are unaffected.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator

from .errors import LLMError

logger = logging.getLogger(__name__)

__all__ = [
    "ToolStuckError",
    "StuckDetector",
    "guard_against_stuck",
    "current_detector",
    "note_tool_failure",
]

#: Same triple seen this many times ⇒ the loop is stuck.
DEFAULT_STUCK_THRESHOLD = 3
#: Error strings are truncated before comparison so incidental detail
#: (request ids, timings) doesn't mask a genuinely repeated failure.
_ERROR_KEY_LEN = 200


class ToolStuckError(LLMError):
    """A tool kept failing identically; abort instead of looping.

    Terminal by nature — retrying reproduces the same failure — so it inherits
    ``LLMError``'s non-retryable semantics.
    """


def _error_key(error: Any) -> str:
    return " ".join(str(error).split())[:_ERROR_KEY_LEN].lower()


def _args_key(args: Any) -> str:
    try:
        return json.dumps(args, sort_keys=True, default=str, ensure_ascii=False)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return repr(args)


class StuckDetector:
    """Counts repeated ``(tool, args, error)`` triples within one run."""

    def __init__(self, threshold: int = DEFAULT_STUCK_THRESHOLD) -> None:
        self.threshold = max(1, int(threshold))
        self._counts: Counter[tuple[str, str, str]] = Counter()

    def record(self, tool: str, args: Any, error: Any) -> int:
        """Count one failure and return how many times it has now been seen."""
        key = (str(tool), _args_key(args), _error_key(error))
        self._counts[key] += 1
        return self._counts[key]

    def is_stuck(self, tool: str, args: Any, error: Any) -> bool:
        """Record a failure and report whether the threshold is now reached."""
        return self.record(tool, args, error) >= self.threshold

    def reset(self) -> None:
        self._counts.clear()


_current_detector: ContextVar[StuckDetector | None] = ContextVar(
    "gpt_researcher_stuck_detector", default=None
)


def current_detector() -> StuckDetector | None:
    """The detector installed for the current run, if any."""
    return _current_detector.get()


@contextmanager
def guard_against_stuck(detector: StuckDetector | None = None) -> Iterator[StuckDetector]:
    """Install a detector for the duration of the block.

    Child tasks (``asyncio.gather``/``create_task``) inherit the detector, since
    they copy the current context on creation — so failures reported from
    parallel sub-queries still count toward the same run.
    """
    detector = detector or StuckDetector()
    token = _current_detector.set(detector)
    try:
        yield detector
    finally:
        _current_detector.reset(token)


def note_tool_failure(tool: str, args: Any, error: Any) -> bool:
    """Report a tool failure; ``True`` when the current run is stuck.

    No-op (returns ``False``) outside a :func:`guard_against_stuck` block.
    """
    detector = _current_detector.get()
    if detector is None:
        return False
    return detector.is_stuck(tool, args, error)