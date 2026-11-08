"""上下文预算测试：token 估算、压缩保留来源指针。"""
from backend.app.context.budget import estimate_tokens, should_compress, compress


def test_estimate_tokens_cjk():
    assert estimate_tokens("市场规模") == 4


def test_should_compress():
    assert should_compress("x" * 100, budget=10) is True
    assert should_compress("short", budget=100) is False


def test_compress_keeps_source_pointers():
    result = compress("很长的正文" * 100, budget=50, source_pointers=["e1", "e2"])
    assert "来源" in result
    assert "e1" in result
    assert "e2" in result
