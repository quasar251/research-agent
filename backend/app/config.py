"""配置：从 .env 读取（LLM / Embedding / 检查点）。

密钥只从环境变量 / .env 读取，不进代码（operations.md §3）。
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_env(path: Path | None = None) -> None:
    """解析 .env 到环境变量（不覆盖已存在的环境变量）。"""
    env_path = path or (Path(__file__).resolve().parents[2] / ".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass
class LLMConfig:
    base_url: str
    api_key: str
    model: str


@dataclass
class EmbeddingConfig:
    provider: str = ""
    api_key: str = ""
    base_url: str = ""
    model: str = ""


@dataclass
class Settings:
    llm: LLMConfig
    embedding: EmbeddingConfig
    db_path: str = "checkpoints.sqlite"
    max_tokens: int = 1024
    llm_timeout_s: float = 60.0    # reliability.md §2 单次 complete 默认 60s
    task_timeout_s: float = 1800.0  # reliability.md §5 任务级硬超时默认 30 分钟

    @classmethod
    def from_env(cls) -> "Settings":
        _load_env()
        return cls(
            llm=LLMConfig(
                base_url=(
                    os.environ.get("BASE_URL")
                    or os.environ.get("BSAE_URL")
                    or "https://api.anthropic.com"
                ),
                # 兼容 operations.md §2 的 ANTHROPIC_API_KEY 与 api-integration.md 的 API_KEY
                api_key=os.environ.get("API_KEY")
                or os.environ.get("ANTHROPIC_API_KEY", ""),
                model=os.environ.get("MODEL_ID")
                or os.environ.get("MODEL", "claude-sonnet-4-5"),
            ),
            embedding=EmbeddingConfig(
                provider=os.environ.get("EMBEDDING_PROVIDER", ""),
                api_key=os.environ.get("EMBEDDING_API_KEY", ""),
                base_url=os.environ.get("EMBEDDING_BASE_URL", ""),
                model=os.environ.get("EMBEDDING_MODEL", ""),
            ),
            db_path=os.environ.get("DB_PATH", "checkpoints.sqlite"),
            llm_timeout_s=float(os.environ.get("LLM_TIMEOUT_S", "60")),
            task_timeout_s=float(os.environ.get("TASK_TIMEOUT_S", "1800")),
        )
