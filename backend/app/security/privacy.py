"""安全模块：隐私脱敏（security.md 边界二，mask / hash / remove 三模式）。"""
from __future__ import annotations

import hashlib
import re


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


# 常见个人身份信息（PII）模式：手机号 / 邮箱 / 身份证号
_PII_PATTERNS = (
    re.compile(r"1[3-9]\d{9}"),
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    re.compile(r"\d{17}[\dXx]"),
)


def detect_pii(text: str) -> list[str]:
    """返回文本中命中的 PII 片段（空列表表示无 PII）。"""
    found: list[str] = []
    for pat in _PII_PATTERNS:
        found.extend(m.group(0) for m in pat.finditer(text))
    return found


def sanitize(text: str, mode: str = "mask") -> str:
    """检测并脱敏文本中的 PII（手机号 / 邮箱 / 身份证）。"""
    result = text
    for pat in _PII_PATTERNS:
        result = pat.sub(lambda m: redact(m.group(0), mode), result)
    return result
