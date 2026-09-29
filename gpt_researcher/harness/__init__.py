"""Agent Harness layer for GPT Researcher.

Provides the resilience/observability primitives that the research pipeline
lacks out of the box, adapted from the "research-agent-xhs" design:

- ``errors``   — LLM error taxonomy (transient vs. fatal vs. quota-exhausted)
- ``retry``    — exponential-backoff retry with error classification
- ``run_log``  — bounded, append-only JSONL run log
- ``stage``    — stage wrapper (retry + degraded delivery) and per-stage
                 token/usage collection via contextvars

The layer is intentionally framework-free so it can wrap both the core
``GPTResearcher`` pipeline and the FastAPI service layer.
"""

from .errors import (
    AuthenticationError,
    ContextLengthExceededError,
    LLMError,
    ModelNotFoundError,
    QuotaExhaustedError,
    RateLimitError,
    ServerError,
    classify_exception,
    classify_status_code,
    is_retryable,
)
from .retry import RetryPolicy, async_retry
from .run_log import RunLog
from .stage import (
    StageResult,
    UsageCollector,
    collect_stage,
    report_usage,
    run_stage,
)

__all__ = [
    "AuthenticationError",
    "ContextLengthExceededError",
    "LLMError",
    "ModelNotFoundError",
    "QuotaExhaustedError",
    "RateLimitError",
    "ServerError",
    "classify_exception",
    "classify_status_code",
    "is_retryable",
    "RetryPolicy",
    "async_retry",
    "RunLog",
    "StageResult",
    "UsageCollector",
    "collect_stage",
    "report_usage",
    "run_stage",
]