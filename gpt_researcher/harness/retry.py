"""Exponential-backoff retry helper.

Adapted from ``research-agent-xhs`` (``llm/client.py::_request_with_retry``).
Kept provider-agnostic so it can wrap any coroutine: LLM calls, scrapes, MCP
tool invocations.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, TypeVar

from .errors import QuotaExhaustedError, classify_exception, is_retryable

logger = logging.getLogger(__name__)

T = TypeVar("T")

__all__ = ["RetryPolicy", "async_retry"]


@dataclass(frozen=True)
class RetryPolicy:
    """Retry tuning knobs.

    ``max_attempts`` counts the initial try, so ``3`` means "try, then up to two
    retries" — matching the xhs default.
    """

    max_attempts: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    jitter: bool = True

    def delay_for(self, attempt: int) -> float:
        """Backoff for the given (1-based) failed attempt: base * 2^(n-1)."""
        raw = self.base_delay * (2 ** (attempt - 1))
        raw = min(raw, self.max_delay)
        if self.jitter:
            # Full jitter keeps concurrent retries from thundering in lockstep.
            import random

            raw = random.uniform(raw * 0.5, raw)
        return raw


async def async_retry(
    fn: Callable[[], Awaitable[T]],
    policy: RetryPolicy | None = None,
    *,
    on_retry: Callable[[int, BaseException, float], None] | None = None,
    sleep: Callable[[float], Awaitable[None]] | None = None,
) -> T:
    """Invoke ``fn`` with retries on transient failures.

    Retries on ``RateLimitError``/``ServerError``/network errors; re-raises
    immediately on quota-exhaustion and fatal errors (auth/model/context).

    Args:
        fn: Zero-arg coroutine factory (call it fresh on each attempt).
        policy: Retry tuning; defaults to ``RetryPolicy()``.
        on_retry: Optional callback ``(attempt, exc, delay)`` invoked before
            each backoff sleep — useful for logging/telemetry.
        sleep: Injectable sleep, mainly for tests.

    Returns:
        Whatever ``fn`` returns on the first successful attempt.
    """
    policy = policy or RetryPolicy()
    _sleep = sleep or asyncio.sleep
    last_err: BaseException | None = None

    for attempt in range(1, policy.max_attempts + 1):
        try:
            return await fn()
        except QuotaExhaustedError:
            # Retrying cannot help; surface immediately so the caller can pause.
            raise
        except BaseException as exc:  # noqa: BLE001 - classified below
            last_err = exc
            if attempt >= policy.max_attempts or not is_retryable(exc):
                # Provider SDKs raise bare 429s with a quota/billing body, which
                # ``is_retryable`` already reads as quota-exhausted — but only a
                # classified error lets the caller *pause* rather than report a
                # generic failure. Re-raise the classified one when it is more
                # specific; otherwise pass the original through untouched.
                classified = classify_exception(exc)
                if isinstance(classified, QuotaExhaustedError) and classified is not exc:
                    raise classified from exc
                raise
            delay = policy.delay_for(attempt)
            if on_retry is not None:
                on_retry(attempt, exc, delay)
            else:
                logger.warning(
                    "Attempt %d/%d failed (%s), retrying in %.1fs",
                    attempt,
                    policy.max_attempts,
                    exc,
                    delay,
                )
            await _sleep(delay)

    # Unreachable: the loop either returns or raises.
    raise last_err  # type: ignore[misc]