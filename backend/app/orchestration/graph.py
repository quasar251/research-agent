"""调度模块：LangGraph StateGraph 编排（四阶段节点 + 边）。

architecture.md §5 边界 2：图编排交给 LangGraph，Supervisor 逻辑自研跑在节点里。
当前为线性四阶段 align → collect → verify → synthesize；缺口重派条件边（④）后续加。
"""
from __future__ import annotations

from langgraph.graph import END, StateGraph

from ..agents.collector import make_collector_node
from ..agents.lead import make_lead_node
from ..agents.synthesizer import make_synthesizer_node
from ..agents.verifier import make_verifier_node
from ..llm.client import LLMClient
from ..state.graph import AgentState


def build_graph(llm: LLMClient, checkpointer=None):
    """构建四阶段调研图。可传入 checkpointer（如 SqliteSaver）以支持断点续跑。"""
    g = StateGraph(AgentState)

    g.add_node("align", make_lead_node(llm))
    g.add_node("collect", make_collector_node(llm))
    g.add_node("verify", make_verifier_node(llm))
    g.add_node("synthesize", make_synthesizer_node(llm))

    g.set_entry_point("align")
    g.add_edge("align", "collect")
    g.add_edge("collect", "verify")
    g.add_edge("verify", "synthesize")
    g.add_edge("synthesize", END)

    return g.compile(checkpointer=checkpointer)
