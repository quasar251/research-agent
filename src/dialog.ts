import {
  reports,
  STRENGTH_LABEL,
  type Report,
  type Section,
  type SwotItem,
  type ReportDepth,
} from './mock';
import {
  esc,
  fmtTime,
  state,
  setDepthLocked,
  setDepthUI,
  setStatus,
  scrollBottom,
  usageFor,
  usageForModel,
  usageChip,
  MODEL_LABEL,
} from './common';

/* ================================================================
 * 对话区模块（调研过程替换为 dag.html 的多 Agent 协同 DAG）
 * ----------------------------------------------------------------
 * 1. 会话存储（历史对话持久化）
 * 2. 新建调研页（欢迎态 / 文字墙 / 输入框浮沉）
 * 3. 调研主卡片骨架（顶部 Stepper + 拓扑侧栏 + 文档区 + HITL 面板）
 * 4. 五阶段 DAG 流程引擎（流式执行卡片 + 阶段结果摘要 + 用户审批）
 * 5. 阶段结果渲染（任务拆解 / 检索 / 分析 / 审查 / 报告）
 * 6. 阅读模式 / 消息发送 / 聊天区事件委托
 * ================================================================ */

/* ================================================================
 * 一、会话存储（历史对话持久化）
 * ================================================================ */
export type ChatMessage =
  | { type: 'user'; text: string }
  | { type: 'research'; reportId: string; depth: ReportDepth; stage?: number }
  | { type: 'follow-user'; text: string }
  | { type: 'follow-agent'; label: string; bullets: string[]; time: string; model?: string };

export interface Conversation {
  id: string;
  reportId: string;
  title: string;
  domain: string;
  time: string;
  depth: ReportDepth;
  cost: number;
  messages: ChatMessage[];
}

export let conversations: Conversation[] = [];
export let activeConvId: string | null = null;
export let activeConv: Conversation | null = null;
export let todaySpend = 0;
let convSeq = 0;

const LS_CONVS = 'yanheng.conversations';
const LS_SPEND = 'yanheng.todaySpend';

/** 侧边栏刷新回调，由应用外壳注册（避免模块间循环依赖） */
let sidebarRefresh: () => void = () => {};

export function setSidebarRefresh(fn: () => void): void {
  sidebarRefresh = fn;
}

export function saveConvs(): void {
  localStorage.setItem(LS_CONVS, JSON.stringify(conversations));
  localStorage.setItem(LS_SPEND, String(todaySpend));
}

/** 兼容旧版本（report / follow-user / follow-agent）落盘的消息 */
function normalizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as {
    type?: string;
    text?: string;
    reportId?: string;
    depth?: ReportDepth;
    label?: string;
    bullets?: string[];
    time?: string;
    model?: string;
  };
  if (m.type === 'user' && typeof m.text === 'string') return { type: 'user', text: m.text };
  if ((m.type === 'research' || m.type === 'report') && m.reportId) {
    return { type: 'research', reportId: m.reportId, depth: m.depth ?? 'deep', stage: m.stage };
  }
  if (m.type === 'follow-user' && typeof m.text === 'string') return { type: 'follow-user', text: m.text };
  if (m.type === 'follow-agent' && Array.isArray(m.bullets)) {
    return {
      type: 'follow-agent',
      label: m.label ?? '追问',
      bullets: m.bullets,
      time: m.time ?? '',
      model: m.model ?? 'pro',
    };
  }
  return null;
}

export function loadConvs(): boolean {
  const raw = localStorage.getItem(LS_CONVS);
  if (raw === null) return false;
  try {
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed)) return false;
    conversations = parsed.map((c) => ({
      ...c,
      messages: (c.messages ?? [])
        .map(normalizeMessage)
        .filter((m): m is ChatMessage => m !== null),
    }));
    convSeq = conversations.reduce((m, c) => Math.max(m, Number(c.id.replace('c', '')) || 0), 0);
    todaySpend = Number(localStorage.getItem(LS_SPEND)) || 0;
    return true;
  } catch {
    /* 数据损坏则回退到种子数据 */
  }
  return false;
}

export function seedConvs(): void {
  const seeds: { reportId: string; time: string; depth: ReportDepth }[] = [
    { reportId: 'ai-agent', time: '今天 14:20', depth: 'deep' },
    { reportId: 'humanoid', time: '昨天 09:41', depth: 'deep' },
    { reportId: 'perovskite', time: '11-04 16:05', depth: 'simple' },
  ];
  conversations = seeds.map((s) => {
    const r = reports[s.reportId];
    return {
      id: `c${++convSeq}`,
      reportId: s.reportId,
      title: r.topic,
      domain: r.domain,
      time: s.time,
      depth: s.depth,
      cost: usageFor(s.depth).cost,
      messages: [],
    };
  });
  todaySpend = conversations.reduce((sum, c) => sum + c.cost, 0);
  saveConvs();
}

export function recordConversation(report: Report, depth: ReportDepth): Conversation {
  const cost = usageFor(depth).cost;
  const id = `c${++convSeq}`;
  const conv: Conversation = {
    id,
    reportId: report.id,
    title: report.topic,
    domain: report.domain,
    time: fmtTime(new Date()),
    depth,
    cost,
    messages: [],
  };
  conversations.unshift(conv);
  todaySpend += cost;
  activeConvId = id;
  activeConv = conv;
  saveConvs();
  sidebarRefresh();
  return conv;
}

export function deleteConversation(id: string): void {
  const conv = conversations.find((c) => c.id === id);
  conversations = conversations.filter((c) => c.id !== id);
  if (conv) todaySpend = Math.max(0, todaySpend - conv.cost);
  if (activeConvId === id) {
    activeConvId = null;
    activeConv = null;
  }
  saveConvs();
  sidebarRefresh();
}

export function clearConversations(): void {
  conversations = [];
  todaySpend = 0;
  activeConvId = null;
  activeConv = null;
  saveConvs();
  sidebarRefresh();
}

/* ================================================================
 * 二、新建调研页（欢迎态）
 * ================================================================ */
const WALL_WORDS = [
  '汽车出口', '美妆零售', 'AI 智能体', '人形机器人', '钙钛矿光伏', '跨境电商',
  '新能源汽车', '半导体', '生物医药', '低空经济', '储能', '具身智能',
  '消费电子', 'SaaS 出海', '工业软件', '氢能', '智能驾驶', '医疗器械',
  '宠物经济', '出海品牌', '数字营销', '算力租赁', '光伏组件', '创新药',
  '连锁餐饮', '预制菜', '咖啡连锁', '银发经济', '合成生物', '卫星互联网',
];

