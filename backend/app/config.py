"""配置：模型、密钥、预算、检查点路径。"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Settings:
    model: str = "claude-sonnet-4-5"
    api_key: str = ""          # 空则从环境变量 ANTHROPIC_API_KEY 读取
    max_tokens: int = 1024
    db_path: str = "checkpoints.sqlite"
