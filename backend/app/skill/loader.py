"""Skill 模块：prepare_context 按需加载（skill-design.md §3）。"""
from __future__ import annotations

from ..state.schema import StageName
from .registry import SkillRegistry


def describe_skills(registry: SkillRegistry, stage: StageName) -> str:
    """渐进式披露的「摘要层」：只返回 name + description 概述，轻量、不塞 body。"""
    skills = registry.route(stage)
    return "\n".join(f"- {s.name}：{s.description or '（无描述）'}" for s in skills)


def load_skill_bodies(registry: SkillRegistry, stage: StageName) -> str:
    """渐进式披露的「详情层」：返回完整正文（开头带 description 概览 + 版本号）。"""
    skills = registry.route(stage)
    parts = []
    for s in skills:
        head = f"# {s.name} (v{s.version})\n> {s.description}\n{s.body}" if s.description else f"# {s.name} (v{s.version})\n{s.body}"
        parts.append(head)
    return "\n\n".join(parts)


def build_system_prompt(
    base: str,
    registry: SkillRegistry | None,
    stage: StageName,
    core_memory: str = "",
) -> str:
    """组装 system prompt：基础角色职责 + 核心记忆（常驻）+ 当前阶段 Skill 正文。

    - core_memory：核心记忆常驻注入（memory.md §1 核心记忆）。
    - registry 为 None 时只返回基础职责（测试 / 无 Skill 场景）。
    """
    parts = [base]
    if core_memory:
        parts.append(f"# 核心记忆（常驻）\n{core_memory}")
    if registry is not None:
        bodies = load_skill_bodies(registry, stage)
        if bodies:
            parts.append(f"# 参考技能\n{bodies}")
    return "\n\n".join(parts)