export function welcomeHtml(suggestions: string[]): string {
  const chips = suggestions.map(chipHtml).join('');
  return `
    <div class="welcome" id="welcome">
      <div class="welcome-kicker">INDUSTRY INTELLIGENCE</div>
      <h1 class="welcome-title">想了解哪个行业？把问题交给<em>研衡</em>。</h1>
      <p class="welcome-sub">选「简单 / 深度」，输入主题即可生成报告，过程中可随时确认或提出修改意见。</p>
      <div class="welcome-actions">${chips}</div>
    </div>`;
}

function wordWallHtml(): string {
  const rows = [0, 1, 2, 3, 4]
    .map((r) => {
      const words = WALL_WORDS.slice(r * 6, r * 6 + 6);
      const line = words.map((w) => `<span class="ww-word">${esc(w)}</span>`).join('');
      return `<div class="ww-row">${line}${line}</div>`;
    })
    .join('');
  return `<div class="word-wall" id="wordWall" aria-hidden="true">${rows}</div>`;
}

function chipHtml(q: string): string {
  return `<button class="chip" data-query="${esc(q)}">${esc(q)}<svg class="chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></button>`;
}

export function dockComposer(): void {
  const main = document.querySelector<HTMLElement>('.main')!;
  const chat = document.getElementById('chat')!;
  const composer = document.getElementById('composer')!;
  if (composer.parentElement !== main) main.appendChild(composer);
  composer.classList.remove('in-welcome');
  composer.classList.add('hidden');
  chat.classList.remove('welcome-mode');
  document.getElementById('wordWall')?.remove();
}

export function floatComposer(): void {
  const chat = document.getElementById('chat')!;
  const composer = document.getElementById('composer')!;
  composer.classList.remove('hidden');
  composer.classList.add('in-welcome');
  chat.appendChild(composer);
  chat.classList.add('welcome-mode');
  if (!document.getElementById('wordWall')) {
    chat.insertAdjacentHTML('afterbegin', wordWallHtml());
  }
  const input = document.getElementById('input') as HTMLTextAreaElement;
  input.placeholder = '输入你想调研的行业或主题…';
  input.style.height = 'auto';
}

export function showWelcome(suggestions: string[]): void {
  const chat = document.getElementById('chat')!;
  dockComposer();
  chat.innerHTML = welcomeHtml(suggestions);
  floatComposer();
  const main = document.querySelector<HTMLElement>('.main');
  if (main) main.scrollTop = 0;
  hideFollowDock();
  threads.clear();
  activeRuntime = null;
  activeConv = null;
  activeConvId = null;
  setDepthLocked(false);
  sidebarRefresh();
  setStatus('待命中', 'idle');
}

/* ================================================================
 * 三、阶段结果渲染（由 report 数据驱动）
 * ================================================================ */
const AGENT_COLOR: Record<string, string> = {
  Scout: 'var(--agent-s)',
  Analyst: 'var(--agent-a)',
  Critic: 'var(--agent-c)',
  Master: 'var(--agent-w)',
};
const AGENT_LETTER: Record<string, string> = { Scout: 'S', Analyst: 'A', Critic: 'C', Master: 'W' };

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

interface StageCard {
  title: string;
  logs: string[];
  ms: number;
}
interface StageDef {
  /** 阶段标题（doc-h2） */
  title: string;
  /** 流式执行卡片（可多张） */
  cards: StageCard[];
  /** 阶段结果摘要 HTML */
  result: string;
  /** 审批提示语；为空表示该阶段无需 HITL */
  hitl: string | null;
}

