"""Skill 目录：默认流程知识（研究规划 / 结论抽取 / 证据分级 / 报告结构）。

这些是「组合知识」（skill-design.md §1），按阶段绑定、随阶段路由渐进式披露，
不进入角色职责（角色职责是固定的 system prompt，见各 agent 节点）。
"""
from __future__ import annotations

from ..state.schema import StageName
from .registry import Skill, SkillRegistry

# 各阶段的流程知识正文（Markdown）。内容与 docs/ 的角色规范对齐。

_PLANNING_BODY = """## 研究范围约束
- 公司清单（companies）：圈定 3~5 家该行业最具代表性的头部公司，宁精勿多，不要超过 5 家。
- 分析维度（dims）：确定 3~4 个关键维度，从以下候选里挑最贴合本次意图的：市场规模、竞争格局、技术趋势、产业链、商业模式、风险与挑战、政策环境、区域分布。
- 子任务（subtasks）：为每个「公司 × 维度」组合生成恰好一个子任务，保证研究矩阵每个格子都有对应子任务，全覆盖、不遗漏。

## 子任务编写要求
- question 要具体、可独立回答，点明「哪家公司 + 哪个维度 + 想查清什么」。
- 避免宽泛表述，落到可验证的事实（例如「A 公司 2024 年市场份额及主要竞争对手」，而非「调研 A 公司」）。
- company 与 dim 字段必须与 companies / dims 清单中的字符串精确一致。"""

_EXTRACTION_BODY = """## 结论抽取要求
- 每条结论（claim）必须是一条可独立验证的事实性陈述，避免空话、套话和主观评价。
- 每条结论的 evidence_urls 只能从「检索到的来源」中选取，不得编造来源 URL。
- 若检索到的来源不足以支撑某条结论，宁可不写该结论，也不要给出没有依据的数值。
- 针对一个子任务给出 1~3 条精炼结论即可，重质量不重数量。"""

_GRADING_BODY = """## 证据强度四档判定标准
- solid（实锤）：结论有权威一手来源或官方数据直接支撑，事实明确、口径清晰。
- inferred（推断）：结论由部分信息合理推导，或来源权威性一般、信息不完整。
- consensus（共识）：结论是多方来源一致认可的主流观点，但缺乏单一权威出处。
- divided（分歧）：结论在不同来源间存在明显分歧或争议，尚无定论。

## 判定原则
- 证据弱就标弱，宁可降级也不拔高。
- 缺来源或来源不明的结论，不得标 solid。"""

_REPORT_BODY = """## 摘要编写要求
- 把去重后的结论提炼为一段连贯的行业摘要，覆盖本次调研的核心发现。
- 摘要要落到可验证的判断上，避免空泛套话；关键指标（如市场规模、增速）优先呈现。
- 若结论之间存在分歧，如实呈现分歧，而非强行统一；证据弱（推断/分歧）的结论应降低确定性表述。
- 每条结论末尾的「（证据强度：X）」是供你判断置信度的元信息，摘要正文中不要复述这些标签。
- 只基于给定结论撰写，不得补充结论之外的数字或事实。

## 报告章节结构（最终交付物骨架，deep 全量 / simple 收敛）
执行摘要 → 行业定义与宏观环境 → 市场规模 → 产业链 → 竞争格局 → 趋势研判 → 风险提示 → SWOT → 结论与建议 → 信息来源。"""


def build_default_registry() -> SkillRegistry:
    """构建预置的默认 Skill 注册表，按阶段绑定流程知识（含 description 概述）。"""
    registry = SkillRegistry()
    registry.register(
        Skill(
            id="research-planning",
            name="研究规划",
            description="圈定公司/维度、拆解子任务的研究范围与编写口径",
            stage=StageName.ALIGN,
            body=_PLANNING_BODY,
        )
    )
    registry.register(
        Skill(
            id="claim-extraction",
            name="结论抽取",
            description="从检索来源抽取可验证结论、标注证据来源的口径",
            stage=StageName.COLLECT,
            body=_EXTRACTION_BODY,
        )
    )
    registry.register(
        Skill(
            id="evidence-grading",
            name="证据分级",
            description="证据强度四档（实锤/推断/共识/分歧）的判定标准",
            stage=StageName.VERIFY,
            body=_GRADING_BODY,
        )
    )
    registry.register(
        Skill(
            id="report-structure",
            name="报告结构",
            description="报告摘要规范与章节结构骨架（deep 全量/simple 收敛）",
            stage=StageName.SYNTHESIZE,
            body=_REPORT_BODY,
        )
    )
    return registry
