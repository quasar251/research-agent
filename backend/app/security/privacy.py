"""安全模块：隐私脱敏（security.md 边界二，mask / hash / remove 三模式）。"""
from __future__ import annotations

import hashlib


def mask(text: str) -> str:
    """打码：保留首尾，中间打星。"""
    if len(text) <= 2:
        return "*" * len(text)
    return text[0] + "*" * (len(text) - 2) + text[-1]


def hash_text(text: str) -> str:
    """哈希：SHA-256 前 16 位。"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def remove() -> str:
    """移除：占位符。"""
    return "[REDACTED]"


def redact(text: str, mode: str) -> str:
    """按模式脱敏。"""
    if mode == "mask":
        return mask(text)
    if mode == "hash":
        return hash_text(text)
    return remove()