/** 构建五阶段内容（数据驱动自 report） */
function buildStages(r: Report, depth: ReportDepth): StageDef[] {
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
        <strong>研衡协同结论：</strong>${esc(insight)}
      </div>
      <div class="mini-list">${r.citations.map((c, i) =>
        miniItem(`<strong>[${i + 1}]</strong> ${esc(c.title)} <span class="strength strength-${c.strength}">${STRENGTH_LABEL[c.strength]}</span> · ${esc(c.source)}`)
      ).join('')}</div>`,
    hitl: null,
  };

  return [stage1, stage2, stage3, stage4, stage5];
}

/* ================================================================
 * 四、卡片骨架与运行时
 * ================================================================ */
const BACK_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

const STEP_LABELS = ['任务拆解', '数据检索', '深度分析', '交叉审查', '生成报告'];

interface CardRuntime {
  card: HTMLElement;
  report: Report;
  depth: ReportDepth;
  stages: StageDef[];
  /** 当前执行到第几阶段 */
  index: number;
  /** 是否停在审批面板等待用户操作 */
  waiting: boolean;
  /** 五阶段是否已全部完成 */
  finished: boolean;
  /** 卡片线程的最后一个元素（追问消息插在它后面，保证顺序） */
  tail: HTMLElement;
  /** 线程标识，追问消息靠它回查所属报告 */
  threadId: string;
  /** HITL 等待的 resolve */
  hitlResolve: ((v: 'confirmed') => void) | null;
  /** 各阶段容器元素 */
  stageEls: HTMLElement[];
  /** 流式卡片自增 id */
  wcSeq: number;
  /** 该卡片的定时器集合（卸载/重渲染时清理） */
  timers: number[];
  /** 已渲染完成的阶段数（0-5），切换会话后据此续跑 */
  resumeStage: number;
  /** 会话中对应 research 消息的下标（用于持久化进度） */
  researchMsgIndex: number;
}

const runtimes = new WeakMap<HTMLElement, CardRuntime>();
const threads = new Map<string, CardRuntime>();
/** 底部追问栏当前指向的调研卡片 */
let activeRuntime: CardRuntime | null = null;

function stepperHtml(): string {
  return STEP_LABELS.map((label, i) => {
    const line = i < STEP_LABELS.length - 1 ? `<div class="stepper-line" data-line="${i}"></div>` : '';
    return `
      <div class="stepper-item" data-step="${i}"><div class="stepper-dot">${i + 1}</div><div class="stepper-label">${label}</div></div>
      ${line}`;
  }).join('');
}

function wfNode(key: 'w' | 's' | 'a' | 'c', color: string, letter: string, name: string): string {
  return `<div class="wf-node" data-agent="${key}">
    <div class="wf-icon" style="background-color:${color}">${letter}</div>
    <div class="wf-info"><div class="wf-name">${name}</div><div class="wf-status" data-status="${key}">待命</div></div>
  </div>`;
}

/** 页面底部常驻的追问栏（唯一实例，挂在 .main 上，随滚动始终可见） */
function ensureFollowDock(): HTMLElement {
  const existing = document.getElementById('followDock');
  if (existing) return existing;
  const main = document.querySelector<HTMLElement>('.main')!;
  main.insertAdjacentHTML(
    'beforeend',
    `
    <div class="follow-dock hidden" id="followDock">
      <div class="follow-up">
        <div class="follow-title">继续追问</div>
        <div class="follow-chips"></div>
        <div class="follow-row">
          <label class="follow-model" title="选择追问模型">
            <span class="model-select-wrapper">
              <select class="model-select follow-model-select" id="followModelSelect" title="选择追问模型" aria-label="选择追问模型">
                <option value="pro">研衡 Pro</option>
                <option value="turbo">研衡 Turbo</option>
                <option value="claude">Claude</option>
                <option value="gpt">GPT-4o</option>
              </select>
              <svg class="model-select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
          </label>
          <input class="follow-input" type="text" placeholder="针对本报告继续提问…" />
          <button class="follow-send" data-act="follow">追问</button>
        </div>
      </div>
    </div>`,
  );
  return document.getElementById('followDock')!;
}

/* ---------------- 追问消息操作：复制 / 修改 / 删除 ---------------- */
const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_DEL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;

function msgActionsHtml(editable: boolean): string {
  return `
    <div class="msg-actions">
      <button class="ma-btn" data-act="copy" title="复制">${ICON_COPY}</button>
      ${editable ? `<button class="ma-btn" data-act="edit" title="修改">${ICON_EDIT}</button>` : ''}
      <button class="ma-btn" data-act="del" title="删除">${ICON_DEL}</button>
    </div>`;
}

/** 追问回复消息（带模型、时间与 token / 成本） */
function followAgentHtml(
  label: string,
  bullets: string[],
  time: string,
  model = 'pro',
  index = -1,
  threadId = '',
): string {
  const attrs = `${index >= 0 ? ` data-msg-index="${index}"` : ''}${threadId ? ` data-thread="${threadId}"` : ''}`;
  return `
    <div class="msg agent" data-role="follow-agent"${attrs}>
      <div class="msg-head">
        <div class="avatar">研</div>
        <div class="agent-meta">
          <div class="agent-name">研衡 Agent</div>
          <div class="agent-domain">${esc(label)}</div>
        </div>
      </div>
      <div class="follow-body"><ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>
      <div class="msg-foot">
        <span class="agent-time">${esc(time)}</span>
        <span class="msg-cost">${esc(MODEL_LABEL[model] ?? model)}</span>
        ${usageChip(usageForModel(model))}
        ${msgActionsHtml(false)}
      </div>
    </div>`;
}

function cardHtml(id: string, r: Report, depth: ReportDepth): string {
  const model = MODEL_LABEL[state.model] ?? state.model;
  return `
    <div class="research-card" data-card="${id}" data-reportid="${r.id}" data-depth="${depth}">
      <header class="research-header">
        <div class="header-left">
          <div class="header-tag">Multi-Agent Topology</div>
          <div class="header-title">正在深度调研：<span>${esc(r.domain)}</span></div>
        </div>
        <button class="back-btn" data-act="exit-reader">${BACK_SVG}返回调研过程</button>
      </header>
      <div class="main-card">
        <div class="stepper-container">${stepperHtml()}</div>
        <div class="card-body">
          <div class="dag-sidebar">
            <div class="sidebar-title">Agent 协同工作流</div>
            <div class="workflow-container">
              <svg class="workflow-svg"></svg>
              ${wfNode('w', 'var(--agent-w)', 'W', 'Master 规划&主笔')}
              ${wfNode('s', 'var(--agent-s)', 'S', 'Scout 检索')}
              ${wfNode('a', 'var(--agent-a)', 'A', 'Analyst 分析')}
              ${wfNode('c', 'var(--agent-c)', 'C', 'Critic 审查')}
            </div>
          </div>
          <div class="main-content">
            <div class="collab-status-banner"><div class="dag-dot"></div><span class="banner-text">准备启动...</span></div>
            <div class="document-area"></div>
          </div>
        </div>
        <div class="interaction-panel">
          <div class="interaction-header"><div class="interaction-title"></div></div>
          <div class="interaction-input-group">
            <input class="interaction-input" type="text" placeholder="输入修改意见（例如：增加海外市场分析、关注技术壁垒...）" />
            <button class="btn-retry" data-act="retry">打回重写</button>
            <button class="btn-confirm" data-act="confirm">确认，继续下一步</button>
          </div>
        </div>
        <div class="card-footer">
          <div class="msg-foot">
            <span class="agent-time">${fmtTime(new Date())}</span>
            ${usageChip(usageFor(depth))}
            <span class="msg-cost">${esc(model)} · ${esc(r.updatedAt)}</span>
          </div>
          <button class="btn btn-disabled" data-act="reader">多 Agent 拓扑协同中...</button>
        </div>
      </div>
    </div>`;
}

/* ---------------- DOM 访问助手（均限定在本卡片内） ---------------- */
function q<T extends Element>(rt: CardRuntime, sel: string): T | null {
  return rt.card.querySelector<T>(sel);
}

function docArea(rt: CardRuntime): HTMLElement | null {
  return q(rt, '.document-area');
}

function footerBtn(rt: CardRuntime): HTMLButtonElement {
  return q(rt, '.card-footer .btn') as HTMLButtonElement;
}

function setBanner(rt: CardRuntime, text: string, show = true): void {
  const banner = q(rt, '.collab-status-banner');
  const bt = q(rt, '.banner-text');
  if (banner) banner.classList.toggle('show', show);
  if (bt) bt.textContent = text;
}

type StepState = 'idle' | 'active' | 'waiting' | 'completed';

function setStepperState(rt: CardRuntime, i: number, state: StepState): void {
  const el = q(rt, `.stepper-item[data-step="${i}"]`);
  if (!el) return;
  const dot = el.querySelector<HTMLElement>('.stepper-dot');
  const line = q(rt, `.stepper-line[data-line="${i}"]`);
  el.classList.remove('active', 'waiting', 'completed');
  if (state === 'active') {
    el.classList.add('active');
    if (dot) dot.textContent = String(i + 1);
    line?.classList.add('active-line');
  } else if (state === 'waiting') {
    el.classList.add('waiting');
    if (dot) dot.textContent = String(i + 1);
  } else if (state === 'completed') {
    el.classList.add('completed');
    if (dot) dot.textContent = '✓';
    if (line) {
      line.classList.remove('active-line');
      line.classList.add('completed');
    }
  } else {
    if (dot) dot.textContent = String(i + 1);
    line?.classList.remove('active-line', 'completed');
  }
}

type NodeState = 'idle' | 'active' | 'waiting';

function setNodeState(rt: CardRuntime, key: string, text: string, st: NodeState): void {
  const node = q(rt, `.wf-node[data-agent="${key}"]`);
  if (!node) return;
  const statusEl = q(rt, `.wf-status[data-status="${key}"]`);
  node.classList.remove('active', 'waiting');
  if (st === 'active') node.classList.add('active');
  if (st === 'waiting') node.classList.add('waiting');
  if (statusEl) statusEl.textContent = text;
}

function setPathState(rt: CardRuntime, pathId: string, st: 'idle' | 'flowing' | 'waiting'): void {
  const path = q(rt, `#${pathId}`);
  if (!path) return;
  path.classList.remove('active', 'flowing', 'waiting-dashed');
  if (st === 'flowing') {
    path.classList.add('active', 'flowing');
    path.setAttribute('marker-end', 'url(#dag-arrow-active)');
  } else if (st === 'waiting') {
    path.classList.add('waiting-dashed');
    path.setAttribute('marker-end', 'url(#dag-arrow-waiting)');
  } else {
    path.setAttribute('marker-end', 'url(#dag-arrow)');
  }
}

