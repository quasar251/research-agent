"""Skill 模块：Skill 定义 + 注册表 + 阶段路由（渐进式披露，skill-design.md）。"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..state.schema import StageName


@dataclass
class Skill:
    """一个 Skill：组合知识，绑定阶段。

    description 是一句话概述，用于渐进式披露：先只披露概述，模型确定需要时才加载 body。
    version 是版本号（skill-design.md §6.1）：正文每次变更即升版，保证可复现。
    """

    id: str
    name: str
    stage: StageName
    body: str  # Markdown 或结构化定义
    description: str = ""  # 一句话概述（渐进式披露的摘要层）
    tool_refs: list[str] = field(default_factory=list)
    version: str = "1.0.0"


class SkillRegistry:
    """Skill 注册表，按阶段路由返回活跃 Skill（渐进式披露）。"""

    def __init__(self) -> None:
        self._skills: dict[str, Skill] = {}

    def register(self, skill: Skill) -> None:
        self._skills[skill.id] = skill

    def route(self, stage: StageName) -> list[Skill]:
        """只返回绑定到该阶段的 Skill，不同阶段的 Skill 不混入同一上下文。"""
        return [s for s in self._skills.values() if s.stage == stage]
