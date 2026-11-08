"""记忆检索测试：余弦相似度、向量索引、runtime 接入。"""
from backend.app.memory.retrieval import cosine, MemoryIndex
from backend.app.memory.store import LongTermMemory
from backend.app.runtime import ResearchRuntime


def test_cosine_similarity():
    assert cosine([1.0, 0.0], [1.0, 0.0]) > 0.99
    assert cosine([1.0, 0.0], [0.0, 1.0]) < 0.01


def test_memory_index_search_orders_by_similarity():
    idx = MemoryIndex()
    idx.add(LongTermMemory(id="m1", namespace="结论", content="市场规模"), [1.0, 0.0])
    idx.add(LongTermMemory(id="m2", namespace="结论", content="竞争格局"), [0.0, 1.0])
    result = idx.search([0.9, 0.1], top_k=1)
    assert result[0].id == "m1"


class MockEmbedding:
    """把文本 hash 成一维向量，供检索测试（不调真实 API）。"""

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(hash(t) % 100) / 100.0] for t in texts]


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
            return {"claims": [{"text": "市场规模约 52 亿美元", "evidence_urls": ["https://x.com"]}]}
        if tool_name == "submit_verdict":
            return {"strength": "solid"}
        if tool_name == "submit_report":
            return {"summary": "报告摘要"}
        return {}


def test_runtime_distills_and_retrieves():
    runtime = ResearchRuntime(MockLLM(), embedding=MockEmbedding())
    runtime.run("r1", "u1", "调研 AI")

    memories = runtime.get_memories()
    assert len(memories) >= 1

    # 检索与蒸馏结论语义相关的记忆
    result = runtime.retrieve(memories[0].content, top_k=1)
    assert len(result) == 1


def test_runtime_retrieve_without_embedding_returns_empty():
    runtime = ResearchRuntime(MockLLM())  # 无 embedding
    runtime.run("r1", "u1", "调研 AI")
    assert runtime.retrieve("任意查询") == []
