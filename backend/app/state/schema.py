"""状态模块：台账实体 schema。

本文是设计真源 `agent-core.md` §4 的落地，定义调研任务的图状态与台账实体。

引用语义：所有台账实体用**全局唯一 id** 标识；跨实体引用一律用 id
（`*_refs` 字段），不内联对象，保证状态是单一事实源、无冗余副本。
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, computed_field


def _utcnow() -> datetime:
    """统一的 UTC 时间戳，用于溯源字段。"""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# 枚举
# ---------------------------------------------------------------------------


class AgentRole(str, Enum):
    """四个 Agent 角色（见 `state.md` §1.1）。"""

    LEAD = "lead"                # 规划者
    COLLECTOR = "collector"      # 搜集
    VERIFIER = "verifier"        # 核查
    SYNTHESIZER = "synthesizer"  # 合成


class StageName(str, Enum):
    """四阶段（见 `state.md` §1.2）。"""

    ALIGN = "align"
    COLLECT = "collect"
    VERIFY = "verify"
    SYNTHESIZE = "synthesize"


class CellStatus(str, Enum):
    """研究矩阵格子状态。"""

    COVERED = "covered"        # 已覆盖
    GAP = "gap"                # 缺口
    UNRESOLVED = "unresolved"  # 无法解决


class TaskStatus(str, Enum):
    """子任务执行状态。"""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    UNRESOLVED = "unresolved"


class EvidenceStrength(str, Enum):
    """证据强度四档（见 `security.md` §5）。"""

    SOLID = "solid"            # 实锤
    INFERRED = "inferred"      # 推断
    CONSENSUS = "consensus"    # 共识
    DIVIDED = "divided"        # 分歧


class ClaimStatus(str, Enum):
    """结论状态。"""

    DRAFT = "draft"            # 草稿
    VERIFIED = "verified"      # 已验证
    DISTILLED = "distilled"    # 已沉淀（转正为长期记忆）


SourceLevel = Literal[1, 2, 3]  # 来源等级三级治理


# ---------------------------------------------------------------------------
# 台账实体
# ---------------------------------------------------------------------------


class MatrixCell(BaseModel):
    """研究矩阵的一个格子（公司 × 维度）。"""

    company: str
    dim: str
    status: CellStatus = CellStatus.GAP
    evidence_refs: list[str] = Field(default_factory=list)
    claim_refs: list[str] = Field(default_factory=list)
    summary: str = ""


class ResearchMatrix(BaseModel):
    """研究矩阵：公司清单 × 维度清单 的填充进度。"""

    companies: list[str] = Field(default_factory=list)
    dims: list[str] = Field(default_factory=list)
    cells: list[MatrixCell] = Field(default_factory=list)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def coverage(self) -> float:
        """覆盖度 0~1，由格子状态派生（covered 占比），驱动缺口填补。"""
        if not self.cells:
            return 0.0
        covered = sum(1 for c in self.cells if c.status == CellStatus.COVERED)
        return round(covered / len(self.cells), 4)


class Subtask(BaseModel):
    """子任务台账条目。"""

    id: str
    question: str
    role: AgentRole
    stage: StageName
    company: str  # 绑定的矩阵格子坐标（公司）
    dim: str      # 绑定的矩阵格子坐标（维度）
    status: TaskStatus = TaskStatus.PENDING
    dependencies: list[str] = Field(default_factory=list)
    retry_count: int = 0
    retry_limit: int = 3
    output_ref: str | None = None  # 指向结论台账 id


class Evidence(BaseModel):
    """证据台账条目：已采集来源的登记。"""

    id: str
    url: str
    fetched_at: datetime = Field(default_factory=_utcnow)
    credibility: float = Field(ge=0.0, le=1.0)
    source_level: SourceLevel = 2


class Claim(BaseModel):
    """结论台账条目（Claim）：带证据的结论。"""

    id: str
    text: str
    strength: EvidenceStrength
    evidence_refs: list[str] = Field(default_factory=list)
    role: AgentRole
    created_at: datetime = Field(default_factory=_utcnow)
    status: ClaimStatus = ClaimStatus.DRAFT


class HumanIntervention(BaseModel):
    """人工干预记录：谁在哪个检查点做了什么决策。"""

    checkpoint_id: str
    operator: str
    decision: str
    timestamp: datetime = Field(default_factory=_utcnow)


class Checkpoint(BaseModel):
    """检查点：super-step 的状态快照。"""

    id: str
    snapshot: dict
    timestamp: datetime = Field(default_factory=_utcnow)
    predecessor_id: str | None = None


# ---------------------------------------------------------------------------
# 根状态
# ---------------------------------------------------------------------------


class RootState(BaseModel):
    """根状态：把全部台账组织起来，含运行元数据。"""

    run_id: str
    user_id: str
    intent: str
    stage: StageName
    matrix: ResearchMatrix = Field(default_factory=ResearchMatrix)
    subtasks: list[Subtask] = Field(default_factory=list)
    evidences: list[Evidence] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    interventions: list[HumanIntervention] = Field(default_factory=list)
    checkpoints: list[Checkpoint] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 结构化报告（Synthesizer 产出，对齐前端 Report 接口）
# ---------------------------------------------------------------------------


class ReportTakeaway(BaseModel):
    """报告核心结论（对齐前端 Takeaway）。"""

    text: str
    strength: EvidenceStrength
    refs: list[int] = Field(default_factory=list)  # 指向 citations 下标


class ReportCitation(BaseModel):
    """报告引用（对齐前端 Citation）。"""

    title: str
    source: str
    date: str = ""
    strength: EvidenceStrength | None = None


class ReportModel(BaseModel):
    """结构化报告（对齐前端 Report 接口）。"""

    topic: str
    summary: str
    takeaways: list[ReportTakeaway] = Field(default_factory=list)
    citations: list[ReportCitation] = Field(default_factory=list)
    coverage: float = 0.0
