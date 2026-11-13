"""Tool 模块：MCP 连接管理（tool.md §6.1）。

MCP 连接池化，复用连接；连接失效自动重建；连接异常计入审计，触发熔断走降级。
此处是连接生命周期管理骨架：任何实现 McpClient 协议的服务端（真实 MCP server
或测试 stub）都纳入统一池管理，与具体 MCP 传输协议解耦（接入 anthropic sdk 的
MCP 客户端时替换 McpClient 实现即可）。
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Protocol

from .errors import ToolError, ToolErrorCode

# 单次 MCP 工具调用默认超时 30s（reliability.md §3）
_DEFAULT_TIMEOUT = 30.0


@dataclass
class McpToolDef:
    """一个 MCP 工具的登记定义。"""

    name: str
    description: str = ""
    input_schema: dict = field(default_factory=dict)


class McpClient(Protocol):
    """MCP 服务端客户端协议，接入具体传输时实现。"""

    server_id: str

    def connect(self) -> None: ...
    def disconnect(self) -> None: ...
    def is_alive(self) -> bool: ...
    def list_tools(self) -> list[McpToolDef]: ...
    def call_tool(self, name: str, arguments: dict) -> dict: ...


class McpConnectionPool:
    """MCP 连接池：复用连接、失效自动重建、按 server_id 隔离。"""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self.timeout = timeout
        self._clients: dict[str, McpClient] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()

    def get(self, server_id: str, factory: Callable[[], McpClient]) -> McpClient:
        """取连接：复用活连接，失效则重建（tool.md §6.1 失效自动重建）。"""
        with self._lock:
            client = self._clients.get(server_id)
            if client is not None and self._alive(client):
                return client
        # 需要新建或重建
        client = factory()
        client.connect()
        with self._lock:
            self._clients[server_id] = client
        return client

    def call_tool(self, server_id: str, factory: Callable[[], McpClient], name: str, arguments: dict) -> dict:
        """带超时与失效重建的工具调用。连接异常抛 ToolError（调用方据此分类/降级）。"""
        client = self.get(server_id, factory)
        started = time.monotonic()
        try:
            return client.call_tool(name, arguments)
        except ToolError:
            raise
        except Exception as exc:  # noqa: BLE001 - 统一归类为网络错误
            self._invalidate(server_id, client)
            raise ToolError(ToolErrorCode.NETWORK, f"MCP 工具调用失败: {exc}") from exc
        finally:
            if time.monotonic() - started > self.timeout:
                self._invalidate(server_id, client)

    def list_tools(self, server_id: str, factory: Callable[[], McpClient]) -> list[McpToolDef]:
        """列出某 server 的能力清单，供 ToolRegistry 登记。"""
        return self.get(server_id, factory).list_tools()

    def close(self, server_id: str | None = None) -> None:
        """关闭连接：server_id 为 None 时关闭全部。"""
        with self._lock:
            if server_id is None:
                for c in self._clients.values():
                    self._safe_disconnect(c)
                self._clients.clear()
            elif server_id in self._clients:
                self._safe_disconnect(self._clients[server_id])
                del self._clients[server_id]

    # ------------------------------------------------------------------

    def _alive(self, client: McpClient) -> bool:
        try:
            return client.is_alive()
        except Exception:  # noqa: BLE001
            return False

    def _invalidate(self, server_id: str, client: McpClient) -> None:
        with self._lock:
            if self._clients.get(server_id) is client:
                self._safe_disconnect(client)
                del self._clients[server_id]

    @staticmethod
    def _safe_disconnect(client: McpClient) -> None:
        try:
            client.disconnect()
        except Exception:  # noqa: BLE001
            pass
