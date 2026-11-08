"""上下文模块：预算压缩与 token 计量（context.md §5、reliability.md §2、s14）。

超预算时结构化压缩：保头部 + 保尾部（最新）、弃中间、留摘要，且**必须保留来源指针**，
不能丢可溯源性。
"""
from __future__ import annotations

_CJK_START, _CJK_END = "\u4e00", "\u9fff"

_HEAD_CHARS = 1500  # 压缩时保留头部字符数
_TAIL_CHARS = 2500  # 压缩时保留尾部字符数（最新内容）


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数：中文 1 字 ≈ 1 token，其余 4 字符 ≈ 1 token。"""
    cjk = sum(1 for ch in text if _CJK_START <= ch <= _CJK_END)
    other = len(text) - cjk
    return cjk + other // 4


def should_compress(text: str, budget: int) -> bool:
    """是否超出预算。"""
    return estimate_tokens(text) > budget


def compress(text: str, budget: int, source_pointers: list[str]) -> str:
    """结构化压缩（s14）：保最新、弃最旧、留摘要 + 来源指针。

    文本较短时按预算截断；较长时保留 head + tail，中间省略并标注，
    来源指针始终保留以保证可溯源。
    """
    pointer_text = "；".join(source_pointers)
    note = f"[已压缩，来源：{pointer_text}]"
    if len(text) <= _HEAD_CHARS + _TAIL_CHARS:
        remaining = max(budget - estimate_tokens(note), 20)
        body = text[:remaining]
        return f"{note}\n{body}" + ("…" if len(text) > remaining else "")

    head = text[:_HEAD_CHARS]
    tail = text[-_TAIL_CHARS:]
    omitted = len(text) - _HEAD_CHARS - _TAIL_CHARS
    return (
        f"{note}，省略中间 {omitted} 字符\n"
        f"{head}\n"
        f"\n... [中间内容已压缩，可凭来源指针溯源] ...\n"
        f"\n{tail}"
    )
