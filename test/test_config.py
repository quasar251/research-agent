"""配置测试：.env 解析 + Settings 从环境变量读取。"""
import os

from backend.app.config import _load_env, Settings, LLMConfig, EmbeddingConfig


def test_load_env_parses_file(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "API_KEY=test-key\n"
        "MODEL_ID=glm-4v-flash\n"
        "BSAE_URL=https://open.bigmodel.cn/api/anthropic\n"
        "# comment\n"
        "EMBEDDING_MODEL=BAAI/bge-m3\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("MODEL_ID", raising=False)
    monkeypatch.delenv("BSAE_URL", raising=False)
    monkeypatch.delenv("EMBEDDING_MODEL", raising=False)

    _load_env(env_file)

    assert os.environ["API_KEY"] == "test-key"
    assert os.environ["MODEL_ID"] == "glm-4v-flash"
    assert os.environ["BSAE_URL"] == "https://open.bigmodel.cn/api/anthropic"
    assert os.environ["EMBEDDING_MODEL"] == "BAAI/bge-m3"


def test_load_env_does_not_override_existing(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("API_KEY=from-file\n")
    monkeypatch.setenv("API_KEY", "from-env")

    _load_env(env_file)

    assert os.environ["API_KEY"] == "from-env"


def test_settings_from_env(monkeypatch):
    # 隔离项目根目录的真实 .env（可能含 BASE_URL），专注测「从环境变量读取」
    monkeypatch.setattr("backend.app.config._load_env", lambda *a, **k: None)
    monkeypatch.setenv("API_KEY", "k")
    monkeypatch.setenv("MODEL_ID", "glm-4v-flash")
    monkeypatch.setenv("BSAE_URL", "https://open.bigmodel.cn/api/anthropic")
    monkeypatch.setenv("EMBEDDING_MODEL", "BAAI/bge-m3")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "https://api.siliconflow.cn/v1")

    s = Settings.from_env()

    assert s.llm.model == "glm-4v-flash"
    assert s.llm.base_url == "https://open.bigmodel.cn/api/anthropic"
    assert s.embedding.model == "BAAI/bge-m3"
    assert s.embedding.base_url == "https://api.siliconflow.cn/v1"