function syncHeader(rt: CardRuntime): void {
  const tag = q(rt, '.header-tag');
  const title = q(rt, '.header-title');
  if (!tag || !title) return;
  if (rt.finished) {
    tag.textContent = 'Report Completed';
    tag.classList.add('success');
    title.innerHTML = `${esc(rt.report.topic)}<span class="header-done">✓ 已完成</span>`;
  } else {
    tag.textContent = 'Multi-Agent Topology';
    tag.classList.remove('success');
    title.innerHTML = `正在深度调研：<span>${esc(rt.report.domain)}</span>`;
  }
}

/** 写入卡片底部的生成时间 */
function syncMeta(rt: CardRuntime, time: string): void {
  const el = q(rt, '.card-footer .agent-time');
  if (el) el.textContent = time;
}

/** 流程结束后：底部追问栏指向该报告并常驻显示 */
function showFollowUp(rt: CardRuntime): void {
  activeRuntime = rt;
  const dock = ensureFollowDock();
  const title = dock.querySelector<HTMLElement>('.follow-title');
  if (title) title.innerHTML = `继续追问 · <span>${esc(rt.report.domain)}</span>`;
  const chips = dock.querySelector<HTMLElement>('.follow-chips');
  if (chips) {
    chips.innerHTML = rt.report.followUpHints
      .map((h) => `<button class="follow-chip" data-q="${esc(h)}">${esc(h)}</button>`)
      .join('');
  }
  const modelSelect = dock.querySelector<HTMLSelectElement>('#followModelSelect');
  if (modelSelect) modelSelect.value = state.model;
  dock.classList.remove('hidden');
}

/** 新建 / 首页 / 新一轮调研时收起追问栏 */
function hideFollowDock(): void {
  document.getElementById('followDock')?.classList.add('hidden');
}

function openPanel(rt: CardRuntime, hint: string): void {
  const panel = q(rt, '.interaction-panel');
  const title = q(rt, '.interaction-title');
  if (!panel || !title) return;
  title.textContent = hint;
  panel.classList.add('show');
  scrollDoc(rt);
}

function closePanel(rt: CardRuntime): void {
  q(rt, '.interaction-panel')?.classList.remove('show');
}

function scrollDoc(rt: CardRuntime): void {
  const doc = docArea(rt);
  if (doc) doc.scrollTo({ top: doc.scrollHeight, behavior: 'smooth' });
}

/* ================================================================
 * 五、拓扑图绘制 + 流式执行卡片 + HITL
 * ================================================================ */
function sleep(rt: CardRuntime, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = window.setTimeout(resolve, ms);
    rt.timers.push(t);
  });
}

