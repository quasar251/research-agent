"""Tool 模块：Tool 定义 + Tool Registry（tool.md）。

只登记能力清单，不做权限判定；权限判定归 Security 的 PermissionGate。
披露策略是项目级最小权限，不做细粒度渐进式披露。
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Tool:
    """一个原子能力。"""

    id: str
    name: str
    description: str
    permission: str  # 权限要求，由 PermissionGate 判定


class ToolRegistry:
    """注册表：登记"有哪些能力可用"。"""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.id] = tool

    def list(self) -> list[Tool]:
        return list(self._tools.values())

    def get(self, tool_id: str) -> Tool | None:
        return self._tools.get(tool_id)
