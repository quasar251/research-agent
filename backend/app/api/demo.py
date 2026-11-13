"""演示数据 API：把前端 mock 数据搬到 Python 后端统一模拟。

前端（旧版 DAG 演示）通过 /demo/* 获取全部业务数据：
- GET  /demo/bootstrap  → reports / suggestions / history / stages 一次性下发
- POST /demo/match      → 按用户意图匹配报告（替代前端关键词匹配）
- POST /demo/follow     → 模拟追问回答
- POST /demo/action     → 模拟 HITL 审批（记录 confirm / retry 及反馈）

数据本体在 app/demo_data.json，由 scripts 从旧版前端源码导出，
保证与 UI 渲染契约完全一致；不含任何真实 LLM 调用。
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/demo")

_DATA_PATH = Path(__file__).resolve().parent.parent / "demo_data.json"
_DATA: dict = json.loads(_DATA_PATH.read_text(encoding="utf-8"))

# 关键词 → 报告 id（后端统一维护，前端不再硬编码）
_MATCH_RULES: list[tuple[tuple[str, ...], str]] = [
    (("机器人", "具身", "humanoid"), "humanoid"),
    (("钙钛矿", "光伏", "perovskite"), "perovskite"),
    (("agent", "智能体", "ai"), "ai-agent"),
]

# 审批动作流水（演示用，进程内记录）
_ACTION_LOG: list[dict] = []


class MatchRequest(BaseModel):
    query: str


class FollowRequest(BaseModel):
    question: str
    report_id: str = "ai-agent"
    model: str = "pro"


class ActionRequest(BaseModel):
    action: str  # confirm / retry
    report_id: str = "ai-agent"
    stage: int = 0
    feedback: str = ""


def _report(report_id: str) -> dict:
    return _DATA["reports"].get(report_id) or _DATA["reports"]["ai-agent"]


@router.get("/bootstrap")
def bootstrap() -> dict:
    """一次性下发全部静态演示数据，前端启动时注入 mock.ts。"""
    return {
        "reports": _DATA["reports"],
        "suggestions": _DATA["suggestions"],
        "history": _DATA["history"],
        "stages": _DATA["stages"],
        "server_time": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


@router.post("/match")
def match_report(req: MatchRequest) -> dict:
    """按调研意图选报告，返回 id + 完整 Report。"""
    q = (req.query or "").lower()
    report_id = "ai-agent"
    for keywords, rid in _MATCH_RULES:
        if any(k in q for k in keywords):
            report_id = rid
            break
    return {"report_id": report_id, "report": _report(report_id)}


@router.post("/follow")
def follow(req: FollowRequest) -> dict:
    """模拟追问回答：基于报告数据生成 label + bullets（对齐前端 followReply 契约）。"""
    r = _report(req.report_id)
    model_label = {
        "pro": "研小报 Pro",
        "turbo": "研小报 Turbo",
        "claude": "Claude",
        "gpt": "GPT-4o",
    }.get(req.model, "研小报 Pro")
    q = (req.question or "").strip() or "该议题"
    takeaway = r["takeaways"][0]["text"] if r["takeaways"] else ""
    return {
        "label": f"追问 · {r['domain']} · {model_label}",
        "bullets": [
            f"关于「{q}」，{model_label} 结合 {r['domain']} 已有结论作答：{takeaway}",
            f"建议下一步：围绕「{q}」补充近 12 个月来源，并对头部厂商公开口径做交叉核对（本演示数据由 Python 后端模拟）。",
        ],
    }


@router.post("/action")
def action(req: ActionRequest) -> dict:
    """模拟 HITL 审批：记录确认/打回及反馈，返回提示语。"""
    record = {
        "action": req.action,
        "report_id": req.report_id,
        "stage": req.stage,
        "feedback": req.feedback,
        "at": time.strftime("%H:%M:%S"),
    }
    _ACTION_LOG.append(record)
    if req.action == "retry":
        msg = f"已收到打回意见「{req.feedback or '重新处理'}」，Agent 已按意见重算。"
    else:
        msg = "审批通过，继续执行下一阶段。"
    return {"ok": True, "message": msg, "log_size": len(_ACTION_LOG)}


@router.get("/actions")
def actions() -> list[dict]:
    """查看审批流水（便于验证前端确实把动作发到了后端）。"""
    return list(_ACTION_LOG)