function mmss(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** 绘制本卡片拓扑连线（按节点实际位置计算 SVG 路径） */
function drawLines(rt: CardRuntime): void {
  const svg = q(rt, '.workflow-svg');
  const container = q(rt, '.workflow-container');
  if (!svg || !container) return;
  const nodes = {
    w: q(rt, '.wf-node[data-agent="w"]') as HTMLElement,
    s: q(rt, '.wf-node[data-agent="s"]') as HTMLElement,
    a: q(rt, '.wf-node[data-agent="a"]') as HTMLElement,
    c: q(rt, '.wf-node[data-agent="c"]') as HTMLElement,
  };
  const cRect = container.getBoundingClientRect();
  const rect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left - cRect.left, y: r.top - cRect.top, w: r.width, h: r.height,
      cx: r.left - cRect.left + r.width / 2, cy: r.top - cRect.top + r.height / 2,
    };
  };
  const w = rect(nodes.w), s = rect(nodes.s), a = rect(nodes.a), c = rect(nodes.c);

  const createPath = (sx: number, sy: number, ex: number, ey: number, type: 'v' | 'h' = 'v') => {
    if (type === 'v') { const my = sy + (ey - sy) / 2; return `M ${sx} ${sy} L ${sx} ${my} L ${ex} ${my} L ${ex} ${ey}`; }
    const mx = sx + (ex - sx) / 2; return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`;
  };

  const paths = [
    { id: 'path-w-s', d: createPath(w.cx, w.y + w.h, s.cx, s.y) },
    { id: 'path-w-a', d: createPath(w.cx, w.y + w.h, a.cx, a.y) },
    { id: 'path-s-a', d: createPath(s.x + s.w, s.cy, a.x, a.cy, 'h') },
    { id: 'path-a-c', d: createPath(a.cx, a.y + a.h, c.cx, c.y) },
    { id: 'path-c-w', d: `M ${c.x} ${c.cy} L ${w.x - 20} ${c.cy} L ${w.x - 20} ${w.cy} L ${w.x} ${w.cy}` },
  ];

  svg.innerHTML = `
    <defs>
      <marker id="dag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#E0DDD5" /></marker>
      <marker id="dag-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--dag-primary)" /></marker>
      <marker id="dag-arrow-waiting" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--dag-warning)" /></marker>
    </defs>
    ${paths.map((p) => `<path id="${p.id}" class="path-line" d="${p.d}" marker-end="url(#dag-arrow)"/>`).join('')}
  `;
}

/** 流式执行卡片：逐条日志 + 进度条 + 实时耗时，完成后转绿 ✓ */
function runWorkCard(rt: CardRuntime, title: string, steps: string[], totalMs: number, container: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const uid = `wc-${rt.wcSeq++}`;
    container.insertAdjacentHTML('beforeend', `
      <div class="work-card" data-wc="${uid}">
        <div class="work-head"><div class="dag-spinner" data-el="sp"></div><div class="work-title">${esc(title)}</div><div class="work-elapsed" data-el="t">00:00</div></div>
        <div class="work-progress"><div class="work-progress-fill" data-el="p"></div></div>
        <div class="work-log" data-el="l"></div>
      </div>
    `);
    const card = container.querySelector<HTMLElement>(`[data-wc="${uid}"]`)!;
    const logEl = card.querySelector<HTMLElement>('[data-el="l"]')!;
    const progEl = card.querySelector<HTMLElement>('[data-el="p"]')!;
    const timeEl = card.querySelector<HTMLElement>('[data-el="t"]')!;
    scrollDoc(rt);

    const start = Date.now();
    const tick = window.setInterval(() => {
      if (!rt.card.isConnected) { window.clearInterval(tick); return; }
      timeEl.textContent = mmss(Math.floor((Date.now() - start) / 1000));
    }, 500);
    rt.timers.push(tick);

    const stepMs = totalMs / (steps.length + 1);
    let i = 0;
    const emit = () => {
      if (!rt.card.isConnected) return;
      if (i >= steps.length) return;
      const elapsed = mmss(Math.floor((Date.now() - start) / 1000));
      logEl.insertAdjacentHTML('beforeend', `<div class="log-line"><span class="log-time">[${elapsed}]</span>${steps[i]}</div>`);
      progEl.style.width = `${Math.round(((i + 1) / (steps.length + 1)) * 100)}%`;
      i++;
      scrollDoc(rt);
      const t = window.setTimeout(emit, stepMs);
      rt.timers.push(t);
    };
    const t0 = window.setTimeout(emit, stepMs);
    rt.timers.push(t0);

    const done = window.setTimeout(() => {
      window.clearInterval(tick);
      if (!rt.card.isConnected) { resolve(); return; }
      progEl.style.width = '100%';
      card.classList.add('done');
      const sp = card.querySelector('[data-el="sp"]');
      if (sp) sp.outerHTML = '<div class="work-check">✓</div>';
      resolve();
    }, totalMs);
    rt.timers.push(done);
  });
}

/** HITL：弹出审批面板，等待用户「确认」 */
function waitForHuman(rt: CardRuntime, hint: string): Promise<'confirmed'> {
  openPanel(rt, hint);
  return new Promise((resolve) => { rt.hitlResolve = resolve; });
}

function handleConfirm(rt: CardRuntime): void {
  if (!rt.hitlResolve) return;
  closePanel(rt);
  const r = rt.hitlResolve;
  rt.hitlResolve = null;
  r('confirmed');
}

/** 打回重写：暂存当前阶段内容，覆盖 Loading，重算后恢复并再次等待确认 */
async function handleRetry(rt: CardRuntime): Promise<void> {
  if (!rt.hitlResolve) return;
  const input = q(rt, '.interaction-input') as HTMLInputElement | null;
  const feedback = (input?.value ?? '').trim();
  if (input) input.value = '';
  closePanel(rt);

  const stageEl = rt.stageEls[rt.index];
  if (!stageEl) return;
  const current = stageEl.innerHTML;
  stageEl.innerHTML = `
    <div class="doc-text" style="color:var(--dag-warning);font-size:13px;border-left:2px solid var(--dag-warning);padding-left:10px;margin-bottom:16px;">
      <em>收到指令：“${esc(feedback || '重新处理')}”。Agent 正在重算...</em>
    </div>
    <div class="loading-bar-container"><div class="loading-bar"></div><div class="loading-bar short"></div></div>`;
  scrollDoc(rt);

  await sleep(rt, 2000);
  if (!rt.card.isConnected) return;

  stageEl.innerHTML = current;
  openPanel(rt, '已重新生成，请确认，或继续输入修改意见。');
}

/* ================================================================
 * 六、五阶段 DAG 流程引擎
 * ================================================================ */
function alive(rt: CardRuntime): boolean {
  return rt.card.isConnected;
}

function startStage(rt: CardRuntime, i: number): HTMLElement {
  const doc = docArea(rt)!;
  doc.insertAdjacentHTML('beforeend', `<div class="doc-content" data-stage="${i}"><div class="doc-h2">${esc(rt.stages[i].title)}</div></div>`);
  const el = q(rt, `.doc-content[data-stage="${i}"]`) as HTMLElement;
  rt.stageEls[i] = el;
  rt.index = i;
  scrollDoc(rt);
  return el;
}

/** 恢复已完成阶段：只渲染标题 + 结果摘要（无执行卡片动画） */
function restoreStage(rt: CardRuntime, i: number): void {
  const el = startStage(rt, i);
  el.insertAdjacentHTML('beforeend', rt.stages[i].result);
}

/** 把已完成阶段数写回会话的 research 消息（切换会话后可续跑） */
function saveStageProgress(rt: CardRuntime, n: number): void {
  rt.resumeStage = n;
  const idx = rt.researchMsgIndex;
  const m = activeConv?.messages[idx];
  if (idx >= 0 && m?.type === 'research') {
    m.stage = n;
    saveConvs();
  }
}

const HITL_BANNERS = [
  '任务计划已生成，等待用户审批...',
  '数据检索完毕，等待用户审批...',
  '深度分析完毕，等待用户审批...',
];

/** 停在某阶段审批点：置 waiting 态并弹出审批面板 */
function enterHitl(rt: CardRuntime, i: number): Promise<'confirmed'> {
  setStepperState(rt, i, 'waiting');
  if (i === 0) {
    setNodeState(rt, 'w', '等待审批', 'waiting');
    setNodeState(rt, 's', '暂停等待', 'waiting');
    setNodeState(rt, 'a', '暂停等待', 'waiting');
    setPathState(rt, 'path-w-s', 'waiting');
    setPathState(rt, 'path-w-a', 'waiting');
  } else {
    setNodeState(rt, 'a', '等待审批', 'waiting');
  }
  setBanner(rt, HITL_BANNERS[i]);
  setStatus('等待用户审批', 'idle');
  return waitForHuman(rt, rt.stages[i].hitl!);
}

/** 执行第 i 阶段：横幅 / 节点状态 / 流式卡片 / 结果摘要 */
async function runStage(rt: CardRuntime, i: number): Promise<void> {
  setStepperState(rt, i, 'active');
  const st = rt.stages[i];

  if (i === 0) {
    setBanner(rt, '系统初始化，Master 正在拆解调研任务...');
    setNodeState(rt, 'w', '正在拆解任务...', 'active');
    const el = startStage(rt, 0);
    await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
    if (!alive(rt)) return;
    el.insertAdjacentHTML('beforeend', st.result);
    scrollDoc(rt);
    await sleep(rt, 800);
    if (!alive(rt)) return;

    setBanner(rt, 'Master 分析完毕，正在将任务分发给下游 Agent...');
    setNodeState(rt, 'w', '正在分发任务...', 'active');
    setPathState(rt, 'path-w-s', 'flowing');
    setPathState(rt, 'path-w-a', 'flowing');
    setNodeState(rt, 's', '接收任务...', 'active');
    setNodeState(rt, 'a', '接收任务...', 'active');
    await sleep(rt, 1500);
    return;
  }

  if (i === 1) {
    setBanner(rt, '用户已确认。Scout 正在全速检索数据...');
    setStatus('数据检索…', 'busy');
    setPathState(rt, 'path-w-s', 'flowing');
    setPathState(rt, 'path-w-a', 'idle');
    setNodeState(rt, 'w', '执行中', 'idle');
    setNodeState(rt, 's', '检索中...', 'active');
    setNodeState(rt, 'a', '待命', 'idle');
    const el = startStage(rt, 1);
    await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
    if (!alive(rt)) return;

    setBanner(rt, 'Scout 检索完成，正将数据传给 Analyst...');
    setPathState(rt, 'path-w-s', 'idle');
    setPathState(rt, 'path-s-a', 'flowing');
    setNodeState(rt, 's', '交接完成', 'idle');
    setNodeState(rt, 'a', '整理数据...', 'active');
    await runWorkCard(rt, st.cards[1].title, st.cards[1].logs, st.cards[1].ms, el);
    if (!alive(rt)) return;

    el.insertAdjacentHTML('beforeend', st.result);
    scrollDoc(rt);
    setPathState(rt, 'path-s-a', 'idle');
    return;
  }

  if (i === 2) {
    setBanner(rt, '用户已确认。Analyst 正在构建 SWOT 模型...');
    setStatus('深度分析…', 'busy');
    setNodeState(rt, 'a', '分析中...', 'active');
    const el = startStage(rt, 2);
    await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
    if (!alive(rt)) return;
    el.insertAdjacentHTML('beforeend', st.result);
    scrollDoc(rt);
    return;
  }

  if (i === 3) {
    setBanner(rt, '用户已确认。Analyst 提交结论，Critic 正在审查逻辑...');
    setStatus('交叉审查…', 'busy');
    setPathState(rt, 'path-a-c', 'flowing');
    setNodeState(rt, 'c', '正在寻找漏洞...', 'active');
    setNodeState(rt, 'a', '待命', 'idle');
    const el = startStage(rt, 3);
    await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
    if (!alive(rt)) return;
    el.insertAdjacentHTML('beforeend', st.result);
    scrollDoc(rt);

    setBanner(rt, 'Critic 审查完毕，已抄送 Master...');
    setPathState(rt, 'path-a-c', 'idle');
    setPathState(rt, 'path-c-w', 'flowing');
    setNodeState(rt, 'c', '审查完毕', 'idle');
    setNodeState(rt, 'w', '接收反馈', 'active');
    await sleep(rt, 1500);
    return;
  }

  // i === 4
  setBanner(rt, 'Master 正在整合最终报告...');
  setStatus('生成报告…', 'busy');
  setPathState(rt, 'path-c-w', 'idle');
  setNodeState(rt, 'w', '排版中...', 'active');
  const el = startStage(rt, 4);
  await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
  if (!alive(rt)) return;
  el.insertAdjacentHTML('beforeend', st.result);
  scrollDoc(rt);
  await sleep(rt, 1000);
}

async function runDag(rt: CardRuntime): Promise<void> {
  drawLines(rt);
  for (let i = 0; i < 5; i++) setStepperState(rt, i, 'idle');

  // 恢复此前已完成的阶段（切换会话后回来续跑）
  const from = rt.resumeStage;
  for (let k = 0; k < from; k++) {
    restoreStage(rt, k);
    setStepperState(rt, k, 'completed');
  }

  // 上次停在审批点：直接恢复审批面板，不重跑已完成阶段
  if (from > 0 && from <= 3 && rt.stages[from - 1].hitl) {
    await enterHitl(rt, from - 1);
    if (!alive(rt)) return;
    setStepperState(rt, from - 1, 'completed');
  }

  for (let i = from; i < 5; i++) {
    await runStage(rt, i);
    if (!alive(rt)) return;
    saveStageProgress(rt, i + 1);

    const hitl = rt.stages[i].hitl;
    if (hitl) {
      await enterHitl(rt, i);
      if (!alive(rt)) return;
    }
    setStepperState(rt, i, 'completed');
  }

  finishCard(rt);
}

function finishCard(rt: CardRuntime): void {
  rt.finished = true;
  rt.waiting = false;
  setStepperState(rt, 4, 'completed');
  setBanner(rt, '', false);
  setNodeState(rt, 'w', '生成完毕', 'idle');
  closePanel(rt);
  const btn = footerBtn(rt);
  btn.className = 'btn btn-ready';
  btn.textContent = '阅读完整报告';
  syncHeader(rt);
  syncMeta(rt, fmtTime(new Date()));
  showFollowUp(rt);
  setStatus('已完成', 'ok');
  scrollDoc(rt);
}

/* ---------------- 阅读模式 ---------------- */
function enterReader(rt: CardRuntime): void {
  if (!rt.finished) return;
  rt.card.classList.add('reader-mode');
  closePanel(rt);
  const doc = docArea(rt);
  if (doc) window.setTimeout(() => doc.scrollTo({ top: 0, behavior: 'smooth' }), 260);
  setStatus('阅读模式', 'ok');
}

function exitReader(rt: CardRuntime): void {
  rt.card.classList.remove('reader-mode');
  window.setTimeout(() => scrollDoc(rt), 260);
  setStatus('已完成', 'ok');
}

/* ---------------- toast ---------------- */
let toastTimer: number | undefined;

function toast(text: string): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 1600);
}

/* ---------------- 挂载卡片 ---------------- */
function mountCard(report: Report, depth: ReportDepth, finished: boolean, metaTime?: string): CardRuntime {
  const chat = document.getElementById('chat')!;
  const id = `${report.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  chat.insertAdjacentHTML('beforeend', cardHtml(id, report, depth));
  const card = chat.querySelector<HTMLElement>(`.research-card[data-card="${id}"]`)!;
  const rt: CardRuntime = {
    card, report, depth, stages: buildStages(report, depth), index: 0, waiting: false, finished: false,
    tail: card, threadId: id, hitlResolve: null, stageEls: [], wcSeq: 0, timers: [],
  };
  runtimes.set(card, rt);
  threads.set(id, rt);
  activeRuntime = rt;

  if (finished) {
    renderDone(rt, metaTime);
  } else {
    window.setTimeout(() => runDag(rt), 300);
  }
  return rt;
}

