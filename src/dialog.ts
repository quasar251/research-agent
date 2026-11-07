import {
  reports,
  STRENGTH_LABEL,
  type Report,
  type Section,
  type SeriesPoint,
  type BarItem,
  type SwotItem,
  type RiskItem,
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
 * 对话区模块（按 dialog.html 原型重写）
 * ----------------------------------------------------------------
 * 1. 会话存储（历史对话持久化）
 * 2. 新建调研页（欢迎态 / 文字墙 / 输入框浮沉）
 * 3. 调研主卡片骨架（步骤栏 + 文档区 + 确认面板 + 底部按钮）
 * 4. 四步流程引擎（loading → final，可确认 / 修改重生成）
 * 5. 报告片段渲染（趋势图 / 占比条 / SWOT / 风险矩阵 / 引用）
 * 6. 阅读模式 / 消息发送 / 聊天区事件委托
 * ================================================================ */

/* ================================================================
 * 一、会话存储（历史对话持久化）
 * ================================================================ */
export type ChatMessage =
  | { type: 'user'; text: string }
  | { type: 'research'; reportId: string; depth: ReportDepth }
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
    return { type: 'research', reportId: m.reportId, depth: m.depth ?? 'deep' };
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
 * 三、报告片段渲染（图表 / SWOT / 风险矩阵）
 * ================================================================ */
function lineChart(series: SeriesPoint[], unit: string): string {
  if (series.length === 0) return '<div class="doc-text">暂无数据</div>';

  const W = 600;
  const H = 240;
  const PL = 50;
  const PR = 18;
  const PT = 22;
  const PB = 36;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const max = Math.max(...series.map((s) => s.value)) * 1.18 || 1;
  const n = series.length;
  const x = (i: number) => PL + (n === 1 ? 0 : (i * innerW) / (n - 1));
  const y = (v: number) => PT + innerH * (1 - v / max);
  const pts = series.map((s, i) => ({ ...s, px: x(i), py: y(s.value) }));
  const line = pts.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
  const area = `${line} ${x(n - 1).toFixed(1)},${(PT + innerH).toFixed(1)} ${x(0).toFixed(1)},${(PT + innerH).toFixed(1)}`;

  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const gy = PT + (innerH * g) / 4;
    const val = Math.round(max - (max * g) / 4);
    grid += `<line x1="${PL}" y1="${gy.toFixed(1)}" x2="${W - PR}" y2="${gy.toFixed(1)}" class="grid" />`;
    grid += `<text x="${PL - 8}" y="${(gy + 4).toFixed(1)}" class="axis" text-anchor="end">${val}</text>`;
  }
  const labels = pts
    .map((p) => `<text x="${p.px.toFixed(1)}" y="${H - PB + 20}" class="axis tick" text-anchor="middle">${p.year}</text>`)
    .join('');
  const dots = pts.map((p) => `<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="3.5" class="dot" />`).join('');
  const valLabels = pts
    .map(
      (p) => `<text x="${p.px.toFixed(1)}" y="${(p.py - 11).toFixed(1)}" class="vlabel" text-anchor="middle">${p.value}</text>`,
    )
    .join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(unit)} 趋势图">
      ${grid}
      <path d="M${area}Z" class="area" />
      <polyline points="${line}" class="line" />
      ${dots}${valLabels}${labels}
    </svg>
    <div class="chart-caption">单位：${esc(unit)} · 虚拟数据</div>`;
}

function barList(bars: BarItem[]): string {
  return `<div class="bars">${bars
    .map(
      (b) => `
    <div class="bar-row">
      <div class="bar-name">${esc(b.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${b.pct}%"></div></div>
      <div class="bar-val">${b.pct}%</div>
    </div>`,
    )
    .join('')}</div>`;
}

function swotHtml(swot: SwotItem): string {
  const cell = (title: string, items: string[], cls: string) => `
    <div class="swot-cell ${cls}">
      <div class="swot-cell-title">${title}</div>
      <ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>`;
  return `
    <div class="swot-grid">
      ${cell('S · 优势', swot.strengths, 'swot-s')}
      ${cell('W · 劣势', swot.weaknesses, 'swot-w')}
      ${cell('O · 机会', swot.opportunities, 'swot-o')}
      ${cell('T · 威胁', swot.threats, 'swot-t')}
    </div>`;
}

function riskMatrixHtml(risks: RiskItem[]): string {
  const level = (v: number) => (v >= 4 ? 'high' : v === 3 ? 'mid' : 'low');
  const rows = risks
    .map(
      (r) => `
    <div class="risk-row">
      <span class="risk-name">${esc(r.name)}</span>
      <span class="risk-metric">
        <span class="risk-tag risk-l-${level(r.likelihood)}">概率 ${r.likelihood}/5</span>
        <span class="risk-tag risk-i-${level(r.impact)}">影响 ${r.impact}/5</span>
      </span>
    </div>`,
    )
    .join('');
  return `<div class="risk-matrix">${rows}</div>`;
}

function bulletsHtml(list: string[]): string {
  return `<ul class="bullets">${list.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
}

