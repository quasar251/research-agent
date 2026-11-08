"""熔断器测试：状态机转换。"""
from backend.app.llm.circuit_breaker import CircuitBreaker


def test_breaker_opens_after_threshold():
    cb = CircuitBreaker(failure_threshold=3, cooldown=30.0)
    cb.record_failure()
    cb.record_failure()
    assert cb.state == "closed"
    cb.record_failure()
    assert cb.state == "open"


def test_breaker_rejects_while_open():
    cb = CircuitBreaker(failure_threshold=1, cooldown=30.0)
    cb.record_failure()
    assert cb.state == "open"
    assert cb.allow() is False


def test_breaker_half_open_then_closed():
    cb = CircuitBreaker(failure_threshold=1, cooldown=0.0)  # 冷却期为 0，立即进入半开
    cb.record_failure()
    assert cb.allow() is True  # 半开探测放行
    assert cb.state == "half_open"
    cb.record_success()
    assert cb.state == "closed"


def test_breaker_success_resets_failures():
    cb = CircuitBreaker(failure_threshold=3, cooldown=30.0)
    cb.record_failure()
    cb.record_failure()
    cb.record_success()
    assert cb.state == "closed"
    # 再失败两次也不触发熔断（计数已重置）
    cb.record_failure()
    cb.record_failure()
    assert cb.state == "closed"