/** 回放：直接渲染为全部完成态（拓扑 + 五阶段结果） */
function renderDone(rt: CardRuntime, metaTime?: string): void {
  drawLines(rt);
  const doc = docArea(rt);
  if (!doc) return;
  const h1 = `<div class="doc-content"><div class="doc-h1">${esc(rt.report.topic)}深度洞察</div></div>`;
  doc.innerHTML = h1 + rt.stages.map((st, i) =>
    `<div class="doc-content" data-stage="${i}"><div class="doc-h2">${esc(st.title)}</div>${st.result}</div>`,
  ).join('');
  for (let i = 0; i < 5; i++) setStepperState(rt, i, 'completed');
  setNodeState(rt, 'w', '生成完毕', 'idle');
  rt.index = rt.stages.length;
  rt.finished = true;
  rt.waiting = false;
  const btn = footerBtn(rt);
  btn.className = 'btn btn-ready';
  btn.textContent = '阅读完整报告';
  syncHeader(rt);
  syncMeta(rt, metaTime || fmtTime(new Date()));
  showFollowUp(rt);
}

/* ================================================================
 * 七、消息发送与回放
 * ================================================================ */
function userMsgHtml(
  text: string,
  role: 'user' | 'follow-user' = 'user',
  index = -1,
  threadId = '',
): string {
  const attrs = `${index >= 0 ? ` data-msg-index="${index}"` : ''}${threadId ? ` data-thread="${threadId}"` : ''}`;
  const actions = role === 'follow-user' ? msgActionsHtml(true) : '';
  return `<div class="msg user" data-role="${role}"${attrs}><div class="user-bubble">${esc(text)}</div>${actions}</div>`;
}

