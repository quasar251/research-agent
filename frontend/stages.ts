import {
  STRENGTH_LABEL,
  type Report,
  type Section,
  type SwotItem,
  type ReportDepth,
} from './mock';
import { esc } from './common';

/* ================================================================
 * 五阶段调研内容构建（纯函数，由 report 数据驱动）
 * ----------------------------------------------------------------
 * 独立低耦合模块：不依赖任何运行时 / DOM 状态，只把 Report 转成
 * StageDef[]（执行卡片 + 结果摘要 + 审批提示），供 DAG 引擎消费。
 * ================================================================ */

const AGENT_COLOR: Record<string, string> = {
  Scout: 'var(--agent-s)',
  Analyst: 'var(--agent-a)',
  Critic: 'var(--agent-c)',
  Master: 'var(--agent-m)',
};
const AGENT_LETTER: Record<string, string> = { Scout: 'S', Analyst: 'A', Critic: 'C', Master: 'M' };

function miniItem(html: string): string {
  return `<div class="mini-item">${html}</div>`;
}

function miniIcon(agent: string): string {
  return `<span class="mini-icon" style="background:${AGENT_COLOR[agent]}">${AGENT_LETTER[agent]}</span>`;
}

/** 按深度过滤可见章节 */
function visibleSections(r: Report, depth: ReportDepth): Section[] {
  return depth === 'deep' ? r.sections : r.sections.filter((s) => s.depth !== 'deep');
}

function findSection(r: Report, depth: ReportDepth, kinds: Section['kind'][]): Section | undefined {
  const vis = visibleSections(r, depth);
  for (const k of kinds) {
    const s = vis.find((x) => x.kind === k);
    if (s) return s;
  }
  return undefined;
}

function swotGrid(swot: SwotItem): string {
  const cell = (title: string, items: string[], cls: string) => `
    <div class="swot-card ${cls}">
      <div class="swot-title">${title}</div>
      <ul class="swot-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>`;
  return `
    <div class="doc-h2" style="margin-top:20px;">SWOT 矩阵</div>
    <div class="swot-grid">
      ${cell('S - 优势', swot.strengths, 'swot-s')}
      ${cell('W - 劣势', swot.weaknesses, 'swot-w')}
      ${cell('O - 机会', swot.opportunities, 'swot-o')}
      ${cell('T - 威胁', swot.threats, 'swot-t')}
    </div>`;
}

export interface StageCard {
  title: string;
  logs: string[];
  ms: number;
}

export interface StageDef {
  /** 阶段标题（doc-h2） */
  title: string;
  /** 流式执行卡片（可多张） */
  cards: StageCard[];
  /** 阶段结果摘要 HTML */
  result: string;
  /** 审批提示语；为空表示该阶段无需 HITL */
  hitl: string | null;
}