function sectionBody(s: Section | undefined): string {
  if (!s) return '';
  if (s.kind === 'prose') {
    return `<div class="doc-text">${(s.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
  }
  if (s.kind === 'bullets') return bulletsHtml(s.bullets ?? []);
  if (s.kind === 'chart') {
    return `
      <div class="chart-box">
        <div class="chart-title">${esc(s.heading)}${s.unit ? ` · 单位：${esc(s.unit)}` : ''}</div>
        <div class="chart-wrap">${lineChart(s.series ?? [], s.unit ?? '')}</div>
      </div>`;
  }
  if (s.kind === 'bars') {
    return `<div class="chart-box"><div class="chart-title">${esc(s.heading)}</div>${barList(s.bars ?? [])}</div>`;
  }
  if (s.kind === 'swot') return s.swot ? swotHtml(s.swot) : '';
  return riskMatrixHtml(s.risks ?? []);
}

/* ================================================================
 * 四、四步流程定义（对齐 dialog.html 的 flowData）
 * ================================================================ */
const NUM = ['一', '二', '三', '四'];

interface FlowStep {
  /** 步骤名（左侧思考过程） */
  name: string;
  /** 全局进度百分比 */
  percent: number;
  /** 是否需要用户确认后再进入下一步 */
  needConfirm: boolean;
  /** 执行中状态文案 */
  runningText: string;
  /** 骨架屏上方的说明文案 */
  loadingText: string;
  /** 确认面板提示语 */
  hint: string;
  /** 骨架线条数 */
  skeleton: number;
  /** 章节标题 */
  heading: (r: Report, depth: ReportDepth) => string;
  /** 章节正文 */
  render: (r: Report, depth: ReportDepth) => string;
}

interface PickedSections {
  overview?: Section;
  market?: Section;
  cross?: Section;
}

function pickSections(r: Report, depth: ReportDepth): PickedSections {
  const visible = depth === 'deep' ? r.sections : r.sections.filter((s) => s.depth !== 'deep');
  const overview = visible.find((s) => s.kind === 'prose');
  const market = visible.find((s) => s.kind === 'chart') ?? visible.find((s) => s.kind === 'bars');
  const cross =
    visible.find((s) => s.kind === 'swot') ??
    visible.find((s) => s.kind === 'risk') ??
    visible.find((s) => s.kind === 'bullets' && s.heading.includes('趋势')) ??
    visible.find((s) => s.kind === 'bullets');
  return { overview, market, cross };
}

function docHead(r: Report, depth: ReportDepth): string {
  const tags = r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const depthLabel = depth === 'deep' ? '深度报告' : '简版报告';
  return `
    <div class="doc-h1">${esc(r.topic)}${depth === 'deep' ? '深度' : '简版'}洞察</div>
    <div class="report-meta">${tags}<span class="tag depth-tag">${depthLabel}</span><span class="updated">更新于 ${esc(r.updatedAt)}</span></div>
    <p class="report-summary">${esc(r.summary)}</p>`;
}

function conclusionHtml(r: Report): string {
  const takes = r.takeaways
    .map(
      (t) => `<li>${esc(t.text)}<span class="strength strength-${t.strength}">${STRENGTH_LABEL[t.strength]}</span></li>`,
    )
    .join('');
  const cites = r.citations
    .map(
      (c, i) =>
        `<li><span class="src">[${i + 1}]</span> ${esc(c.title)} <span class="strength strength-${c.strength}">${STRENGTH_LABEL[c.strength]}</span> <span class="src-meta">· ${esc(c.source)} · ${esc(c.date)}</span></li>`,
    )
    .join('');
  return `
    <div class="takeaways">
      <div class="takeaways-title">核心结论</div>
      <ol>${takes}</ol>
    </div>
    <div class="citations">
      <div class="citations-title">参考来源</div>
      <ol>${cites}</ol>
    </div>
    <p class="footnote">注：本报告全部数据与图表均为演示用虚拟数据，不构成任何投资建议。</p>`;
}

const STEPS: FlowStep[] = [
  {
    name: '拆解问题与大纲',
    percent: 20,
    needConfirm: true,
    runningText: '正在构建调研框架...',
    loadingText: '研衡正在解析研究主题，拆解子问题并生成报告大纲...',
    hint: '大纲与首章已生成，请确认是否需要补充研究方向？',
    skeleton: 2,
    heading: (r, depth) => pickSections(r, depth).overview?.heading ?? '行业概览',
    render: (r, depth) => {
      const body = sectionBody(pickSections(r, depth).overview);
      return body || `<div class="doc-text"><p>${esc(r.summary)}</p></div>`;
    },
  },
  {
    name: '全网数据检索',
    percent: 50,
    needConfirm: true,
    runningText: '正在抓取多源数据库...',
    loadingText: '研衡正在提取市场规模与关键指标，交叉比对多源口径...',
    hint: '市场数据已生成，您可以指定关注的细分赛道，或直接确认继续。',
    skeleton: 3,
    heading: (r, depth) => pickSections(r, depth).market?.heading ?? '市场规模',
    render: (r, depth) => {
      const market = pickSections(r, depth).market;
      if (market) return sectionBody(market);
      return bulletsHtml(r.takeaways.slice(0, 3).map((t) => t.text));
    },
  },
  {
    name: '深度交叉验证',
    percent: 80,
    needConfirm: false,
    runningText: '正在交叉验证与结构化分析...',
    loadingText: '研衡正在做证据可信度分级、结论交叉校验与结构化分析...',
    hint: '',
    skeleton: 2,
    heading: (r, depth) => pickSections(r, depth).cross?.heading ?? '交叉验证要点',
    render: (r, depth) => {
      const cross = pickSections(r, depth).cross;
      if (cross) return sectionBody(cross);
      return bulletsHtml(r.takeaways.slice(0, 3).map((t) => t.text));
    },
  },
  {
    name: '最终报告合成',
    percent: 100,
    needConfirm: false,
    runningText: '正在输出结构化洞察...',
    loadingText: '研衡正在聚合结论、去重并生成最终报告...',
    hint: '',
    skeleton: 3,
    heading: () => '综合洞察与建议',
    render: (r) => conclusionHtml(r),
  },
];

/* ================================================================
 * 五、卡片骨架与运行时
 * ================================================================ */
const BACK_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

interface CardRuntime {
  card: HTMLElement;
  report: Report;
  depth: ReportDepth;
  /** 当前执行到第几步 */
  index: number;
  /** 是否停在确认面板等待用户操作 */
  waiting: boolean;
  /** 四步是否已全部完成 */
  finished: boolean;
  /** 卡片线程的最后一个元素（追问消息插在它后面，保证顺序） */
  tail: HTMLElement;
  /** 线程标识，追问消息靠它回查所属报告 */
  threadId: string;
}

const runtimes = new WeakMap<HTMLElement, CardRuntime>();
const threads = new Map<string, CardRuntime>();
/** 底部追问栏当前指向的调研卡片 */
let activeRuntime: CardRuntime | null = null;

function usageText(depth: ReportDepth): string {
  const u = usageFor(depth);
  return `token ${((u.inT + u.outT) / 1000).toFixed(1)}k · ¥${u.cost.toFixed(2)}`;
}

function stepsHtml(): string {
  return STEPS.map(
    (s, i) => `
      <div class="step-item pending" data-step="${i}">
        <div class="step-icon"></div>
        <div class="step-content">
          <div class="step-name">${esc(s.name)}</div>
          <div class="step-status-text">${esc(s.runningText)}</div>
        </div>
      </div>`,
  ).join('');
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
      <div class="follow-body">${bulletsHtml(bullets)}</div>
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
          <div class="header-tag">Deep Research</div>
          <div class="header-title">正在深度调研：<span>${esc(r.domain)}</span></div>
        </div>
        <button class="back-btn" data-act="exit-reader">${BACK_SVG}返回调研过程</button>
      </header>
      <div class="main-card">
        <div class="global-progress"><div class="global-progress-fill"></div></div>
        <div class="reader-toolbar">
          <div class="toolbar-title">${esc(r.topic)} · ${esc(model)} · ${usageText(depth)} · 生成于 ${esc(r.updatedAt)}</div>
          <div class="toolbar-actions">
            <button class="btn-outline" data-act="export">导出 PDF</button>
            <button class="btn-outline" data-act="share">分享报告</button>
          </div>
        </div>
        <div class="card-body">
          <aside class="thinking-sidebar">
            <div class="sidebar-title">研衡思考过程</div>
            <div class="steps-container">${stepsHtml()}</div>
          </aside>
          <div class="document-area"></div>
        </div>
        <div class="interaction-panel">
          <div class="interaction-header"><div class="interaction-title"></div></div>
          <div class="interaction-input-group">
            <input class="interaction-input" type="text" placeholder="对当前结果不满意？输入修改意见（例如：增加海外市场分析、关注技术壁垒...）" />
            <button class="btn-retry" data-act="retry">修改重生成</button>
            <button class="btn-confirm" data-act="confirm">确认，继续下一步</button>
          </div>
        </div>
        <div class="card-footer">
          <div class="msg-foot">
            <span class="agent-time">${fmtTime(new Date())}</span>
            ${usageChip(usageFor(depth))}
          </div>
          <button class="btn btn-disabled" data-act="reader">正在生成报告...</button>
        </div>
      </div>
    </div>`;
}

/* ---------------- DOM 访问助手 ---------------- */
function docArea(rt: CardRuntime): HTMLElement | null {
  return rt.card.querySelector<HTMLElement>('.document-area');
}

function footerBtn(rt: CardRuntime): HTMLButtonElement {
  return rt.card.querySelector<HTMLButtonElement>('.card-footer .btn')!;
}

function setProgress(rt: CardRuntime, pct: number): void {
  const fill = rt.card.querySelector<HTMLElement>('.global-progress-fill');
  if (fill) fill.style.width = `${pct}%`;
}

type StepState = 'pending' | 'active' | 'waiting' | 'completed';

function setStepState(rt: CardRuntime, i: number, st: StepState, text?: string): void {
  const el = rt.card.querySelectorAll<HTMLElement>('.step-item')[i];
  if (!el) return;
  el.classList.remove('pending', 'active', 'waiting', 'completed');
  el.classList.add(st);
  const t = el.querySelector<HTMLElement>('.step-status-text');
  if (t && text !== undefined) t.textContent = text;
}

function syncHeader(rt: CardRuntime): void {
  const tag = rt.card.querySelector<HTMLElement>('.header-tag');
  const title = rt.card.querySelector<HTMLElement>('.header-title');
  if (!tag || !title) return;
  if (rt.finished) {
    tag.textContent = 'Report Completed';
    tag.classList.add('success');
    title.innerHTML = `${esc(rt.report.topic)}<span class="header-done">✓ 已完成</span>`;
  } else {
    tag.textContent = 'Deep Research';
    tag.classList.remove('success');
    title.innerHTML = `正在深度调研：<span>${esc(rt.report.domain)}</span>`;
  }
}

/** 写入卡片底部的生成时间 */
function syncMeta(rt: CardRuntime, time: string): void {
  const el = rt.card.querySelector<HTMLElement>('.card-footer .agent-time');
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
  const panel = rt.card.querySelector<HTMLElement>('.interaction-panel');
  const title = rt.card.querySelector<HTMLElement>('.interaction-title');
  if (!panel || !title) return;
  title.textContent = hint;
  panel.classList.add('show');
  scrollDoc(rt);
}

function closePanel(rt: CardRuntime): void {
  rt.card.querySelector('.interaction-panel')?.classList.remove('show');
}

function scrollDoc(rt: CardRuntime): void {
  const doc = docArea(rt);
  if (doc) doc.scrollTo({ top: doc.scrollHeight, behavior: 'smooth' });
}

/* ---------------- 文档块 ---------------- */
function skeletonHtml(n: number): string {
  const cls = ['w-100', 'w-80', 'w-60'];
  const lines = Array.from({ length: n }, (_, k) => `<div class="skeleton-line ${cls[k % cls.length]}"></div>`).join('');
  return `<div class="skeleton-group">${lines}</div>`;
}

function blockHead(rt: CardRuntime, i: number): string {
  const step = STEPS[i];
  return `<div class="doc-h2">${NUM[i]}、${esc(step.heading(rt.report, rt.depth))}</div>`;
}

function loadingHtml(rt: CardRuntime, i: number, note?: string): string {
  const step = STEPS[i];
  const head = i === 0 ? docHead(rt.report, rt.depth) : '';
  const tip = note ? `<div class="doc-note">${esc(note)}</div>` : `<div class="doc-text doc-pending">${esc(step.loadingText)}</div>`;
  return `
    <div class="doc-content" data-block="${i}">
      ${head}
      ${blockHead(rt, i)}
      ${tip}
      ${skeletonHtml(step.skeleton)}
    </div>`;
}

function finalHtml(rt: CardRuntime, i: number, feedback?: string): string {
  const step = STEPS[i];
  const head = i === 0 ? docHead(rt.report, rt.depth) : '';
  const note = feedback ? `<div class="doc-note">已按您的指令调整：${esc(feedback)}</div>` : '';
  return `
    <div class="doc-content" data-block="${i}">
      ${head}
      ${blockHead(rt, i)}
      ${note}
      ${step.render(rt.report, rt.depth)}
    </div>`;
}

function replaceBlock(rt: CardRuntime, i: number, html: string): void {
  const doc = docArea(rt);
  if (!doc) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const next = tmp.firstElementChild;
  if (!next) return;
  const old = doc.querySelector<HTMLElement>(`[data-block="${i}"]`);
  if (old) old.replaceWith(next);
  else doc.appendChild(next);
}

/* ================================================================
 * 六、四步流程引擎
 * ================================================================ */
function alive(rt: CardRuntime): boolean {
  return rt.card.isConnected;
}

function startFlow(rt: CardRuntime): void {
  setStatus('拆解问题与大纲…', 'busy');
  window.setTimeout(() => executeStep(rt), 400);
}

function executeStep(rt: CardRuntime): void {
  if (!alive(rt)) return;
  if (rt.index >= STEPS.length) {
    finishCard(rt);
    return;
  }
  const i = rt.index;
  const step = STEPS[i];
  setProgress(rt, step.percent);
  setStepState(rt, i, 'active', step.runningText);
  setStatus(`${step.name}…`, 'busy');

  const doc = docArea(rt);
  if (doc) {
    doc.insertAdjacentHTML('beforeend', loadingHtml(rt, i));
    scrollDoc(rt);
  }

  if (step.needConfirm) {
    rt.waiting = true;
    setStepState(rt, i, 'waiting', '等待您的确认...');
    openPanel(rt, step.hint);
  } else {
    window.setTimeout(() => settleStep(rt), 1400);
  }
}

function settleStep(rt: CardRuntime): void {
  if (!alive(rt)) return;
  const i = rt.index;
  replaceBlock(rt, i, finalHtml(rt, i));
  scrollDoc(rt);
  completeStep(rt);
}

function completeStep(rt: CardRuntime): void {
  if (!alive(rt)) return;
  setStepState(rt, rt.index, 'completed', '已完成');
  rt.index += 1;
  window.setTimeout(() => executeStep(rt), 700);
}

function finishCard(rt: CardRuntime): void {
  rt.finished = true;
  rt.waiting = false;
  closePanel(rt);
  const btn = footerBtn(rt);
  btn.className = 'btn btn-ready';
  btn.textContent = '查看完整报告 ➤';
  syncHeader(rt);
  syncMeta(rt, fmtTime(new Date()));
  showFollowUp(rt);
  setProgress(rt, 100);
  setStatus('已完成', 'ok');
  scrollDoc(rt);
}

/** 「确认，继续下一步」：把当前 loading 块换成 final，并推进 */
function confirmStep(rt: CardRuntime): void {
  if (!rt.waiting) return;
  rt.waiting = false;
  closePanel(rt);
  const i = rt.index;
  replaceBlock(rt, i, finalHtml(rt, i));
  scrollDoc(rt);
  completeStep(rt);
}

/** 「修改重生成」：按反馈重新生成当前步骤，再回到确认态 */
function retryStep(rt: CardRuntime): void {
  if (!rt.waiting) return;
  const i = rt.index;
  const input = rt.card.querySelector<HTMLInputElement>('.interaction-input');
  const feedback = (input?.value ?? '').trim();
  if (input) input.value = '';

  rt.waiting = false;
  closePanel(rt);
  setStepState(rt, i, 'active', '正在根据您的反馈重新生成...');
  setStatus('按反馈重新生成…', 'busy');
  replaceBlock(rt, i, loadingHtml(rt, i, `收到您的指令：${feedback || '重新评估当前内容'}。研衡正在调整模型输出...`));
  scrollDoc(rt);

  window.setTimeout(() => {
    if (!alive(rt)) return;
    replaceBlock(rt, i, finalHtml(rt, i, feedback || '重新评估当前内容'));
    scrollDoc(rt);
    if (STEPS[i].needConfirm) {
      rt.waiting = true;
      setStepState(rt, i, 'waiting', '等待您的确认...');
      openPanel(rt, `已重新生成，请确认，或继续输入修改意见。`);
      setStatus('等待确认', 'idle');
    } else {
      completeStep(rt);
    }
  }, 1800);
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
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 1600);
}

