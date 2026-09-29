"""Stage wrapper + per-stage usage collection.

Two ideas lifted from ``research-agent-xhs``:

1. **``_safe_run``** — every agent stage runs through one wrapper that retries
   transient failures, persists progress on failure, and distinguishes fatal
   errors from harness/stuck errors.
2. **``collect_stage``** — a contextvar-scoped collector that accumulates token
   usage per stage without threading a counter through every call site.

This module ports both, plus an *availability-first* twist: when a stage is
marked as non-critical, exhausting retries yields a **degraded** result instead
of an exception, so auxiliary work (charts, PDF export, ledger files) can fail
without sinking the whole run.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Iterator, TypeVar

from .errors import QuotaExhaustedError
from .retry import RetryPolicy, async_retry
from .run_log import RunLog

logger = logging.getLogger(__name__)

T = TypeVar("T")

__all__ = [
    "StageResult",
    "UsageCollector",
    "collect_stage",
    "report_usage",
    "run_stage",
]

#: Terminal status of a stage.
STATUS_OK = "ok"
STATUS_DEGRADED = "degraded"
STATUS_PAUSED = "paused"
STATUS_FAILED = "failed"


@dataclass
class StageResult:
    """Outcome of :func:`run_stage`.

    ``value`` is the stage's return value on success, or the ``default`` supplied
    by the caller when the stage degraded. ``degraded`` is the single flag the
    delivery layer needs to decide whether to ship a reduced report.
    """

    name: str
    status: str
    value: Any = None
    error: str | None = None
    attempts: int = 0
    duration: float = 0.0
    usage: dict[str, int] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status == STATUS_OK

    @property
    def degraded(self) -> bool:
        return self.status == STATUS_DEGRADED

    @property
    def paused(self) -> bool:
        return self.status == STATUS_PAUSED


# ═══════════════════════════════════════════════════════════════
# Token usage collection
# ═══════════════════════════════════════════════════════════════

_PROMPT_KEYS = ("prompt_tokens", "input_tokens")
_COMPLETION_KEYS = ("completion_tokens", "output_tokens")
_TOTAL_KEYS = ("total_tokens",)


def _pick(usage: dict[str, Any], keys: tuple[str, ...]) -> int:
    for key in keys:
        value = usage.get(key)
        if isinstance(value, (int, float)) and value >= 0:
            return int(value)
    return 0


class UsageCollector:
    """Accumulates token usage reported during the current stage."""

    def __init__(self) -> None:
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.calls = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def add_raw(self, usage: dict[str, Any] | None) -> None:
        """Fold one API ``usage`` dict in, tolerating provider naming differences."""
        if not usage:
            return
        prompt = _pick(usage, _PROMPT_KEYS)
        completion = _pick(usage, _COMPLETION_KEYS)
        if not prompt and not completion:
            completion = _pick(usage, _TOTAL_KEYS)
        self.prompt_tokens += prompt
        self.completion_tokens += completion
        self.calls += 1

    def as_dict(self) -> dict[str, int]:
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "calls": self.calls,
        }


_current_collector: ContextVar[UsageCollector | None] = ContextVar(
    "gpt_researcher_usage_collector", default=None
)


def report_usage(usage: dict[str, Any] | None) -> None:
    """Report one LLM call's usage to the active stage collector.

    No-op outside a :func:`collect_stage` block, so direct unit-test calls to the
    LLM provider don't need a harness set up.
    """
    collector = _current_collector.get()
    if collector is not None:
        collector.add_raw(usage)


@contextmanager
def collect_stage() -> Iterator[UsageCollector]:
    """Collect token usage for the duration of the block.

    Nested blocks each get their own collector, so an inner scope is never
    double-counted into the outer one.
    """
    collector = UsageCollector()
    token = _current_collector.set(collector)
    try:
        yield collector
    finally:
        _current_collector.reset(token)


# ═══════════════════════════════════════════════════════════════
# Stage execution wrapper
# ═══════════════════════════════════════════════════════════════


async def run_stage(
    name: str,
    fn: Callable[[], Awaitable[T]],
    *,
    policy: RetryPolicy | None = None,
    run_log: RunLog | None = None,
    critical: bool = True,
    default: T | None = None,
    sleep: Callable[[float], Awaitable[None]] | None = None,
) -> StageResult:
    """Run one stage with retry, timing, logging and optional degradation.

    Args:
        name: Stage label used in the run log.
        fn: Zero-arg coroutine factory (re-invoked on each attempt).
        policy: Retry tuning; defaults to :class:`RetryPolicy`.
        run_log: Optional :class:`RunLog` to record stage transitions.
        critical: When ``True`` (default) a terminal failure re-raises. When
            ``False`` the failure degrades to a ``StageResult`` flagged
            ``degraded`` — availability-first: auxiliary work must not sink the
            run.
        default: Value returned in ``StageResult.value`` when a non-critical
            stage degrades.
        sleep: Injectable sleep for tests.

    Returns:
        A :class:`StageResult`. Raises only for a critical stage's terminal
        failure, or when a quota-exhausted error occurs (caller should pause).
    """
    started = time.perf_counter()
    attempts = 0

    def _on_retry(attempt: int, exc: BaseException, delay: float) -> None:
        if run_log is not None:
            run_log.append(
                f"stage retry: {name}",
                stage=name,
                status="retry",
                attempt=attempt,
                delay=round(delay, 2),
                error=str(exc),
            )
        else:
            logger.warning("Stage %s attempt %d failed (%s)", name, attempt, exc)

    usage_dict: dict[str, int] = {}
    try:
        with collect_stage() as collector:
            async def _attempt() -> T:
                nonlocal attempts
                attempts += 1
                return await fn()

            value = await async_retry(
                _attempt, policy=policy, on_retry=_on_retry, sleep=sleep
            )
            usage_dict = collector.as_dict()
    except QuotaExhaustedError as exc:
        duration = time.perf_counter() - started
        if run_log is not None:
            run_log.append(
                f"stage paused: {name}",
                stage=name,
                status=STATUS_PAUSED,
                duration=round(duration, 3),
                error=str(exc),
            )
        result = StageResult(
            name=name,
            status=STATUS_PAUSED,
            error=str(exc),
            attempts=attempts,
            duration=duration,
        )
        if critical:
            raise
        return result
    except Exception as exc:  # noqa: BLE001 - terminal failure path
        duration = time.perf_counter() - started
        if run_log is not None:
            run_log.append(
                f"stage failed: {name}",
                stage=name,
                status=STATUS_FAILED,
                duration=round(duration, 3),
                error=str(exc),
            )
        result = StageResult(
            name=name,
            status=STATUS_FAILED,
            error=str(exc),
            attempts=attempts,
            duration=duration,
        )
        if critical:
            raise
        # Availability-first: degrade rather than abort the whole run.
        if run_log is not None:
            run_log.append(
                f"stage degraded: {name}",
                stage=name,
                status=STATUS_DEGRADED,
                duration=round(duration, 3),
                error=str(exc),
            )
        return StageResult(
            name=name,
            status=STATUS_DEGRADED,
            value=default,
            error=str(exc),
            attempts=attempts,
            duration=duration,
        )

    duration = time.perf_counter() - started
    if run_log is not None:
        run_log.append(
            f"stage ok: {name}",
            stage=name,
            status=STATUS_OK,
            duration=round(duration, 3),
            attempts=attempts,
            **usage_dict,
        )
    return StageResult(
        name=name,
        status=STATUS_OK,
        value=value,
        attempts=attempts,
        duration=duration,
        usage=usage_dict,
    )