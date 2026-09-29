"""LLM error taxonomy with retry semantics.

Adapted from ``research-agent-xhs`` (``llm/errors.py``). The key insight is
that not every failure deserves a retry:

- **Transient** (429 rate-limit, 5xx, network): retry with exponential backoff.
- **Quota exhausted** (429 with billing/quota keywords): retrying only burns
  wall-clock time — surface it as a *pause*, don't retry.
- **Fatal** (401/403/404, context-length): retrying reproduces the same result
  — fail fast.

Before this module the pipeline treated every error identically: a single 429
aborted an entire sub-query, and an invalid API key was retried like a flaky
network call.
"""

from __future__ import annotations

import asyncio

__all__ = [
    "LLMError",
    "RateLimitError",
    "QuotaExhaustedError",
    "AuthenticationError",
    "ModelNotFoundError",
    "ContextLengthExceededError",
    "ServerError",
    "classify_status_code",
    "classify_exception",
    "is_retryable",
]


class LLMError(Exception):
    """Base error for LLM provider failures."""

    retryable = False

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        body: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class RateLimitError(LLMError):
    """429 Too Many Requests — short-term throttling, safe to retry."""

    retryable = True


class QuotaExhaustedError(RateLimitError):
    """429 caused by an exhausted fixed-window quota / balance.

    Retrying is pointless until an external condition changes (top-up, quota
    refresh). Distinguished from ``RateLimitError`` by keywords in the response
    body. ``retryable`` is inherited as ``True`` but the retry helper explicitly
    excludes it: it must bubble up so the caller can *pause* rather than fail.
    """


class AuthenticationError(LLMError):
    """401/403 — invalid key or missing permission. Not retryable."""


class ModelNotFoundError(LLMError):
    """404 — the requested model does not exist. Not retryable."""


class ContextLengthExceededError(LLMError):
    """Prompt exceeds the model context window. Not retryable."""


class ServerError(LLMError):
    """5xx — transient server-side failure. Safe to retry."""

    retryable = True


#: 429 bodies containing any of these (case-insensitive) mean "quota exhausted"
#: rather than "slow down". Providers word it differently (quota / balance /
#: billing / 余额 / 配额 …), so we match on substrings.
_QUOTA_KEYWORDS = (
    "quota",
    "balance",
    "billing",
    "insufficient",
    "exhausted",
    "额度",
    "余额",
    "欠费",
    "配额",
    "计费",
    "耗尽",
    "用量超限",
    "充值",
)


def _looks_like_quota_exhausted(body: str) -> bool:
    lowered = (body or "").lower()
    return any(keyword in lowered for keyword in _QUOTA_KEYWORDS)


def _looks_like_context_length(body: str) -> bool:
    lowered = (body or "").lower()
    return "context_length" in lowered or "maximum context" in lowered


def classify_status_code(status_code: int, body: str = "") -> LLMError:
    """Map an HTTP status code (+ body) to the most specific error type."""
    if status_code == 429:
        if _looks_like_quota_exhausted(body):
            return QuotaExhaustedError("Quota exhausted", status_code, body)
        return RateLimitError("Rate limited", status_code, body)
    if status_code in (401, 403):
        return AuthenticationError("Authentication failed", status_code, body)
    if status_code == 404:
        return ModelNotFoundError("Model not found", status_code, body)
    if status_code >= 500:
        return ServerError(f"Server error {status_code}", status_code, body)
    if _looks_like_context_length(body):
        return ContextLengthExceededError("Context length exceeded", status_code, body)
    return LLMError(f"API error {status_code}", status_code, body)


def classify_exception(exc: BaseException) -> LLMError:
    """Best-effort classification of an arbitrary exception.

    Provider SDKs (LangChain / openai / httpx) raise their own types. We probe
    for a ``status_code``/``status`` attribute and fall back to duck-typing on
    the error text so the retry helper can still make a sane decision.
    """
    if isinstance(exc, LLMError):
        return exc

    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if isinstance(status, int):
        return classify_status_code(status, str(exc))

    text = str(exc)
    lowered = text.lower()
    if "429" in lowered or "rate limit" in lowered or "too many requests" in lowered:
        return classify_status_code(429, text)
    if "401" in lowered or "403" in lowered or "unauthorized" in lowered or "invalid api key" in lowered:
        return AuthenticationError(text)
    if "404" in lowered or "model not found" in lowered or "does not exist" in lowered:
        return ModelNotFoundError(text)
    # httpx / asyncio network failures are transient by nature.
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError, OSError)):
        return ServerError(f"Network error: {text}")
    if exc.__class__.__name__ in {
        "APITimeoutError",
        "APIConnectionError",
        "ConnectTimeout",
        "ReadTimeout",
        "ConnectError",
        "ReadError",
        "RemoteProtocolError",
        "InternalServerError",
    }:
        return ServerError(f"Network error: {text}")
    return LLMError(text)


def is_retryable(exc: BaseException) -> bool:
    """True when the classified error is worth retrying.

    ``QuotaExhaustedError`` is explicitly excluded even though it derives from
    the retryable ``RateLimitError``.
    """
    if isinstance(exc, QuotaExhaustedError):
        return False
    if isinstance(exc, LLMError):
        return exc.retryable
    return classify_exception(exc).retryable