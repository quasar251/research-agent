"""记忆模块：向量检索（memory.md §6）。

内存向量索引 + 余弦相似度，供长期记忆检索复用。
"""
from __future__ import annotations

import math

from .store import LongTermMemory


def cosine(a: list[float], b: list[float]) -> float:
    """余弦相似度。"""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


class MemoryIndex:
    """长期记忆的内存向量索引。"""

    def __init__(self) -> None:
        self._entries: list[tuple[LongTermMemory, list[float]]] = []

    def add(self, memory: LongTermMemory, embedding: list[float]) -> None:
        self._entries.append((memory, embedding))

    def search(self, query_embedding: list[float], top_k: int = 5) -> list[LongTermMemory]:
        """按余弦相似度返回 top-k 记忆。"""
        scored = sorted(
            self._entries,
            key=lambda e: cosine(query_embedding, e[1]),
            reverse=True,
        )
        return [mem for mem, _ in scored[:top_k]]

    def __len__(self) -> int:
        return len(self._entries)
