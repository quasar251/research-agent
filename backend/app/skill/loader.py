"""Skill 模块：prepare_context 按需加载（skill-design.md §3）。"""
from __future__ import annotations

from ..state.schema import StageName
from .registry import SkillRegistry


def load_skill_bodies(registry: SkillRegistry, stage: StageName) -> str:
    """按阶段加载活跃 Skill 正文，拼成可注入上下文的文本（不一次性塞满）。"""
    skills = registry.route(stage)
    return "\n\n".join(f"# {s.name}\n{s.body}" for s in skills)