/** 构建五阶段内容（数据驱动自 report）；简单模式走三阶段轻量管线 */
export function buildStages(r: Report, depth: ReportDepth): StageDef[] {
  if (depth === 'simple') return buildSimpleStages(r);
  const cites = r.citations.slice(0, 4);
  const docList = cites.map((c) => `《${c.title}》`).join('、');
  const swotSection = findSection(r, depth, ['swot']);
  const marketSection = findSection(r, depth, ['chart', 'bars']);
  const overview = findSection(r, depth, ['prose']);

  // 阶段一：任务拆解
  const tasks = [
    { title: '基础信息检索', desc: `搜集 ${r.domain} 行业概述、最新技术趋势及政策环境。`, agent: 'Scout' },
    { title: '市场数据抓取', desc: `提取 ${r.domain} 市场规模、头部厂商营收数据及增长率。`, agent: 'Scout' },
    { title: '产业链深度分析', desc: '绘制产业链图谱，分析上下游技术壁垒与议价能力。', agent: 'Analyst' },
    { title: 'SWOT 模型构建', desc: `结合市场数据，输出 ${r.domain} 的 SWOT 矩阵。`, agent: 'Analyst' },
  ];
  const taskList = `<div class="mini-list">` + tasks.map((t) =>
    miniItem(`${miniIcon(t.agent)}<div><strong>${esc(t.title)}：</strong>${esc(t.desc)}</div>`)
  ).join('') + `</div>`;

  const stage1: StageDef = {
    title: '阶段一 · 任务拆解',
    cards: [{
      title: 'Master 正在拆解调研任务...',
      logs: [
        `解析调研主题：${r.topic}…`,
        '规划任务边界与依赖关系…',
        '匹配执行 Agent：Scout ×2、Analyst ×2…',
        '生成任务执行计划…',
      ],
      ms: 5000,
    }],
    result: taskList,
    hitl: '阶段一结果：Master 已拆解出上方 4 项任务并分配至 Scout / Analyst。请审阅确认。',
  };

  // 阶段二：数据检索
  const stage2: StageDef = {
    title: '阶段二 · 数据检索',
    cards: [
      {
        title: 'Scout 正在检索数据...',
        logs: [
          '连接 IDC / Gartner 行业报告库…命中 9 篇',
          '爬取 arXiv 论文库…命中 17 篇',
          '抓取头部厂商财报与官网数据…4 家完成',
          '检索政策文件库…3 份文件',
          '去重与可信度过滤…保留 42 条有效信息源',
        ],
        ms: 6000,
      },
      {
        title: 'Analyst 正在整理与结构化数据...',
        logs: [
          '解析财报表格，提取营收与增长率…',
          `汇总 ${r.domain} 技术趋势清单…`,
          '生成市场规模与营收数据表…',
        ],
        ms: 3500,
      },
    ],
    result: `<div class="mini-list">
      ${miniItem('<strong>检索渠道：</strong>IDC / Gartner 行业报告库、arXiv 论文库、各厂商官网财报、政策文件库')}
      ${miniItem(`<strong>关键文档：</strong>${esc(docList)}`)}
      ${miniItem(`<strong>数据产出：</strong>${esc(marketSection?.heading ?? '市场规模')} 数据表 ×1，共 42 条有效信息源`)}
    </div>`,
    hitl: '阶段二结果：Scout 已检索 4 类渠道、多份关键文档，共 42 条信息源。请确认是否进行下一步深度分析？',
  };

  // 阶段三：深度分析
  const stage3: StageDef = {
    title: '阶段三 · 深度分析',
    cards: [{
      title: 'Analyst 正在执行深度分析...',
      logs: [
        '绘制产业链上中下游图谱…完成',
        '波特五力模型：识别核心壁垒…',
        `市场规模自下而上估算…CAGR ${r.cagr}`,
        '结合份额数据交叉验证，生成 SWOT 矩阵…',
      ],
      ms: 6500,
    }],
    result: `<div class="mini-list">
      ${miniItem('<strong>分析方法：</strong>产业链分析（波特五力）、SWOT 模型、市场规模自下而上估算')}
      ${miniItem('<strong>分析过程：</strong>先绘制产业链图谱识别核心壁垒，再结合份额数据交叉验证，输出 SWOT 矩阵')}
      ${miniItem(`<strong>初步结论：</strong>${esc(overview?.paragraphs?.[0] ?? r.summary)}`)}
    </div>${swotSection?.swot ? swotGrid(swotSection.swot) : ''}`,
    hitl: '阶段三结果：Analyst 已用产业链分析 + SWOT 方法输出结论与矩阵，请确认。',
  };

  // 阶段四：交叉审查
  const stage4: StageDef = {
    title: '阶段四 · 交叉审查',
    cards: [{
      title: 'Critic 正在交叉审查...',
      logs: [
        '逐条回溯 SWOT 结论的信息源出处…',
        '与 Gartner 口径交叉比对份额数据…误差 &lt; 2%',
        '核验营收增长率计算（剔除汇率影响）…通过',
        '发现 1 处表述缺口：威胁项缺少时间窗口…',
      ],
      ms: 5500,
    }],
    result: `<div class="mini-list">
      ${miniItem('<strong>观点溯源：</strong>对 SWOT 四项结论逐条回溯，均命中 Scout 检索的原始报告与财报，无凭空推断')}
      ${miniItem('<strong>数据核验：</strong>份额数据与 Gartner 口径交叉比对，误差 &lt; 2%；营收增长率已剔除汇率影响')}
      ${miniItem('<strong>审查意见：</strong>「开源框架追赶」威胁项建议补充时间窗口（预计 12-18 个月），已反馈 Master')}
    </div>`,
    hitl: null,
  };

  // 阶段五：生成报告
  const insight = r.takeaways[0]?.text ?? r.summary;
  const stage5: StageDef = {
    title: '阶段五 · 生成报告',
    cards: [{
      title: 'Master 正在整合报告...',
      logs: [
        '合并前四阶段产出…',
        '按「市场格局 → 产业链 → SWOT → 建议」四章排版…',
        '采纳 Critic 修订意见（威胁项补充时间窗口）…',
        '生成目录与引用索引…',
      ],
      ms: 5000,
    }],
    result: `<div class="doc-h2" style="margin-top:20px;">综合洞察与建议</div>
      <div class="doc-text" style="background-color:var(--bg-elev);padding:16px;border-radius:12px;border-left:3px solid var(--dag-primary);">
        <strong>研小报协同结论：</strong>${esc(insight)}
      </div>
      <div class="mini-list">${r.citations.map((c, i) =>
        miniItem(`<strong>[${i + 1}]</strong> ${esc(c.title)} <span class="strength strength-${c.strength}">${STRENGTH_LABEL[c.strength]}</span> · ${esc(c.source)}`)
      ).join('')}</div>`,
    hitl: null,
  };

  return [stage1, stage2, stage3, stage4, stage5];
}

