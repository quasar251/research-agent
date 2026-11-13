"""可观测性：结构化 JSON 日志（operations.md §5 / observability.md §7.2）。

统一字段：timestamp / level / run_id / thread_id / event / payload。
级别：INFO 正常流程 / WARN 重试降级 / ERROR 失败熔断。
日志脱敏：命中隐私脱敏的内容不进日志原文（security.md 边界二），由调用方在
记录前用 security.privacy.sanitize 处理。
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "run_id": getattr(record, "run_id", ""),
            "thread_id": getattr(record, "thread_id", ""),
            "event": getattr(record, "event", record.getMessage()),
            "payload": getattr(record, "payload", {}),
        }
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def setup_logging(level: str = "INFO") -> None:
    """配置根日志为结构化 JSON 输出（dev/prod 差异仅级别，operations.md §2）。"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger("research-agent")
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers = [handler]
    root.propagate = False


_logger = logging.getLogger("research-agent")
if not _logger.handlers:  # 未显式配置时给一个默认 JSON handler
    _h = logging.StreamHandler(sys.stdout)
    _h.setFormatter(_JsonFormatter())
    _logger.addHandler(_h)
    _logger.setLevel(logging.INFO)


def struct_log(
    level: str,
    event: str,
    run_id: str = "",
    thread_id: str = "",
    payload: dict[str, Any] | None = None,
) -> None:
    """写一条结构化日志。"""
    kwargs: dict[str, Any] = {
        "run_id": run_id,
        "thread_id": thread_id,
        "event": event,
        "payload": payload or {},
    }
    getattr(_logger, level.lower(), _logger.info)(event, extra=kwargs)
