// 行业调研助手 —— 全部为虚拟数据（Mock Data）

export interface Step {
  label: string;
  detail: string;
}

export type EvidenceStrength = 'solid' | 'inferred' | 'consensus' | 'divided';

export const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  solid: '实锤',
  inferred: '推断',
  consensus: '共识',
  divided: '分歧',
};

export interface Citation {
  title: string;
  source: string;
  date: string;
  strength: EvidenceStrength;
}

export interface Takeaway {
  text: string;
  strength: EvidenceStrength;
  refs: number[];
}

export interface SeriesPoint {
  year: string;
  value: number;
}

export interface BarItem {
  name: string;
  pct: number;
}

export type SectionKind = 'prose' | 'bullets' | 'chart' | 'bars' | 'swot' | 'risk';
export type ReportDepth = 'simple' | 'deep';

export interface SwotItem {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface RiskItem {
  name: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
}

export interface Section {
  heading: string;
  kind: SectionKind;
  // 报告深度：'deep' 标记的章节仅在深度模式下展示，缺省视为 simple（两档都展示）
  depth?: ReportDepth;
  paragraphs?: string[];
  bullets?: string[];
  series?: SeriesPoint[];
  unit?: string;
  bars?: BarItem[];
  // 结构化组件（Mock）
  swot?: SwotItem;
  risks?: RiskItem[];
  // 单节深挖的补充分析（Mock）
  deepDive?: string[];
}

export interface Report {
  id: string;
  topic: string;
  domain: string;
  updatedAt: string;
  tags: string[];
  headline: { label: string; value: string };
  cagr: string;
  summary: string;
  takeaways: Takeaway[];
  followUpHints: string[];
  citations: Citation[];
  sections: Section[];
}

export interface HistoryItem {
  id: string;
  title: string;
  domain: string;
  time: string;
}

export const reports: Record<string, Report> = {
  'ai-agent': {
    id: 'ai-agent',
    topic: 'AI 智能体（AI Agent）行业',
    domain: 'AI 智能体',
    updatedAt: '2026-11-06',
    tags: ['AI Agent', '大模型', 'SaaS'],
    headline: { label: '2025 全球市场规模', value: '52 亿美元' },
    cagr: '72%',
    summary:
      '全球 AI Agent 市场处于爆发前夜，2025 年规模约 52 亿美元，预计 2028 年突破 300 亿美元，三年 CAGR 约 72%。价值捕获正从「模型能力」上移至「任务成功率 + 生态集成」。',
    takeaways: [
      { text: '2025 年全球 AI Agent 市场规模约 52 亿美元，预计 2028 年达 300 亿美元，三年 CAGR ≈ 72%。', strength: 'solid', refs: [0, 1] },
      { text: '中游「Agent 框架 / 编排平台」成为价值捕获关键环节，工程门槛集中于工具调用与多步推理的稳定性。', strength: 'inferred', refs: [2] },
      { text: '竞争从「模型参数」转向「任务成功率 + 生态集成」，垂直行业 Agent 率先规模化落地。', strength: 'consensus', refs: [2, 3] },
      { text: '头部厂商以「平台化 + 插件市场」锁定分发入口，长尾厂商转向细分场景深耕。', strength: 'inferred', refs: [3] },
    ],
    followUpHints: ['Agent 与 Copilot 的核心区别？', '哪类场景付费意愿最强？', '头部厂商的护城河是什么？'],
    citations: [
      { title: 'Gartner：AI 技术成熟度曲线', source: 'Gartner（演示来源）', date: '2026-10', strength: 'solid' },
      { title: '全球 AI Agent 与智能自动化支出指南', source: 'IDC（演示来源）', date: '2026-09', strength: 'solid' },
      { title: '中国 AI Agent 行业白皮书', source: '36氪研究院（演示来源）', date: '2026-08', strength: 'consensus' },
      { title: 'AI Agent 产业链深度报告', source: '券商研究所（演示来源）', date: '2026-07', strength: 'inferred' },
    ],
    sections: [
      {
        heading: '行业概览',
        kind: 'prose',
        paragraphs: [
          'AI 智能体（Agent）指能够感知环境、自主规划并调用工具完成多步任务的软件实体，被视为大模型从「对话」走向「行动」的关键形态。2025 年起，随着工具调用（Function Calling）、多步推理与记忆能力的成熟，Agent 从演示性 Demo 进入企业级落地阶段。',
          '当前行业的确定性来自两端：底层大模型持续降价让 Agent 的调用成本快速收敛，而企业侧对「提效而非对话」的诉求催生出可量化的 ROI 场景，客服、营销、代码开发与内部运营成为第一批规模化付费场景。',
        ],
        deepDive: [
          'Agent 与 Copilot 的核心差异在于「自主权边界」：Copilot 以人主导、AI 辅助为主，Agent 则把规划 → 执行 → 校验整条链路交给模型。',
          '从付费意愿看，客服与代码开发场景的 ROI 最可量化，单位人效提升通常落在 20–40% 区间，是首批规模化付费的切入点。',
        ],
      },
      {
        heading: '市场规模',
        kind: 'chart',
        series: [
          { year: '2024', value: 18 },
          { year: '2025', value: 52 },
          { year: '2026', value: 98 },
          { year: '2027', value: 176 },
          { year: '2028', value: 305 },
        ],
        unit: '亿美元',
      },
      {
        heading: '产业链图谱',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '上游 · 算力与模型：GPU 集群、基础大模型能力供给，决定 Agent 的「智力上限」与单次调用成本。',
          '中游 · 框架与平台：工具调用、编排、记忆、评测与部署平台，是当前融资与竞争最密集的环节。',
          '下游 · 垂直应用：客服、营销、代码、金融、政务等场景，以「行业知识 + 工作流」构建护城河。',
          '配套 · 数据与安全：企业知识治理、权限隔离、可观测性与合规审计，成为企业采购的关键否决项。',
        ],
      },
      {
        heading: '竞争格局',
        kind: 'bars',
        depth: 'deep',
        bars: [
          { name: 'OpenAI（Operator / Agents）', pct: 24 },
          { name: '微软（Copilot Studio）', pct: 19 },
          { name: 'Google（Gemini / Mariner）', pct: 15 },
          { name: 'Anthropic（Claude / Computer Use）', pct: 11 },
          { name: '字节跳动（扣子 / 豆包）', pct: 9 },
          { name: '阿里（百炼 / 魔搭）', pct: 7 },
          { name: '其他', pct: 15 },
        ],
        deepDive: [
          '头部厂商的护城河已从模型参数转向「插件生态 + 企业级编排」：谁拥有更完整的工具生态与更低的接入成本，谁就掌握分发入口。',
          '长尾厂商的突围路径集中在垂直行业知识库与合规能力，单一行业深度高于通用平台的广度。',
        ],
      },
      {
        heading: '趋势研判',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '从「单点工具」到「端到端工作流」：Agent 的价值衡量指标从对话轮次转向任务完成率与端到端时间。',
          '多 Agent 协作成为主流架构：规划者 + 执行者分工，通过共享记忆与仲裁机制提升复杂任务的稳定率。',
          '成本结构再平衡：推理成本下降后，数据治理、评测与运维成本占比持续上升，工程能力重新成为壁垒。',
        ],
      },
      {
        heading: '风险提示',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '幻觉与不可控行为仍制约高价值、低容错场景的大规模采用。',
          '开源模型快速追赶可能压缩闭源平台的分发溢价。',
          '数据安全与合规要求抬高企业私有化交付的边际成本。',
        ],
      },
      {
        heading: 'SWOT 分析',
        kind: 'swot',
        depth: 'deep',
        swot: {
          strengths: [
            '大模型调用成本快速下降，Agent 落地门槛持续降低',
            '工具调用与多步推理能力成熟，任务成功率显著提升',
          ],
          weaknesses: [
            '幻觉与不可控行为仍制约高价值场景',
            '端到端稳定性与可观测性工程门槛较高',
          ],
          opportunities: [
            '企业「提效」诉求带来可量化的 ROI 场景',
            '垂直行业 Agent 率先规模化付费',
          ],
          threats: [
            '开源模型快速追赶压缩闭源平台溢价',
            '数据安全与合规抬高私有化交付成本',
          ],
        },
      },
    ],
  },

  humanoid: {
    id: 'humanoid',
    topic: '人形机器人产业链',
    domain: '人形机器人',
    updatedAt: '2026-11-05',
    tags: ['人形机器人', '具身智能', '制造'],
    headline: { label: '2025 中国出货量', value: '2.3 万台' },
    cagr: '124%',
    summary:
      '中国人形机器人出货量 2025 年约 2.3 万台，2030 年有望突破 130 万台，CAGR 约 124%。成本下探是放量的核心变量，单机 BOM 正从 60 万元向 15–20 万元收敛。',
    takeaways: [
      { text: '2025 年中国人形机器人出货量约 2.3 万台，预计 2030 年突破 130 万台，CAGR ≈ 124%。', strength: 'solid', refs: [0] },
      { text: '成本下探是放量核心变量：单机 BOM 从 60 万向 15–20 万元收敛，谐波减速器与灵巧手降本空间最大。', strength: 'inferred', refs: [1] },
      { text: '场景落地遵循「制造业牵引 → 商用服务渗透 → 家庭陪伴长尾」路径，汽车工厂成为首批规模化场景。', strength: 'consensus', refs: [0, 2] },
      { text: '投资重心从「整机」上移至「零部件（丝杠 / 传感器）+ 具身大脑」。', strength: 'inferred', refs: [1, 2] },
    ],
    followUpHints: ['降本的关键零部件是什么？', '汽车工厂落地进展如何？', '灵巧手的价值量有多大？'],
    citations: [
      { title: '人形机器人产业年度报告', source: '高工机器人（演示来源）', date: '2026-10', strength: 'solid' },
      { title: '具身智能与灵巧手专题', source: '中信建投（演示来源）', date: '2026-09', strength: 'inferred' },
      { title: '人形机器人供应链图谱', source: '东吴证券（演示来源）', date: '2026-06', strength: 'consensus' },
    ],
    sections: [
      {
        heading: '行业概览',
        kind: 'prose',
        paragraphs: [
          '人形机器人被视为具身智能的终极载体，2025 年行业正式从「样机展示」迈入「小批量交付」。以汽车工厂、3C 装配为代表的制造业场景率先给出可量化的节拍与良率需求，成为第一批规模化的真实订单来源。',
          '产业化的核心矛盾是「性能 - 成本 - 场景」三角：只有当单机成本进入客户可接受区间，且任务成功率满足产线节拍，人形机器人才能在更多垂直场景复制推广。',
        ],
        deepDive: [
          '降本的关键在「传动与执行」：谐波减速器与滚柱丝杠占单机 BOM 比例最高，国产化替代后成本可下探 30–50%。',
          '汽车工厂是目前落地确定性最高的场景，主打「搬运 + 上下料 + 简单装配」，对重复定位精度与节拍的验收标准相对清晰。',
        ],
      },
      {
        heading: '出货量预测',
        kind: 'chart',
        series: [
          { year: '2024', value: 0.6 },
          { year: '2025', value: 2.3 },
          { year: '2026', value: 9 },
          { year: '2027', value: 27 },
          { year: '2028', value: 65 },
        ],
        unit: '万台',
      },
      {
        heading: '产业链图谱',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '上游 · 核心零部件：谐波减速器、行星滚柱丝杠、力/触觉传感器、空心杯电机，构成主要 BOM 与毛利率来源。',
          '中游 · 本体与整机：运动控制、整机集成与量产能力，龙头公司开始自研核心关节以摊薄成本。',
          '下游 · 场景与应用：汽车工厂、物流分拣、商用服务与家庭陪伴，付费意愿与场景成熟度差异巨大。',
          '配套 · 具身大脑：视觉语言模型 + 操作数据集，决定机器人「泛化能力」的天花板。',
        ],
      },
      {
        heading: '整机厂商格局',
        kind: 'bars',
        depth: 'deep',
        bars: [
          { name: '优必选', pct: 16 },
          { name: '宇树科技', pct: 14 },
          { name: '特斯拉（Optimus）', pct: 13 },
          { name: '智元机器人', pct: 10 },
          { name: '傅利叶智能', pct: 8 },
          { name: 'Figure AI', pct: 7 },
          { name: '其他', pct: 32 },
        ],
        deepDive: [
          '头部厂商的差异已从「能否动起来」转向「能否在真实产线上以可接受的良率连续运行」，量产工程能力成为分水岭。',
          '自研核心关节成为龙头的共同选择：既能摊薄 BOM，也能在供应链上获得更高的议价与交付确定性。',
        ],
      },
      {
        heading: '趋势研判',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '降本主线清晰：从「丝杠、减速器国产化」到「零部件复用平台化」，单机成本年降 20–30%。',
          '具身智能数据集成为新壁垒：高质量操作数据的采集与合成，是拉开算法差距的核心变量。',
          '制造场景先行、服务场景跟进，家庭场景商业化仍需跨越安全与价格两道门槛。',
        ],
      },
      {
        heading: '风险提示',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '量产爬坡不及预期导致零部件价格战提前到来。',
          '具身智能模型泛化能力不足，任务成功率未达产线节拍要求。',
          '海外供应链与出口管制政策的不确定性。',
        ],
      },
      {
        heading: '风险矩阵',
        kind: 'risk',
        depth: 'deep',
        risks: [
          { name: '量产爬坡不及预期', likelihood: 4, impact: 5 },
          { name: '具身智能模型泛化不足', likelihood: 4, impact: 4 },
          { name: '零部件价格战提前到来', likelihood: 3, impact: 4 },
          { name: '海外供应链与出口管制', likelihood: 3, impact: 3 },
          { name: '家庭场景安全与价格门槛', likelihood: 2, impact: 3 },
        ],
      },
    ],
  },

  perovskite: {
    id: 'perovskite',
    topic: '钙钛矿光伏电池',
    domain: '钙钛矿光伏',
    updatedAt: '2026-11-04',
    tags: ['光伏', '钙钛矿', '新能源'],
    headline: { label: '2025 新增产能', value: '8 GW' },
    cagr: '约 65%',
    summary:
      '钙钛矿单结组件量产效率已达 18–20%，叠层电池实验室效率突破 34%。2025 年新增产能约 8 GW，预计 2028 年达 60 GW，GW 级产线进入跑通验证期。',
    takeaways: [
      { text: '单结钙钛矿组件量产效率已达 18–20%，叠层电池实验室效率突破 34%，成本较晶硅更低。', strength: 'solid', refs: [0, 1] },
      { text: '2025 年钙钛矿（含叠层）新增产能约 8 GW，预计 2028 年达 60 GW，GW 级产线进入跑通验证期。', strength: 'consensus', refs: [0] },
      { text: '稳定性与大面积效率损失仍是量产最大瓶颈，组件寿命正从 1 万小时向 3 万小时（IEC 标准）攻关。', strength: 'divided', refs: [0, 2] },
      { text: '竞争由「效率军备竞赛」转向「工艺良率 + 设备国产化」，蒸镀 / 涂布设备厂商率先受益。', strength: 'inferred', refs: [2] },
    ],
    followUpHints: ['叠层电池的商业化节奏？', '设备国产化到什么程度？', '稳定性的核心技术路线？'],
    citations: [
      { title: '钙钛矿光伏产业化进展', source: 'CPIA（演示来源）', date: '2026-10', strength: 'solid' },
      { title: '钙钛矿电池能量转换效率纪录表', source: 'NREL（演示来源）', date: '2026-09', strength: 'solid' },
      { title: '钙钛矿设备与工艺专题', source: '华西证券（演示来源）', date: '2026-07', strength: 'inferred' },
    ],
    sections: [
      {
        heading: '行业概览',
        kind: 'prose',
        paragraphs: [
          '钙钛矿光伏凭借其低温溶液法制备、短流程与可叠层等特性，被视为打破晶硅成本天花板的下一代光伏技术。2025 年单结组件效率与稳定性双双突破，多家企业的 GW 级产线进入中试与量产验证。',
          '与传统晶硅的竞争并非「替代」而是「并存 + 叠层」：晶硅/钙钛矿叠层可将组件效率进一步提升，是对既有制程的增强而非颠覆。',
        ],
        deepDive: [
          '叠层电池是效率的商业化主线：晶硅 / 钙钛矿叠层可在现有 PERC/TOPCon 产线上做增量升级，与存量产能协同而非冲突。',
          '设备国产化进展快于预期：蒸镀与涂布设备已有多条自制产线跑通，核心工艺参数逐步收敛，是降本的关键支点。',
        ],
      },
      {
        heading: '新增产能预测',
        kind: 'chart',
        series: [
          { year: '2024', value: 1.2 },
          { year: '2025', value: 8 },
          { year: '2026', value: 18 },
          { year: '2027', value: 36 },
          { year: '2028', value: 60 },
        ],
        unit: 'GW',
      },
      {
        heading: '产业链图谱',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '上游 · 材料与设备：前驱体材料、靶材、蒸镀机、涂布机与激光划线设备，国产化率快速提升。',
          '中游 · 电池与组件：单结 / 叠层电池工艺、大面积成膜与封装，良率是量产竞争的分水岭。',
          '下游 · 电站与应用：BIPV、汽车集成与柔性场景，差异化溢价高于传统地面电站。',
          '配套 · 检测与标准：稳定性测试标准与户外实证数据，影响下游规模化采购信心。',
        ],
      },
      {
        heading: '厂商布局',
        kind: 'bars',
        depth: 'deep',
        bars: [
          { name: '协鑫光电', pct: 22 },
          { name: '仁烁光能', pct: 16 },
          { name: '极电光能', pct: 14 },
          { name: '纤纳光电', pct: 12 },
          { name: '曜能科技', pct: 9 },
          { name: '其他', pct: 27 },
        ],
        deepDive: [
          '竞争焦点从「单点效率纪录」转向「GW 级产线的平均良率与出货一致性」，实验室效率与量产效率的差值正在收窄。',
          '头部厂商开始绑定设备与材料供应商共建生态，以锁定工艺经验与扩产节奏，形成先发壁垒。',
        ],
      },
      {
        heading: '趋势研判',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '叠层化是效率主线：晶硅 / 钙钛矿叠层组件效率持续上探，打开地面电站的应用空间。',
          '稳定性质变即将发生：封装工艺与材料体系成熟后，组件寿命与可靠性将不再是致命短板。',
          '设备国产化成为降本关键：蒸镀与涂布设备的工艺成熟度，直接决定 GW 级产线的良率与成本。',
        ],
      },
      {
        heading: '风险提示',
        kind: 'bullets',
        depth: 'deep',
        bullets: [
          '稳定性和大面积效率损失尚未彻底解决，量产良率可能低于预期。',
          '光伏行业整体产能过剩可能压制钙钛矿的溢价空间。',
          '材料含铅问题面临环保与回收的政策压力。',
        ],
      },
    ],
  },
};

