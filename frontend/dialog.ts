import { reports, type Report, type ReportDepth } from './mock';
import {
  matchReportFromBackend,
  followFromBackend,
  sendActionToBackend,
} from './demoApi';
import {
  esc,
  fmtTime,
  state,
  setDepthLocked,
  setDepthUI,
  setStatus,
  scrollBottom,
  usageForModel,
  MODEL_LABEL,
} from './common';
import { fullReportHtml } from './report';
import { buildStages, type StageDef } from './stages';
import {
  activeConv,
  todaySpend,
  saveConvs,
  refreshSidebar,
  recordConversation,
  setActiveConv,
  setTodaySpend,
  type Conversation,
} from './store';
import {
  welcomeHtml,
  wordWallHtml,
  ensureFollowDock,
  msgActionsHtml,
  followAgentHtml,
  cardHtml,
  userMsgHtml,
} from './views';

/* ================================================================
 * 对话区模块（多 Agent 协同 DAG 的交互与流程引擎）
 * ----------------------------------------------------------------
 * 会话存储见 store.ts，五阶段内容构建见 stages.ts。
 * 本模块只负责：
 * 1. 新建调研页（欢迎态 / 文字墙 / 输入框浮沉）
 * 2. 调研主卡片骨架（顶部 Stepper + 拓扑侧栏 + 文档区 + HITL 面板）
 * 3. 五阶段 DAG 流程引擎（流式执行卡片 + 阶段结果 + 用户审批）
 * 4. 阅读模式 / 消息发送 / 聊天区事件委托
 * ================================================================ */

/* ================================================================
 * 二、新建调研页（欢迎态）
 * ================================================================ */
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
  lockPageScroll(false);
  threads.clear();
  activeRuntime = null;
  setActiveConv(null);
  setDepthLocked(false);
  refreshSidebar();
  setStatus('待命中', 'idle');
}

/* ================================================================
 * 四、卡片骨架与运行时
 * ================================================================ */
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
  /** 该阶段的审批是否已确认（区分“停在审批”与“已确认继续”） */
  resumeHitlDone: boolean;
  /** 会话中对应 research 消息的下标（用于持久化进度） */
  researchMsgIndex: number;
  /** 所属会话（进度写回它，而非当前查看的会话） */
  conv: Conversation | null;
  /** 阅读模式下暂存的调研过程 HTML（返回时恢复） */
  savedDocHtml: string;
  /** 文档区当前是否展示完整报告 */
  reportShown: boolean;
  /** 用户输入的调研主题（显示在卡片头部「正在深度调研：」之后） */
  query: string;
}

const runtimes = new WeakMap<HTMLElement, CardRuntime>();
const threads = new Map<string, CardRuntime>();
/** 底部追问栏当前指向的调研卡片 */
let activeRuntime: CardRuntime | null = null;
/** 当前挂载中的活跃卡片（用于窗口尺寸变化时重绘拓扑连线） */
const liveCards = new Set<CardRuntime>();

// 窄屏时拓扑侧栏隐藏导致连线坐标为 0，恢复宽屏后需按实际布局重绘
window.addEventListener('resize', () => {
  for (const rt of liveCards) {
    if (!rt.card.isConnected) liveCards.delete(rt);
    else if (!rt.finished) drawLines(rt);
  }
});

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
    title.innerHTML = `正在深度调研：<span>${esc(rt.query || rt.report.domain)}</span>`;
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

/** 供控制台等外部视图查询：当前是否仍有调研在跑 */
export function isResearchRunning(): boolean {
  return activeRuntime !== null && !activeRuntime.finished;
}