function matchReport(q0: string): Report {
  const t = q0.toLowerCase();
  if (t.includes('机器人') || t.includes('具身') || t.includes('humanoid')) return reports.humanoid;
  if (t.includes('钙钛矿') || t.includes('光伏') || t.includes('perovskite')) return reports.perovskite;
  return reports['ai-agent'];
}

/* ---------------- 追问：插在卡片线程尾部 ---------------- */
function appendAfter(rt: CardRuntime, html: string): void {
  rt.tail.insertAdjacentHTML('afterend', html);
  const el = rt.tail.nextElementSibling;
  if (el instanceof HTMLElement) rt.tail = el;
}

function followReply(r: Report, q0: string, model: string): { label: string; bullets: string[] } {
  return {
    label: `追问 · ${r.domain} · ${MODEL_LABEL[model] ?? model}`,
    bullets: [
      `关于「${q0}」，由 ${MODEL_LABEL[model] ?? model} 结合 ${r.domain} 的最新公开数据作答：该议题仍处快速演进阶段，短期存在口径分歧。`,
      `建议下一步：拉取近 12 个月的相关来源，并对头部厂商的公开口径做交叉核对（完整回复需接入实时数据源）。`,
    ],
  };
}

function askFollowUp(rt: CardRuntime, raw: string): void {
  if (!rt.finished) return;
  const q0 = raw.trim();
  if (!q0) return;
  const input = document.querySelector<HTMLInputElement>('#followDock .follow-input');
  if (input) input.value = '';

  const model = state.model;
  const usage = usageForModel(model);
  const reply = followReply(rt.report, q0, model);
  const time = fmtTime(new Date());
  const baseIndex = activeConv ? activeConv.messages.length : -1;
  appendAfter(rt, userMsgHtml(q0, 'follow-user', baseIndex, rt.threadId));
  appendAfter(rt, followAgentHtml(reply.label, reply.bullets, time, model, baseIndex >= 0 ? baseIndex + 1 : -1, rt.threadId));

  todaySpend += usage.cost;
  if (activeConv) {
    activeConv.messages.push({ type: 'follow-user', text: q0 });
    activeConv.messages.push({ type: 'follow-agent', label: reply.label, bullets: reply.bullets, time, model });
  }
  saveConvs();
  sidebarRefresh();
  scrollBottom();
}

/* ---------------- 追问消息操作实现 ---------------- */
/** 消息在会话数组里的下标，删改后顺移后续 DOM 标记 */
function shiftMsgIndices(from: number, delta: number): void {
  document.querySelectorAll<HTMLElement>('#chat .msg[data-msg-index]').forEach((el) => {
    const i = Number(el.dataset.msgIndex);
    if (!Number.isNaN(i) && i >= from) el.dataset.msgIndex = String(i + delta);
  });
}

function fallbackCopy(text: string, done: () => void): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  done();
}

