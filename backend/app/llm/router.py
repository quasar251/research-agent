"""LLM 层：模型路由（s08）。

「便宜的做粗筛，贵的做推理」——按角色难度把 LLM 调用路由到 lite/default/craft 三档。
当前单模型时所有档位降级复用同一 client；接入多模型时只需往 ModelRouter 注入不同 client。
"""
from __future__ import annotations

from collections import defaultdict
from enum import Enum

from ..state.schema import AgentRole
from .client import LLMClient


class ModelTier(str, Enum):
    """三档模型层级。"""

    LITE = "lite"        # 粗筛 / 分类 / 简单判断
    DEFAULT = "default"  # 规划 / 执行 / 多步
    CRAFT = "craft"      # 推理 / 面向用户的最终产出


# 角色 → 档位映射：后台简单任务用轻量，面向用户/最终产出用强模型
AGENT_TIER_MAP = {
    AgentRole.LEAD: ModelTier.DEFAULT,       # 规划：理解意图，中等强度
    AgentRole.COLLECTOR: ModelTier.DEFAULT,  # 搜集：工具调用 + 多步执行
    AgentRole.VERIFIER: ModelTier.LITE,      # 核查：简单分级判断
    AgentRole.SYNTHESIZER: ModelTier.CRAFT,  # 合成：最终报告，面向用户
}


class ModelRouter:
    """按角色把调用路由到对应档位，并记录各档位用量（可观测）。"""

    def __init__(self, default: LLMClient, **tier_clients: LLMClient) -> None:
        self._clients: dict[ModelTier, LLMClient] = {ModelTier.DEFAULT: default}
        for name, client in tier_clients.items():
            self._clients[ModelTier(name)] = client
        self._usage: dict[ModelTier, int] = defaultdict(int)

    def resolve(self, role: AgentRole) -> LLMClient:
        """返回该角色应使用的模型 client，并累计用量。

        - 未配置对应档位时降级到 default，保证单模型场景可用。
        - 熔断降级（reliability.md §2）：目标档位熔断中，回退到 default（换更小/更快模型的第一步）。
        """
        tier = AGENT_TIER_MAP.get(role, ModelTier.DEFAULT)
        self._usage[tier] += 1
        client = self._clients.get(tier) or self._clients[ModelTier.DEFAULT]
        if tier != ModelTier.DEFAULT and self._is_open(client):
            fallback = self._clients.get(ModelTier.DEFAULT)
            if fallback is not None and not self._is_open(fallback):
                self._usage[ModelTier.DEFAULT] += 1
                return fallback
        return client

    @staticmethod
    def _is_open(client: LLMClient) -> bool:
        """client 是否处于熔断 open 状态。"""
        cb = getattr(client, "circuit_breaker", None)
        return bool(cb) and getattr(cb, "state", "closed") == "open"

    def usage(self) -> dict[str, int]:
        """各档位的调用次数（供指标/审计展示路由分布）。"""
        return {tier.value: count for tier, count in self._usage.items()}
