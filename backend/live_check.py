"""联调脚本：用 .env 真实配置分步验证 LLM 结构化输出、embedding、完整调研。

运行：python backend/live_check.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import Settings  # noqa: E402
from app.llm.client import from_settings as llm_from_settings  # noqa: E402
from app.memory.embedding import from_settings as emb_from_settings  # noqa: E402
from app.runtime import ResearchRuntime  # noqa: E402
from app.tools.search import DuckDuckGoSearch  # noqa: E402

_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "companies": {"type": "array", "items": {"type": "string"}},
        "dims": {"type": "array", "items": {"type": "string"}},
        "subtasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "question": {"type": "string"},
                    "company": {"type": "string"},
                    "dim": {"type": "string"},
                    "dependencies": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["id", "question", "company", "dim"],
            },
        },
    },
    "required": ["companies", "dims", "subtasks"],
}


def main() -> None:
    settings = Settings.from_env()
    print(f"[配置] LLM: {settings.llm.model} @ {settings.llm.base_url}")
    print(f"[配置] Embedding: {settings.embedding.model} @ {settings.embedding.base_url}")

    llm = llm_from_settings(settings)
    embedding = emb_from_settings(settings)

    # 1. LLM 结构化输出（tool use）
    print("\n=== 1. LLM 结构化输出 ===")
    try:
        plan = llm.complete_structured(
            [{"role": "user", "content": "调研意图：AI 智能体行业。请生成研究计划。"}],
            tool_name="submit_plan",
            input_schema=_PLAN_SCHEMA,
        )
        print("OK → companies:", plan.get("companies"))
        print("OK → dims:", plan.get("dims"))
        print("OK → subtasks 数:", len(plan.get("subtasks", [])))
    except Exception as e:  # noqa: BLE001
        print("FAIL:", type(e).__name__, e)

    # 2. Embedding
    print("\n=== 2. Embedding ===")
    try:
        vecs = embedding.embed(["市场规模", "竞争格局"])
        print(f"OK → {len(vecs)} 个向量, 维度={len(vecs[0])}")
    except Exception as e:  # noqa: BLE001
        print("FAIL:", type(e).__name__, e)

    # 3. 完整调研
    print("\n=== 3. 完整调研 ===")
    try:
        runtime = ResearchRuntime(llm, embedding=embedding, search=DuckDuckGoSearch())
        result = runtime.run("live-1", "demo", "AI 智能体行业调研")
        matrix = result.get("matrix")
        print("覆盖度:", matrix.coverage if matrix else "N/A")
        print("结论数:", len(result.get("claims", [])))
        report = result.get("report")
        print("报告:", (getattr(report, "summary", "") or "")[:200])
        print("记忆数:", len(runtime.get_memories()))
    except Exception as e:  # noqa: BLE001
        print("FAIL:", type(e).__name__, e)


if __name__ == "__main__":
    main()