export const history: HistoryItem[] = [
  { id: 'ai-agent', title: 'AI 智能体（AI Agent）', domain: 'AI 智能体', time: '今天 14:20' },
  { id: 'humanoid', title: '人形机器人产业链', domain: '人形机器人', time: '昨天 09:41' },
  { id: 'perovskite', title: '钙钛矿光伏电池', domain: '钙钛矿光伏', time: '11-04 16:05' },
];

export const suggestions: string[] = ['AI Agent 行业', '人形机器人产业链', '钙钛矿光伏'];

export function buildStepsFor(r: Report, depth: ReportDepth): Step[] {
  if (depth === 'simple') {
    return [
      { label: '意图解析', detail: `解析研究主题「${r.domain}」· 确定简版调研框架` },
      { label: '快速检索', detail: `检索 ${r.citations.length} 份来源 · ${r.tags.slice(0, 2).join(' / ')}` },
      { label: '生成简报', detail: `输出速览结论与核心指标` },
    ];
  }
  return [
    { label: '意图解析', detail: `解析研究主题「${r.domain}」· 拆解调研框架与关键词` },
    { label: '信息检索', detail: `检索 ${r.citations.length + 2} 份来源 · 覆盖 ${r.tags.join(' / ')}` },
    { label: '交叉分析', detail: `对比核心厂商数据 · 校准口径与趋势基线` },
    { label: '深度研判', detail: `产业链拆解 · 竞争格局 · 趋势与风险` },
    { label: '生成报告', detail: `撰写调研纪要 · 输出结构化深度报告` },
  ];
}