function copyMessage(msg: HTMLElement): void {
  const text = (msg.querySelector('.user-bubble')?.textContent ?? msg.querySelector('.follow-body')?.textContent ?? '').trim();
  if (!text) return;
  const done = () => toast('已复制到剪贴板');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function deleteFollowMessage(msg: HTMLElement, rt: CardRuntime): void {
  const idx = Number(msg.dataset.msgIndex);
  let count = 1;
  let refund = 0;

  const self = activeConv?.messages[idx];
  if (self?.type === 'follow-agent') refund += usageForModel(self.model ?? 'pro').cost;

  // 删除追问问题时，连同它下面的 Agent 回复一起删
  const reply = msg.nextElementSibling;
  if (
    msg.dataset.role === 'follow-user' &&
    reply instanceof HTMLElement &&
    reply.dataset.role === 'follow-agent'
  ) {
    const rm = activeConv?.messages[idx + 1];
    if (rm?.type === 'follow-agent') refund += usageForModel(rm.model ?? 'pro').cost;
    count = 2;
    if (rt.tail === reply) rt.tail = msg;
    reply.remove();
  }

  const prev = msg.previousElementSibling;
  msg.remove();
  if (rt.tail === msg) rt.tail = prev instanceof HTMLElement ? prev : rt.card;

  if (activeConv && idx >= 0) {
    activeConv.messages.splice(idx, count);
    shiftMsgIndices(idx + count, -count);
  }
  todaySpend = Math.max(0, todaySpend - refund);
  saveConvs();
  sidebarRefresh();
  toast('已删除');
}

function editFollowMessage(msg: HTMLElement, rt: CardRuntime): void {
  const bubble = msg.querySelector('.user-bubble');
  if (!bubble) return;
  const oldText = bubble.textContent ?? '';
  const idx = Number(msg.dataset.msgIndex);
  const restore = (text: string) => {
    msg.innerHTML = `<div class="user-bubble">${esc(text)}</div>${msgActionsHtml(true)}`;
  };

  msg.querySelector('.msg-actions')?.remove();
  bubble.outerHTML = `
    <div class="edit-row">
      <textarea class="edit-input" rows="1">${esc(oldText)}</textarea>
      <div class="edit-btns">
        <button class="edit-save">保存</button>
        <button class="edit-cancel">取消</button>
      </div>
    </div>`;
  const input = msg.querySelector('.edit-input') as HTMLTextAreaElement;
  input.focus();
  msg.querySelector('.edit-cancel')!.addEventListener('click', () => restore(oldText));
  msg.querySelector('.edit-save')!.addEventListener('click', () => {
    const newText = input.value.trim();
    if (!newText) return;
    restore(newText);

    const model = state.model;
    const oldReply = activeConv?.messages[idx + 1];
    const oldModel = oldReply?.type === 'follow-agent' ? (oldReply.model ?? 'pro') : model;

    // 移除旧回复，再按新问题 + 当前模型重新生成一条
    const replyEl = msg.nextElementSibling;
    if (replyEl instanceof HTMLElement && replyEl.dataset.role === 'follow-agent') {
      if (rt.tail === replyEl) rt.tail = msg;
      replyEl.remove();
      if (activeConv && idx >= 0) {
        activeConv.messages.splice(idx + 1, 1);
        shiftMsgIndices(idx + 2, -1);
      }
    }

    const reply = followReply(rt.report, newText, model);
    const time = fmtTime(new Date());
    if (activeConv && idx >= 0) {
      shiftMsgIndices(idx + 1, 1);
      activeConv.messages[idx] = { type: 'follow-user', text: newText };
      activeConv.messages.splice(idx + 1, 0, {
        type: 'follow-agent',
        label: reply.label,
        bullets: reply.bullets,
        time,
        model,
      });
    }
    msg.insertAdjacentHTML(
      'afterend',
      followAgentHtml(reply.label, reply.bullets, time, model, idx >= 0 ? idx + 1 : -1, rt.threadId),
    );
    const newReplyEl = msg.nextElementSibling;
    if (rt.tail === msg && newReplyEl instanceof HTMLElement) rt.tail = newReplyEl;

    todaySpend = Math.max(0, todaySpend + usageForModel(model).cost - usageForModel(oldModel).cost);
    saveConvs();
    sidebarRefresh();
    scrollBottom();
    toast('已修改并重新生成');
  });
}

export function sendMessage(text: string): void {
  const query = text.trim();
  if (!query) return;
  const chat = document.getElementById('chat')!;

  dockComposer();
  document.getElementById('welcome')?.remove();
  chat.insertAdjacentHTML('beforeend', userMsgHtml(query));

  const report = matchReport(query);
  const depth = state.depth;
  const conv = recordConversation(report, depth);
  conv.messages.push({ type: 'user', text: query });
  conv.messages.push({ type: 'research', reportId: report.id, depth });
  saveConvs();

  setDepthLocked(true);
  hideFollowDock();
  mountCard(report, depth, false);
  scrollBottom();
}

export function replayConversation(conv: Conversation): void {
  const chat = document.getElementById('chat')!;
  dockComposer();
  document.getElementById('welcome')?.remove();
  chat.innerHTML = '';

  activeConv = conv;
  activeConvId = conv.id;
  state.depth = conv.depth;
  setDepthUI(conv.depth);
  setDepthLocked(true);

  if (!conv.messages || conv.messages.length === 0) {
    conv.messages = [
      { type: 'user', text: reports[conv.reportId].topic },
      { type: 'research', reportId: conv.reportId, depth: conv.depth },
    ];
    saveConvs();
  }

  let thread: CardRuntime | null = null;
  for (let i = 0; i < conv.messages.length; i++) {
    const msg = conv.messages[i];
    const threadId = thread?.threadId ?? '';
    if (msg.type === 'user') {
      chat.insertAdjacentHTML('beforeend', userMsgHtml(msg.text));
      thread = null;
    } else if (msg.type === 'follow-user') {
      const html = userMsgHtml(msg.text, 'follow-user', i, threadId);
      if (thread) appendAfter(thread, html);
      else chat.insertAdjacentHTML('beforeend', html);
    } else if (msg.type === 'follow-agent') {
      const html = followAgentHtml(msg.label, msg.bullets, msg.time || conv.time, msg.model ?? 'pro', i, threadId);
      if (thread) appendAfter(thread, html);
      else chat.insertAdjacentHTML('beforeend', html);
    } else {
      const report = reports[msg.reportId];
      if (!report) continue;
      thread = mountCard(report, msg.depth, true, conv.time);
    }
  }
  setStatus('已完成', 'ok');
  sidebarRefresh();
  scrollBottom();
}

/* ================================================================
 * 八、聊天区事件委托
 * ================================================================ */
function runtimeOf(el: HTMLElement | null): CardRuntime | undefined {
  const card = el?.closest<HTMLElement>('.research-card');
  return card ? runtimes.get(card) : undefined;
}

/** 追问消息在卡片外，靠 data-thread 回查所属报告；底部追问栏回退到当前活跃卡片 */
function runtimeFor(el: HTMLElement | null): CardRuntime | undefined {
  const inCard = runtimeOf(el);
  if (inCard) return inCard;
  const threadId = el?.closest<HTMLElement>('[data-thread]')?.dataset.thread;
  if (threadId) {
    const rt = threads.get(threadId);
    if (rt) return rt;
  }
  return activeRuntime ?? undefined;
}

export function bindChatEvents(): void {
  // 委托到 .main：既覆盖聊天区卡片，也覆盖挂在页面底部的追问栏
  const root = document.querySelector<HTMLElement>('.main')!;

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // 追问消息的操作栏：复制 / 修改 / 删除
    const actBtn = target.closest<HTMLElement>('.ma-btn');
    if (actBtn) {
      const msg = actBtn.closest<HTMLElement>('.msg');
      const rt = runtimeFor(actBtn);
      if (msg && rt) {
        const act = actBtn.dataset.act;
        if (act === 'copy') copyMessage(msg);
        else if (act === 'edit') editFollowMessage(msg, rt);
        else if (act === 'del') deleteFollowMessage(msg, rt);
      }
      return;
    }

    const chip = target.closest<HTMLElement>('.chip');
    if (chip) {
      sendMessage(chip.dataset.query ?? '');
      return;
    }

    // 追问提示词
    const followChip = target.closest<HTMLElement>('.follow-chip');
    if (followChip) {
      const rt = runtimeFor(followChip);
      if (rt) askFollowUp(rt, followChip.dataset.q ?? '');
      return;
    }

    const btn = target.closest<HTMLElement>('[data-act]');
    if (!btn) return;
    const rt = runtimeFor(btn);
    if (!rt) return;

    switch (btn.dataset.act) {
      case 'confirm':
        handleConfirm(rt);
        break;
      case 'retry':
        handleRetry(rt);
        break;
      case 'reader':
        enterReader(rt);
        break;
      case 'exit-reader':
        exitReader(rt);
        break;
      case 'follow': {
        const input = document.querySelector<HTMLInputElement>('#followDock .follow-input');
        askFollowUp(rt, input?.value ?? '');
        break;
      }
      case 'export':
        toast('模拟导出 PDF');
        break;
      case 'share':
        toast('模拟分享链接');
        break;
      default:
        break;
    }
  });

  // 修改意见输入框内回车 = 打回重写；底部追问栏回车 = 追问
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('.interaction-input, .follow-input');
    if (!input) return;
    e.preventDefault();
    const rt = runtimeFor(input);
    if (!rt) return;
    if (input.classList.contains('follow-input')) askFollowUp(rt, input.value);
    else handleRetry(rt);
  });

  // 追问栏与顶部输入框共用 state.model，两处下拉框互相同步
  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    const dockSelect = document.getElementById('followModelSelect') as HTMLSelectElement | null;
    const composerSelect = document.getElementById('modelSelect') as HTMLSelectElement | null;
    if (target.id === 'followModelSelect') {
      state.model = (target as HTMLSelectElement).value;
      if (composerSelect) {
        composerSelect.value = state.model;
        composerSelect.dispatchEvent(new Event('change'));
      }
    } else if (target.id === 'modelSelect') {
      if (dockSelect) dockSelect.value = state.model;
    }
  });
}
