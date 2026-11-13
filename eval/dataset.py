"""评估模块：预置带标注评估集（eval.md §6.1）。

题目 + 黄金结论 + 引用标注，分层 simple / deep、跨行业域。
生产环境可将 SAMPLE_DATASET 替换为更大规模的带标注数据集。
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class EvalItem:
    """一条评估样本。"""

    id: str
    intent: str
    depth: str  # simple / deep
    domain: str
    golden_claims: list[str] = field(default_factory=list)  # 黄金结论
    golden_citations: list[str] = field(default_factory=list)  # 黄金引用


SAMPLE_DATASET: list[EvalItem] = [
    EvalItem(
        id="ai-agent-simple",
        intent="调研 AI 智能体行业",
        depth="simple",
        domain="ai",
        golden_claims=["AI Agent 市场处于快速增长期"],
        golden_citations=[],
    ),
    EvalItem(
        id="ai-agent-deep",
        intent="深度调研 AI 智能体行业竞争格局",
        depth="deep",
        domain="ai",
        golden_claims=["头部厂商竞争从模型参数转向任务成功率与生态集成"],
        golden_citations=[],
    ),
    EvalItem(
        id="humanoid-deep",
        intent="深度调研人形机器人产业链",
        depth="deep",
        domain="robotics",
        golden_claims=["人形机器人产业链覆盖上游核心零部件到下游应用场景"],
        golden_citations=[],
    ),
]


def load_dataset() -> list[EvalItem]:
    """返回评估集（生产环境可替换为文件/数据库加载）。"""
    return list(SAMPLE_DATASET)


def dataset_stats(items: list[EvalItem]) -> dict:
    """评估集分层统计（eval.md §6.1 分层覆盖）。"""
    by_depth: dict[str, int] = {}
    by_domain: dict[str, int] = {}
    for it in items:
        by_depth[it.depth] = by_depth.get(it.depth, 0) + 1
        by_domain[it.domain] = by_domain.get(it.domain, 0) + 1
    return {"total": len(items), "by_depth": by_depth, "by_domain": by_domain}
