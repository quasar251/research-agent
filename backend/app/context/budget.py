"""上下文模块：预算压缩与 token 计量（context.md §5、reliability.md §2）。

超预算时压缩，且**必须保留来源指针**，不能丢可溯源性。
"""
from __future__ import annotations

_CJK_START, _CJK_END = "\u4e00", "\u9fff"


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数：中文 1 字 ≈ 1 token，其余 4 字符 ≈ 1 token。"""
    cjk = sum(1 for ch in text if _CJK_START <= ch <= _CJK_END)
    other = len(text) - cjk
    return cjk + other // 4


def should_compress(text: str, budget: int) -> bool:
    """是否超出预算。"""
    return estimate_tokens(text) > budget


def compress(text: str, budget: int, source_pointers: list[str]) -> str:
    """超预算压缩：保留来源指针，正文截断到预算内（可靠性优先于完整性）。"""
    pointer_text = "；".join(source_pointers)
    head = f"[已压缩，来源：{pointer_text}]\n"
    # 预留头部空间，正文按剩余预算截断（中文按 1 字 ≈ 1 token 近似）
    remaining = max(budget - estimate_tokens(head), 20)
    body = text[: remaining]
    return head + body + ("…" if len(text) > remaining else "")
