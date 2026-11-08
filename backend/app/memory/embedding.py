"""记忆模块：Embedding 客户端（memory.md §6 检索实现）。

SiliconFlow BGE-M3 走 OpenAI 兼容接口；用协议定义，测试注入 mock。
"""
from __future__ import annotations

from typing import Protocol

import httpx


class EmbeddingClient(Protocol):
    """Embedding 调用接口，测试时注入 mock。"""

    def embed(self, texts: list[str]) -> list[list[float]]:
        """把文本列表转成向量列表（与输入顺序一致）。"""
        ...


class SiliconFlowEmbedding:
    """SiliconFlow 的 BGE-M3 等模型（OpenAI 兼容 /embeddings 接口）。"""

    def __init__(self, api_key: str, base_url: str, model: str) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def embed(self, texts: list[str]) -> list[list[float]]:
        resp = httpx.post(
            f"{self.base_url}/embeddings",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model, "input": texts},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        data = sorted(data, key=lambda d: d["index"])
        return [d["embedding"] for d in data]


def from_settings(settings) -> SiliconFlowEmbedding:
    """从配置创建 Embedding 客户端。"""
    return SiliconFlowEmbedding(
        api_key=settings.embedding.api_key,
        base_url=settings.embedding.base_url,
        model=settings.embedding.model,
    )