/**
 * 简单模式：三阶段轻量管线（规划与检索 → 速览分析 → 核验与报告）。
 * 不设审批闸口、日志与卡片数量精简，产出为基础章节 + 核心结论，
 * 总耗时约为深度模式的三分之一。
 */
function buildSimpleStages(r: Report): StageDef[] {
  const overview = findSection(r, 'simple', ['prose']);
  const marketSection = findSection(r, 'simple', ['chart', 'bars']);
  const insight = r.takeaways[0]?.text ?? r.summary;
  const keyDocs = r.citations
    .slice(0, 2)
    .map((c) => `《${c.title}》`)
    .join('、');

  const stage1: StageDef = {
    title: '阶段一 · 规划与检索',
    cards: [
      {
        title: 'Master 正在快速规划...',
        logs: [
          `解析调研主题：${r.topic}…`,
          '圈定 3 项轻量任务（概述 / 数据 / 结论）…',
        ],
        ms: 2200,
      },
      {
        title: 'Scout 正在检索关键数据...',
        logs: [
          '检索行业报告库与厂商财报…命中 18 条',
          '可信度过滤…保留 12 条有效信息源',
        ],
        ms: 3200,
      },
    ],
    result: `<div class="mini-list">
      ${miniItem('<strong>检索渠道：</strong>行业报告库、厂商官网财报')}
      ${miniItem(`<strong>关键文档：</strong>${esc(keyDocs)}`)}
      ${miniItem('<strong>数据产出：</strong>12 条有效信息源（轻量口径）')}
    </div>`,
    hitl: null,
  };

  const stage2: StageDef = {
    title: '阶段二 · 速览分析',
    cards: [
      {
        title: 'Analyst 正在速览分析...',
        logs: ['提取市场规模与增长率…', '概括竞争格局要点…'],
        ms: 3000,
      },
    ],
    result: `<div class="mini-list">
      ${miniItem(`<strong>市场数据：</strong>${esc(marketSection?.heading ?? '市场规模')} 速览`)}
      ${miniItem(`<strong>速览结论：</strong>${esc(overview?.paragraphs?.[0] ?? r.summary)}`)}
    </div>`,
    hitl: null,
  };

  const stage3: StageDef = {
    title: '阶段三 · 核验与报告',
    cards: [
      {
        title: 'Critic 正在快速核验...',
        logs: ['抽查关键数据出处…通过'],
        ms: 1600,
      },
      {
        title: 'Master 正在整合报告...',
        logs: ['按「概述 → 数据 → 结论」三段排版…', '生成引用索引…'],
        ms: 2400,
      },
    ],
    result: `<div class="doc-h2" style="margin-top:20px;">核心结论</div>
      <div class="doc-text" style="background-color:var(--bg-elev);padding:16px;border-radius:12px;border-left:3px solid var(--dag-primary);">
        <strong>研小报速览结论：</strong>${esc(insight)}
      </div>
      <div class="mini-list">${r.citations
        .slice(0, 2)
        .map(
          (c, i) =>
            miniItem(
              `<strong>[${i + 1}]</strong> ${esc(c.title)} <span class="strength strength-${c.strength}">${STRENGTH_LABEL[c.strength]}</span> · ${esc(c.source)}`,
            ),
        )
        .join('')}</div>`,
    hitl: null,
  };

  return [stage1, stage2, stage3];
}
