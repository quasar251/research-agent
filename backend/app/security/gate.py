"""安全模块：PermissionGate 权限判定（security.md §4）。"""
from __future__ import annotations

from ..tools.registry import Tool


class PermissionGate:
    """横切所有 Tool 调用；只判定"能不能用"，不登记能力。"""

    def __init__(self, granted_permissions: set[str]) -> None:
        self._granted = granted_permissions

    def can_call(self, tool: Tool) -> bool:
        return tool.permission in self._granted
