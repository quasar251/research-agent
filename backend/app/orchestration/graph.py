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
from ..llm.router import ModelRouter
from ..security.gate import PermissionGate
from ..skill.registry import SkillRegistry
from ..state.graph import AgentState
from ..state.schema import AgentRole
from ..tools.search import SearchProvider
from .supervisor import has_pending_collect


def _route_after_verify(state: AgentState) -> str:
    """verify 后路由：仍有待搜集缺口 → 回 collect；否则 → synthesize。"""
    return "collect" if has_pending_collect(state.get("subtasks", [])) else "synthesize"


def build_graph(
    llm: LLMClient,
    checkpointer=None,
    search: SearchProvider | None = None,
    skill_registry: SkillRegistry | None = None,
    router: ModelRouter | None = None,
    gate: PermissionGate | None = None,
):
    """构建四阶段调研图（含缺口重派循环）。可传入 checkpointer 支持断点续跑。

    模型路由（s08）：按角色解析不同档位的 client，未注入 router 时默认单模型。
    权限判定（s04）：gate 横切工具调用，未注入时跳过判定。
    """
    r = router or ModelRouter(llm)
    g = StateGraph(AgentState)

    g.add_node("align", make_lead_node(r.resolve(AgentRole.LEAD), skill_registry))
    g.add_node(
        "collect",
        make_collector_node(r.resolve(AgentRole.COLLECTOR), search, skill_registry, gate),
    )
    g.add_node("verify", make_verifier_node(r.resolve(AgentRole.VERIFIER), skill_registry))
    g.add_node("synthesize", make_synthesizer_node(r.resolve(AgentRole.SYNTHESIZER), skill_registry))

    g.set_entry_point("align")
    g.add_edge("align", "collect")
    g.add_edge("collect", "verify")
    g.add_conditional_edges(
        "verify",
        _route_after_verify,
        {"collect": "collect", "synthesize": "synthesize"},
    )
    g.add_edge("synthesize", END)

    return g.compile(checkpointer=checkpointer)
