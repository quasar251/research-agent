"""Tool 模块：结构化错误码（tool.md §6.2 / reliability.md §3）。

工具返回结构化错误码（超时 / 限流 / 鉴权 / 参数 / 网络），调用方据此分类重试。
"""
from __future__ import annotations

from enum import Enum


class ToolErrorCode(str, Enum):
    TIMEOUT = "timeout"            # 超时
    RATE_LIMITED = "rate_limited"  # 限流
    AUTH = "auth"                  # 鉴权
    INVALID_PARAM = "invalid_param"  # 参数
    NETWORK = "network"            # 网络


class ToolError(Exception):
    """工具调用错误，带结构化错误码。"""

    def __init__(self, code: ToolErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