/* ---------------- 挂载卡片 ---------------- */
function mountCard(report: Report, depth: ReportDepth, finished: boolean, metaTime?: string): CardRuntime {
  const chat = document.getElementById('chat')!;
  const id = `${report.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  chat.insertAdjacentHTML('beforeend', cardHtml(id, report, depth));
  const card = chat.querySelector<HTMLElement>(`.research-card[data-card="${id}"]`)!;
  const rt: CardRuntime = { card, report, depth, index: 0, waiting: false, finished: false, tail: card, threadId: id };
  runtimes.set(card, rt);
  threads.set(id, rt);
  activeRuntime = rt;

  if (finished) {
    renderDone(rt, metaTime);
  } else {
    startFlow(rt);
  }
  return rt;
}

/** 回放：直接渲染为全部完成态 */
function renderDone(rt: CardRuntime, metaTime?: string): void {
  const doc = docArea(rt);
  if (!doc) return;
  doc.innerHTML = STEPS.map((_, i) => finalHtml(rt, i)).join('');
  STEPS.forEach((_, i) => setStepState(rt, i, 'completed', '已完成'));
  rt.index = STEPS.length;
  rt.finished = true;
  rt.waiting = false;
  setProgress(rt, 100);
  const btn = footerBtn(rt);
  btn.className = 'btn btn-ready';
  btn.textContent = '查看完整报告 ➤';
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

function matchReport(q: string): Report {
  const t = q.toLowerCase();
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

function followReply(r: Report, q: string, model: string): { label: string; bullets: string[] } {
  return {
    label: `追问 · ${r.domain} · ${MODEL_LABEL[model] ?? model}`,
    bullets: [
      `关于「${q}」，由 ${MODEL_LABEL[model] ?? model} 结合 ${r.domain} 的最新公开数据作答：该议题仍处快速演进阶段，短期存在口径分歧。`,
      `建议下一步：拉取近 12 个月的相关来源，并对头部厂商的公开口径做交叉核对（完整回复需接入实时数据源）。`,
    ],
  };
}

function askFollowUp(rt: CardRuntime, raw: string): void {
  if (!rt.finished) return;
  const q = raw.trim();
  if (!q) return;
  const input = document.querySelector<HTMLInputElement>('#followDock .follow-input');
  if (input) input.value = '';

  const model = state.model;
  const usage = usageForModel(model);
  const reply = followReply(rt.report, q, model);
  const time = fmtTime(new Date());
  const baseIndex = activeConv ? activeConv.messages.length : -1;
  appendAfter(rt, userMsgHtml(q, 'follow-user', baseIndex, rt.threadId));
  appendAfter(rt, followAgentHtml(reply.label, reply.bullets, time, model, baseIndex >= 0 ? baseIndex + 1 : -1, rt.threadId));

  todaySpend += usage.cost;
  if (activeConv) {
    activeConv.messages.push({ type: 'follow-user', text: q });
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
        confirmStep(rt);
        break;
      case 'retry':
        retryStep(rt);
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

  // 修改意见输入框内回车 = 修改重生成；底部追问栏回车 = 追问
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('.interaction-input, .follow-input');
    if (!input) return;
    e.preventDefault();
    const rt = runtimeFor(input);
    if (!rt) return;
    if (input.classList.contains('follow-input')) askFollowUp(rt, input.value);
    else retryStep(rt);
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
