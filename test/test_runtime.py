"""运行时测试：埋点审计事件 + 指标采集。"""
from backend.app.runtime import ResearchRuntime


class MockLLM:
    model = "mock"

    def complete(self, messages, max_tokens: int = 1024) -> str:
        return "{}"

    def complete_structured(self, messages, tool_name, input_schema, max_tokens=1024) -> dict:
        if tool_name == "submit_plan":
            return {
                "companies": ["公司A"],
                "dims": ["市场规模"],
                "subtasks": [
                    {"id": "t1", "question": "规模", "company": "公司A", "dim": "市场规模", "dependencies": []}
                ],
            }
        if tool_name == "submit_claims":
            return {"claims": [{"text": "规模 52 亿", "evidence_urls": ["https://x.com"]}]}
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_report":
            return {"summary": "报告摘要"}
        return {}


def test_runtime_records_audit_and_metrics():
    runtime = ResearchRuntime(MockLLM())
    result = runtime.run("r1", "u1", "调研 AI")

    audit = runtime.get_audit()
    types = [e.type for e in audit]
    assert "任务开始" in types
    assert "任务完成" in types
    # 阶段推进至少经历 collect / verify / synthesize 三次变化
    stages = [e.subject for e in audit if e.type == "阶段推进"]
    assert len(stages) >= 3

    # 最终状态覆盖度达标
    assert result["matrix"].coverage == 1.0

    # 收尾蒸馏：verified 结论沉淀为长期记忆
    memories = runtime.get_memories()
    assert len(memories) >= 1
    assert memories[0].namespace == "结论"
