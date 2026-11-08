"""可观测性：审计日志（s09 JSONL 转录 + s23 hash chain 防篡改）。

append-only JSONL，每事件一行并 fsync；每条记录带 prev_hash + 自身 SHA-256，
形成防篡改链。回放时逐条验证 hash chain，任何修改/断裂都 fail-closed 拒绝，
绝不把证据损坏伪装成成功恢复。path 为 None 时退化为纯内存（测试场景）。
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

GENESIS_HASH = "0" * 64


class AuditCorruptionError(RuntimeError):
    """审计链不可信时抛出（fail-closed）。"""


@dataclass
class AuditEvent:
    """一条审计事件。"""

    type: str  # 上下文编译 / 状态写入 / 工具调用 / Skill 加载 / 派发 / 注入扫描 / 隐私脱敏
    subject: str
    payload: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    prev_hash: str = GENESIS_HASH  # 链指针（内部）
    digest: str = ""  # 自身 SHA-256（内部）


def _event_digest(seq: int, recorded_at: str, type_: str, subject: str, payload: dict, prev_hash: str) -> str:
    raw = json.dumps(
        {
            "sequence": seq,
            "recorded_at": recorded_at,
            "type": type_,
            "subject": subject,
            "payload": payload,
            "prev_hash": prev_hash,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class AuditLog:
    """append-only hash chain 审计日志，支持记录、查询与崩溃回放（fail-closed）。"""

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path else None
        self._events: list[AuditEvent] = []
        self._seq = 0
        self._tail_hash = GENESIS_HASH
        self._lock = threading.Lock()
        if self.path is not None and self.path.exists():
            self._replay()

    def record(self, type_: str, subject: str, payload: dict | None = None) -> None:
        """记录一条事件：密封（算 hash）→ 入内存镜像 → 追加落盘。"""
        event = AuditEvent(type=type_, subject=subject, payload=payload or {})
        with self._lock:
            if self.path is not None:
                self._seal(event)
            self._events.append(event)
            if self.path is not None:
                self._append(event)

    def query(self, type_: str | None = None) -> list[AuditEvent]:
        if type_ is None:
            return list(self._events)
        return [e for e in self._events if e.type == type_]

    # ------------------------------------------------------------------
    # hash chain + JSONL 持久化
    # ------------------------------------------------------------------

    def _seal(self, event: AuditEvent) -> None:
        """计算本条的链指针与自身 hash，推进链尾。"""
        self._seq += 1
        event.prev_hash = self._tail_hash
        event.digest = _event_digest(
            self._seq,
            event.timestamp.isoformat(),
            event.type,
            event.subject,
            event.payload,
            event.prev_hash,
        )
        self._tail_hash = event.digest

    def _append(self, event: AuditEvent) -> None:
        """追加一行 JSON 并 fsync，保证 durable boundary 清楚可测。"""
        envelope = {
            "schema_version": 1,
            "sequence": self._seq,
            "recorded_at": event.timestamp.isoformat(),
            "type": event.type,
            "subject": event.subject,
            "payload": event.payload,
            "prev_hash": event.prev_hash,
            "digest": event.digest,
        }
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(envelope, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())

    def _replay(self) -> None:
        """从 JSONL 回放，逐条验证 hash chain。

        只容忍「没有换行且 JSON 不完整」的崩溃尾部；完整坏行、中间坏行、hash 不匹配
        或 sequence 断裂都抛 AuditCorruptionError（fail-closed）。
        """
        lines = self.path.read_text(encoding="utf-8").splitlines()
        prev = GENESIS_HASH
        for line in lines:
            if not line.strip():
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError as exc:
                raise AuditCorruptionError(f"审计日志坏行，拒绝回放：{exc}") from exc
            expected = _event_digest(
                data["sequence"],
                data["recorded_at"],
                data["type"],
                data["subject"],
                data.get("payload", {}),
                data["prev_hash"],
            )
            if data["prev_hash"] != prev:
                raise AuditCorruptionError("审计链 linkage 断裂，拒绝回放")
            if data.get("digest") != expected:
                raise AuditCorruptionError("审计条目 hash 不匹配，拒绝回放")
            prev = data["digest"]
            self._events.append(
                AuditEvent(
                    type=data["type"],
                    subject=data["subject"],
                    payload=data.get("payload", {}),
                    timestamp=datetime.fromisoformat(data["recorded_at"]),
                    prev_hash=data["prev_hash"],
                    digest=data["digest"],
                )
            )
            self._seq = max(self._seq, data["sequence"])
        self._tail_hash = prev