/** 供控制台关闭后恢复追问栏（仅当活跃卡片已完成） */
export function restoreFollowDock(): void {
  if (activeRuntime?.finished) showFollowUp(activeRuntime);
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
    m: q(rt, '.wf-node[data-agent="m"]') as HTMLElement,
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
  const m = rect(nodes.m), s = rect(nodes.s), a = rect(nodes.a), c = rect(nodes.c);

  const createPath = (sx: number, sy: number, ex: number, ey: number, type: 'v' | 'h' = 'v') => {
    if (type === 'v') { const my = sy + (ey - sy) / 2; return `M ${sx} ${sy} L ${sx} ${my} L ${ex} ${my} L ${ex} ${ey}`; }
    const mx = sx + (ex - sx) / 2; return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`;
  };

  /* 简单模式：线性流水线拓扑 M → S → A → C →（反馈）→ M */
  const isSimple = rt.card.dataset.depth === 'simple';
  const paths = isSimple
    ? [
        { id: 'path-m-s', d: `M ${m.cx} ${m.y + m.h} L ${s.cx} ${s.y}` },
        { id: 'path-s-a', d: `M ${s.cx} ${s.y + s.h} L ${a.cx} ${a.y}` },
        { id: 'path-a-c', d: `M ${a.cx} ${a.y + a.h} L ${c.cx} ${c.y}` },
        { id: 'path-c-m', d: `M ${c.x} ${c.cy} L ${m.x - 45} ${c.cy} L ${m.x - 45} ${m.cy} L ${m.x} ${m.cy}` },
      ]
    : [
        { id: 'path-m-s', d: createPath(m.cx, m.y + m.h, s.cx, s.y) },
        { id: 'path-m-a', d: createPath(m.cx, m.y + m.h, a.cx, a.y) },
        { id: 'path-s-a', d: createPath(s.x + s.w, s.cy, a.x, a.cy, 'h') },
        { id: 'path-a-c', d: createPath(a.cx, a.y + a.h, c.cx, c.y) },
        { id: 'path-c-m', d: `M ${c.x} ${c.cy} L ${m.x - 45} ${c.cy} L ${m.x - 45} ${m.cy} L ${m.x} ${m.cy}` },
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
  sendActionToBackend('confirm', rt.report.id, rt.index, '');
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
  sendActionToBackend('retry', rt.report.id, rt.index, feedback);

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

/** 把进度写回所属会话的 research 消息（切换会话后可续跑） */
function saveStageProgress(rt: CardRuntime, n: number, hitlDone: boolean): void {
  rt.resumeStage = n;
  rt.resumeHitlDone = hitlDone;
  const m = rt.conv?.messages[rt.researchMsgIndex];
  if (m?.type === 'research') {
    m.stage = n;
    m.hitlDone = hitlDone;
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
    setNodeState(rt, 'm', '等待审批', 'waiting');
    setNodeState(rt, 's', '暂停等待', 'waiting');
    setNodeState(rt, 'a', '暂停等待', 'waiting');
    setPathState(rt, 'path-m-s', 'waiting');
    setPathState(rt, 'path-m-a', 'waiting');
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

  /* 简单模式：三阶段轻量管线的编排 */
  if (rt.depth === 'simple') {
    if (i === 0) {
      setStatus('规划与检索…', 'busy');
      setBanner(rt, 'Master 快速拆解任务，Scout 同步检索...');
      setNodeState(rt, 'm', '规划中...', 'active');
      const el = startStage(rt, 0);
      await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
      if (!alive(rt)) return;
      setBanner(rt, '计划就绪，Scout 正在检索关键数据...');
      setPathState(rt, 'path-m-s', 'flowing');
      setNodeState(rt, 'm', '计划就绪', 'idle');
      setNodeState(rt, 's', '检索中...', 'active');
      await runWorkCard(rt, st.cards[1].title, st.cards[1].logs, st.cards[1].ms, el);
      if (!alive(rt)) return;
      el.insertAdjacentHTML('beforeend', st.result);
      scrollDoc(rt);
      setPathState(rt, 'path-m-s', 'idle');
      setNodeState(rt, 's', '检索完成', 'idle');
      await sleep(rt, 600);
      return;
    }
    if (i === 1) {
      setStatus('速览分析…', 'busy');
      setBanner(rt, 'Scout 数据交给 Analyst，开始速览分析...');
      setPathState(rt, 'path-s-a', 'flowing');
      setNodeState(rt, 'a', '速览分析...', 'active');
      const el = startStage(rt, 1);
      await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
      if (!alive(rt)) return;
      el.insertAdjacentHTML('beforeend', st.result);
      scrollDoc(rt);
      setPathState(rt, 'path-s-a', 'idle');
      setNodeState(rt, 'a', '分析完成', 'idle');
      return;
    }
    // i === 2
    setStatus('核验与报告…', 'busy');
    setBanner(rt, 'Analyst 结论交由 Critic 快速核验...');
    setPathState(rt, 'path-a-c', 'flowing');
    setNodeState(rt, 'c', '快速核验...', 'active');
    const el = startStage(rt, 2);
    await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
    if (!alive(rt)) return;
    setBanner(rt, '核验通过，Master 正在整合报告...');
    setPathState(rt, 'path-a-c', 'idle');
    setPathState(rt, 'path-c-m', 'flowing');
    setNodeState(rt, 'c', '核验通过', 'idle');
    setNodeState(rt, 'm', '排版中...', 'active');
    await runWorkCard(rt, st.cards[1].title, st.cards[1].logs, st.cards[1].ms, el);
    if (!alive(rt)) return;
    el.insertAdjacentHTML('beforeend', st.result);
    scrollDoc(rt);
    setPathState(rt, 'path-c-m', 'idle');
    await sleep(rt, 800);
    return;
  }

  if (i === 0) {
    setBanner(rt, '系统初始化，Master 正在拆解调研任务...');
    setNodeState(rt, 'm', '正在拆解任务...', 'active');
    const el = startStage(rt, 0);
    await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
    if (!alive(rt)) return;
    el.insertAdjacentHTML('beforeend', st.result);
    scrollDoc(rt);
    await sleep(rt, 800);
    if (!alive(rt)) return;
    setBanner(rt, 'Master 分析完毕，正在将任务分发给下游 Agent...');
    setNodeState(rt, 'm', '正在分发任务...', 'active');
    setPathState(rt, 'path-m-s', 'flowing');
    setPathState(rt, 'path-m-a', 'flowing');
    setNodeState(rt, 's', '接收任务...', 'active');
    setNodeState(rt, 'a', '接收任务...', 'active');
    await sleep(rt, 1500);
    return;
  }

  if (i === 1) {
    setBanner(rt, '用户已确认。Scout 正在全速检索数据...');
    setStatus('数据检索…', 'busy');
    setPathState(rt, 'path-m-s', 'flowing');
    setPathState(rt, 'path-m-a', 'idle');
    setNodeState(rt, 'm', '执行中', 'idle');
    setNodeState(rt, 's', '检索中...', 'active');
    setNodeState(rt, 'a', '待命', 'idle');
    const el = startStage(rt, 1);
    await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
    if (!alive(rt)) return;

    setBanner(rt, 'Scout 检索完成，正将数据传给 Analyst...');
    setPathState(rt, 'path-m-s', 'idle');
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
    setPathState(rt, 'path-c-m', 'flowing');
    setNodeState(rt, 'c', '审查完毕', 'idle');
    setNodeState(rt, 'm', '接收反馈', 'active');
    await sleep(rt, 1500);
    return;
  }

  // i === 4
  setBanner(rt, 'Master 正在整合最终报告...');
  setStatus('生成报告…', 'busy');
  setPathState(rt, 'path-c-m', 'idle');
  setNodeState(rt, 'm', '排版中...', 'active');
  const el = startStage(rt, 4);
  await runWorkCard(rt, st.cards[0].title, st.cards[0].logs, st.cards[0].ms, el);
  if (!alive(rt)) return;
  el.insertAdjacentHTML('beforeend', st.result);
  scrollDoc(rt);
  await sleep(rt, 1000);
}

async function runDag(rt: CardRuntime): Promise<void> {
  drawLines(rt);
  const n = rt.stages.length;
  for (let i = 0; i < n; i++) setStepperState(rt, i, 'idle');

  // 恢复此前已完成的阶段（切换会话后回来续跑）；旧数据按新阶段数裁剪
  const from = Math.min(rt.resumeStage, n);
  for (let k = 0; k < from; k++) {
    restoreStage(rt, k);
    setStepperState(rt, k, 'completed');
  }
  if (from > 0) markNodesDone(rt);

  // 上次停在审批点：直接恢复审批面板，不重跑已完成阶段
  if (from >= 1 && from < n && rt.stages[from - 1].hitl && !rt.resumeHitlDone) {
    await enterHitl(rt, from - 1);
    if (!alive(rt)) return;
    saveStageProgress(rt, from, true);
  }

  for (let i = from; i < n; i++) {
    await runStage(rt, i);
    if (!alive(rt)) return;

    const hitl = rt.stages[i].hitl;
    saveStageProgress(rt, i + 1, false);
    if (hitl) {
      await enterHitl(rt, i);
      if (!alive(rt)) return;
      saveStageProgress(rt, i + 1, true);
    }
    setStepperState(rt, i, 'completed');
  }

  finishCard(rt);
}

function finishCard(rt: CardRuntime): void {
  rt.finished = true;
  rt.waiting = false;
  saveStageProgress(rt, 5, true);
  setStepperState(rt, rt.stages.length - 1, 'completed');
  setBanner(rt, '', false);
  setNodeState(rt, 'm', '生成完毕', 'idle');
  closePanel(rt);
  const btn = footerBtn(rt);
  btn.className = 'btn btn-ready';
  btn.textContent = '阅读完整报告';
  syncHeader(rt);
  syncMeta(rt, fmtTime(new Date()));
  if (activeRuntime === rt) {
    lockPageScroll(false);
    showFollowUp(rt);
  }
  setStatus('已完成', 'ok');
  scrollDoc(rt);
}

/* ---------------- 阅读模式（卡片内切换：调研过程 <-> 完整报告） ---------------- */
function enterReader(rt: CardRuntime): void {
  if (!rt.finished) return;
  rt.card.classList.add('reader-mode');
  closePanel(rt);
  const doc = docArea(rt);
  if (doc) {
    if (!rt.reportShown) {
      rt.savedDocHtml = doc.innerHTML;
      doc.innerHTML = fullReportHtml(rt.report, rt.depth);
      rt.reportShown = true;
    }
    window.setTimeout(() => doc.scrollTo({ top: 0 }), 260);
  }
  setStatus('阅读模式', 'ok');
}

function exitReader(rt: CardRuntime): void {
  rt.card.classList.remove('reader-mode');
  const doc = docArea(rt);
  if (doc && rt.reportShown) {
    doc.innerHTML = rt.savedDocHtml ?? '';
    rt.reportShown = false;
    rt.stageEls = rt.stages.map((_, i) => q(rt, `.doc-content[data-stage="${i}"]`) as HTMLElement);
  }
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
interface MountOpts {
  /** 已完成阶段数（0-5），>0 且 <5 时从该处续跑 */
  stage?: number;
  hitlDone?: boolean;
  /** 所属会话与 research 消息下标（进度持久化目标） */
  conv?: Conversation | null;
  msgIndex?: number;
  /** 用户输入的调研主题（卡片头部展示用，缺省回退到行业域） */
  query?: string;
}

function mountCard(report: Report, depth: ReportDepth, finished: boolean, metaTime?: string, opts: MountOpts = {}): CardRuntime {
  const chat = document.getElementById('chat')!;
  const id = `${report.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  chat.insertAdjacentHTML('beforeend', cardHtml(id, report, depth, opts.query));
  const card = chat.querySelector<HTMLElement>(`.research-card[data-card="${id}"]`)!;
  const resumeStage = Math.min(Math.max(opts.stage ?? 0, 0), 5);
  const rt: CardRuntime = {
    card, report, depth, stages: buildStages(report, depth), index: 0, waiting: false, finished: false,
    tail: card, threadId: id, hitlResolve: null, stageEls: [], wcSeq: 0, timers: [],
    resumeStage, resumeHitlDone: opts.hitlDone ?? false,
    researchMsgIndex: opts.msgIndex ?? -1, conv: opts.conv ?? null,
    savedDocHtml: '', reportShown: false, query: opts.query ?? '',
  };
  runtimes.set(card, rt);
  threads.set(id, rt);
  liveCards.add(rt);
  activeRuntime = rt;

  if (finished || resumeStage >= 5) {
    renderDone(rt, metaTime);
  } else {
    /* 调研未完成（含断点续跑）：收起追问栏并锁定整页滚动，报告生成后由 finishCard 解锁 */
    hideFollowDock();
    lockPageScroll(true);
    window.setTimeout(() => runDag(rt), 300);
  }
  return rt;
}

/** 回放 / 续跑恢复时，把四个 Agent 节点标为已完成态（避免显示「待命」） */
function markNodesDone(rt: CardRuntime): void {
  setNodeState(rt, 's', '检索完成', 'idle');
  setNodeState(rt, 'a', '分析完成', 'idle');
  setNodeState(rt, 'c', rt.depth === 'simple' ? '核验通过' : '审查完毕', 'idle');
  setNodeState(rt, 'm', '生成完毕', 'idle');
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
  for (let i = 0; i < rt.stages.length; i++) setStepperState(rt, i, 'completed');
  markNodesDone(rt);
  rt.index = rt.stages.length;
  rt.finished = true;
  rt.waiting = false;
  const btn = footerBtn(rt);
  btn.className = 'btn btn-ready';
  btn.textContent = '阅读完整报告';
  syncHeader(rt);
  syncMeta(rt, metaTime || fmtTime(new Date()));
  lockPageScroll(false);
  showFollowUp(rt);
}

/* ================================================================
 * 七、消息发送与回放
 * ================================================================ */
function matchReport(q0: string): Report | null {
  const fallback = reports['ai-agent'] ?? Object.values(reports)[0] ?? null;
  const t = q0.toLowerCase();
  if (t.includes('机器人') || t.includes('具身') || t.includes('humanoid')) return reports.humanoid ?? fallback;
  if (t.includes('钙钛矿') || t.includes('光伏') || t.includes('perovskite')) return reports.perovskite ?? fallback;
  return fallback;
}

/* ---------------- 追问：插在卡片线程尾部 ---------------- */
function appendAfter(rt: CardRuntime, html: string): void {
  rt.tail.insertAdjacentHTML('afterend', html);
  const el = rt.tail.nextElementSibling;
  if (el instanceof HTMLElement) rt.tail = el;
}

/** 追问回答由 Python 后端模拟；后端不可用时降级到本地模板 */
async function followReply(r: Report, q0: string, model: string): Promise<{ label: string; bullets: string[] }> {
  const remote = await followFromBackend(q0, r.id, model);
  if (remote.bullets.length > 0 && !remote.label.includes('降级')) return remote;
  return {
    label: `追问 · ${r.domain} · ${MODEL_LABEL[model] ?? model}`,
    bullets: [
      `关于「${q0}」，由 ${MODEL_LABEL[model] ?? model} 结合 ${r.domain} 的最新公开数据作答：该议题仍处快速演进阶段，短期存在口径分歧。`,
      `建议下一步：拉取近 12 个月的相关来源，并对头部厂商的公开口径做交叉核对（完整回复需接入实时数据源）。`,
    ],
  };
}

async function askFollowUp(rt: CardRuntime, raw: string): Promise<void> {
  if (!rt.finished) return;
  const q0 = raw.trim();
  if (!q0) return;
  const input = document.querySelector<HTMLInputElement>('#followDock .follow-input');
  if (input) input.value = '';

  const model = state.model;
  const usage = usageForModel(model);
  const reply = await followReply(rt.report, q0, model);
  const time = fmtTime(new Date());
  const baseIndex = activeConv ? activeConv.messages.length : -1;
  appendAfter(rt, userMsgHtml(q0, 'follow-user', baseIndex, rt.threadId));
  appendAfter(rt, followAgentHtml(reply.label, reply.bullets, time, model, baseIndex >= 0 ? baseIndex + 1 : -1, rt.threadId));

  setTodaySpend(todaySpend + usage.cost);
  if (activeConv) {
    activeConv.messages.push({ type: 'follow-user', text: q0 });
    activeConv.messages.push({ type: 'follow-agent', label: reply.label, bullets: reply.bullets, time, model });
  }
  saveConvs();
  refreshSidebar();
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
  setTodaySpend(Math.max(0, todaySpend - refund));
  saveConvs();
  refreshSidebar();
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
  msg.querySelector('.edit-save')!.addEventListener('click', async () => {
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

    const reply = await followReply(rt.report, newText, model);
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

    setTodaySpend(Math.max(0, todaySpend + usageForModel(model).cost - usageForModel(oldModel).cost));
    saveConvs();
    refreshSidebar();
    scrollBottom();
    toast('已修改并重新生成');
  });
}

/** 页面滚动到调研卡片头部：保证「正在深度调研：××」主题始终可见 */
function scrollToCard(): void {
  document
    .querySelector<HTMLElement>('.research-card .research-header')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 调研进行中锁定整页滚动（右侧滚动条），报告生成后解锁 */
function lockPageScroll(lock: boolean): void {
  document.querySelector<HTMLElement>('.main')?.classList.toggle('scroll-locked', lock);
}

export async function sendMessage(text: string): Promise<void> {
  const query = text.trim();
  if (!query) return;

  dockComposer();
  document.getElementById('welcome')?.remove();
  /* 用户输入不再单独渲染气泡，直接展示在卡片头部「正在深度调研：」之后 */

  // 报告由后端按意图匹配并下发；后端不可用时降级到已注入的本地容器
  const report = (await matchReportFromBackend(query)) ?? matchReport(query);
  if (!report) {
    setStatus('后端未连接', 'idle');
    return;
  }
  const depth = state.depth;
  const conv = recordConversation(report, depth);
  conv.messages.push({ type: 'user', text: query });
  conv.messages.push({ type: 'research', reportId: report.id, depth, stage: 0 });
  saveConvs();

  setDepthLocked(true);
  hideFollowDock();
  mountCard(report, depth, false, undefined, {
    stage: 0, conv, msgIndex: conv.messages.length - 1, query,
  });
  scrollToCard();
}

export function replayConversation(conv: Conversation): void {
  const chat = document.getElementById('chat')!;
  dockComposer();
  document.getElementById('welcome')?.remove();
  chat.innerHTML = '';
  hideFollowDock();

  setActiveConv(conv);
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
  let lastQuery = '';
  for (let i = 0; i < conv.messages.length; i++) {
    const msg = conv.messages[i];
    const threadId = thread?.threadId ?? '';
    if (msg.type === 'user') {
      /* 调研主题不再渲染气泡，暂存给紧随的 research 卡片头部展示 */
      lastQuery = msg.text;
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
      const stage = msg.stage ?? 5;
      // 未完成的历史卡片：从已保存的阶段续跑；已完成则直接渲染完成态
      thread = mountCard(report, msg.depth, stage >= 5, conv.time, {
        stage, hitlDone: msg.hitlDone ?? false, conv, msgIndex: i, query: lastQuery,
      });
      lastQuery = '';
    }
  }
  setStatus('已完成', 'ok');
  refreshSidebar();
  scrollToCard();
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