/* ---------------- 多 Agent 运行时（对齐 agent.md 六模块语义，Mock） ---------------- */
export type AgentRole = 'lead' | 'collector' | 'verifier' | 'synthesizer';
export type StageName = 'align' | 'collect' | 'verify' | 'synthesize';
export type CellStatus = 'covered' | 'gap' | 'unresolved';

export interface MatrixCell {
  company: string;
  dim: string;
  status: CellStatus;
  summary: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  source: string;
  credibility: number;
  level: 1 | 2 | 3;
}

export interface ClaimItem {
  id: string;
  text: string;
  strength: EvidenceStrength;
  evidenceIds: string[];
  role: AgentRole;
}

export interface ResearchRun {
  intent: string;
  companies: string[];
  dims: string[];
  cells: MatrixCell[];
  coverage: number;
  evidences: EvidenceItem[];
  claims: ClaimItem[];
}

export function buildRunFor(r: Report, depth: ReportDepth): ResearchRun {
  const barsSection = r.sections.find((s) => s.kind === 'bars');
  const companyNames = (barsSection?.bars ?? []).slice(0, 4).map((b) => b.name.split('（')[0].split('(')[0]);
  const companies =
    companyNames.length >= 3 ? companyNames : [`${r.domain}头部A`, `${r.domain}头部B`, `${r.domain}新锐C`];

  const dims = r.sections
    .filter((s) => ['prose', 'chart', 'bullets', 'bars'].includes(s.kind))
    .slice(1, 5)
    .map((s) => s.heading);

  const cells: MatrixCell[] = [];
  companies.forEach((company, ci) => {
    dims.forEach((dim, di) => {
      let status: CellStatus = 'covered';
      if (di === dims.length - 1 && (ci === 0 || ci === companies.length - 1)) status = 'gap';
      if (depth === 'deep' && ci === companies.length - 1 && di === 0) status = 'unresolved';
      const summary = status === 'covered' ? `${company} · ${dim} 已覆盖` : status === 'gap' ? '缺口 · 待补充' : '口径待确认';
      cells.push({ company, dim, status, summary });
    });
  });

  const covered = cells.filter((c) => c.status === 'covered').length;
  const coverage = cells.length ? Math.round((covered / cells.length) * 100) / 100 : 0;

  const evidences: EvidenceItem[] = r.citations.map((c, i) => ({
    id: `ev-${i + 1}`,
    title: c.title,
    source: c.source,
    credibility: c.strength === 'solid' ? 0.9 : c.strength === 'consensus' ? 0.72 : 0.55,
    level: (c.strength === 'solid' ? 1 : 2) as 1 | 2 | 3,
  }));

  const claims: ClaimItem[] = r.takeaways.map((t, i) => ({
    id: `cl-${i + 1}`,
    text: t.text,
    strength: t.strength,
    evidenceIds: t.refs.map((ri) => `ev-${ri + 1}`),
    role: (i % 2 === 0 ? 'collector' : 'verifier') as AgentRole,
  }));

  return {
    intent: `调研 ${r.domain}`,
    companies,
    dims,
    cells,
    coverage,
    evidences,
    claims,
  };
}