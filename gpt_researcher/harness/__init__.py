"""Agent Harness layer for GPT Researcher.

Provides the resilience/observability primitives that the research pipeline
lacks out of the box, adapted from the "research-agent-xhs" design:

- ``errors``   — LLM error taxonomy (transient vs. fatal vs. quota-exhausted)
- ``retry``    — exponential-backoff retry with error classification
- ``run_log``  — bounded, append-only JSONL run log, isolated per run
- ``usage``    — append-only token-usage ledger, one record per stage
- ``pause``    — persistent quota-exhaustion pause markers
- ``stuck``    — repeated-tool-failure ("stuck loop") detection
- ``stage``    — stage wrapper (retry + degraded delivery), per-stage
                 token/usage collection, usage persistence and pause signalling

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
from .pause import clear_paused, get_pause, list_paused, mark_paused
from .retry import RetryPolicy, async_retry
from .run_log import RunLog, run_log_for, run_log_path
from .stage import (
    StageResult,
    UsageCollector,
    collect_stage,
    report_usage,
    run_stage,
)
from .stuck import (
    StuckDetector,
    ToolStuckError,
    current_detector,
    guard_against_stuck,
    note_tool_failure,
)
from .usage import read_usage, record_usage, sum_usage, usage_log_path

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
    "run_log_for",
    "run_log_path",
    "StageResult",
    "UsageCollector",
    "collect_stage",
    "report_usage",
    "run_stage",
    "clear_paused",
    "get_pause",
    "list_paused",
    "mark_paused",
    "read_usage",
    "record_usage",
    "sum_usage",
    "usage_log_path",
    "StuckDetector",
    "ToolStuckError",
    "current_detector",
    "guard_against_stuck",
    "note_tool_failure",
]