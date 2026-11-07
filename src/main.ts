import './style.css';
import {
  reports,
  suggestions,
  buildRunFor,
  STRENGTH_LABEL,
  type Report,
  type Section,
  type Step,
  type SeriesPoint,
  type BarItem,
  type ReportDepth,
  type ResearchRun,
  type EvidenceItem,
  type ClaimItem,
  type AgentRole,
  type StageName,
  type SwotItem,
  type RiskItem,
} from './mock';

const app = document.querySelector<HTMLDivElement>('#app')!;
const allReportIds = ['ai-agent', 'humanoid', 'perovskite'];

let currentDepth: ReportDepth = 'deep';
let depthLocked = false;
let currentTheme: 'dark' | 'light' = 'dark';
let currentModel = 'pro';

const MODEL_LABEL: Record<string, string> = {
  pro: '研衡 Pro',
  turbo: '研衡 Turbo',
  claude: 'Claude',
  gpt: 'GPT-4o',
};

const WALL_WORDS = [
  '汽车出口', '美妆零售', 'AI 智能体', '人形机器人', '钙钛矿光伏', '跨境电商',
  '新能源汽车', '半导体', '生物医药', '低空经济', '储能', '具身智能',
  '消费电子', 'SaaS 出海', '工业软件', '氢能', '智能驾驶', '医疗器械',
  '宠物经济', '出海品牌', '数字营销', '算力租赁', '光伏组件', '创新药',
  '连锁餐饮', '预制菜', '咖啡连锁', '银发经济', '合成生物', '卫星互联网',
];

const LS_THEME = 'yanheng.theme';

function applyTheme(theme: 'dark' | 'light'): void {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(LS_THEME, theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☾' : '☀';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const esc = escapeHtml;

function fmtTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/* ---------------- 用量与成本（Mock） ---------------- */
interface Usage {
  inT: number;
  outT: number;
  cost: number;
}

const SUP_USAGE: Usage = { inT: 600, outT: 1400, cost: 0.05 };

function usageFor(depth: ReportDepth): Usage {
  const inT = depth === 'deep' ? 4200 : 1800;
  const outT = depth === 'deep' ? 11800 : 3200;
  const cost = Math.round((inT * 0.00001 + outT * 0.00003) * 100) / 100;
  return { inT, outT, cost };
}

function usageChip(u: Usage): string {
  const total = u.inT + u.outT;
  const tok = total >= 1000 ? `${parseFloat((total / 1000).toFixed(1))}k` : `${total}`;
  return `<span class="msg-cost">token ${tok}</span><span class="msg-cost">¥${u.cost.toFixed(2)}</span>`;
}

function setDepthUI(depth: ReportDepth): void {
  document.querySelectorAll<HTMLElement>('.depth-opt').forEach((o) => {
    o.classList.toggle('active', o.dataset.depth === depth);
  });
}

function setDepthLocked(locked: boolean): void {
  depthLocked = locked;
  document.querySelectorAll<HTMLButtonElement>('.depth-opt').forEach((o) => {
    o.disabled = locked;
  });
  document.getElementById('depthToggle')?.classList.toggle('locked', locked);
  const label = document.querySelector<HTMLElement>('.depth-label');
  if (label) label.textContent = locked ? '报告深度 · 已锁定' : '报告深度';
}

/* ---------------- 历史对话 / 定时任务（内存态，Mock） ---------------- */
type ChatMessage =
  | { type: 'user'; text: string }
  | { type: 'report'; reportId: string; depth: ReportDepth }
  | { type: 'follow-user'; text: string }
  | { type: 'follow-agent'; label: string; steps: Step[]; bullets: string[] };

interface Conversation {
  id: string;
  reportId: string;
  title: string;
  domain: string;
  time: string;
  depth: ReportDepth;
  cost: number;
  messages: ChatMessage[];
}

interface ScheduledTask {
  id: string;
  reportId: string;
  depth: ReportDepth;
  freq: '每天' | '每周' | '每月';
  time: string;
}

let conversations: Conversation[] = [];
let tasks: ScheduledTask[] = [];
let todaySpend = 0;
let convSeq = 0;
let taskSeq = 0;
let activeConvId: string | null = null;
let activeConv: Conversation | null = null;

const LS_CONVS = 'yanheng.conversations';
const LS_SPEND = 'yanheng.todaySpend';

function saveConvs(): void {
  localStorage.setItem(LS_CONVS, JSON.stringify(conversations));
  localStorage.setItem(LS_SPEND, String(todaySpend));
}

function loadConvs(): boolean {
  const raw = localStorage.getItem(LS_CONVS);
  if (raw === null) return false;
  try {
    const parsed = JSON.parse(raw) as Conversation[];
    if (Array.isArray(parsed)) {
      conversations = parsed.map((c) => ({ ...c, messages: c.messages ?? [] }));
      convSeq = conversations.reduce((m, c) => Math.max(m, Number(c.id.replace('c', '')) || 0), 0);
      todaySpend = Number(localStorage.getItem(LS_SPEND)) || 0;
      return true;
    }
  } catch {
    /* 数据损坏则回退到种子数据 */
  }
  return false;
}

function seedConvs(): void {
  const seeds: { reportId: string; time: string; depth: ReportDepth }[] = [
    { reportId: 'ai-agent', time: '今天 14:20', depth: 'deep' },
    { reportId: 'humanoid', time: '昨天 09:41', depth: 'deep' },
    { reportId: 'perovskite', time: '11-04 16:05', depth: 'simple' },
  ];
  conversations = seeds.map((s) => {
    const r = reports[s.reportId];
    const u = usageFor(s.depth);
    return {
      id: `c${++convSeq}`,
      reportId: s.reportId,
      title: r.topic,
      domain: r.domain,
      time: s.time,
      depth: s.depth,
      cost: u.cost,
      messages: [],
    };
  });
  todaySpend = conversations.reduce((sum, c) => sum + c.cost, 0);
  saveConvs();
}

function seedTasks(): void {
  tasks = [
    { id: `t${++taskSeq}`, reportId: 'ai-agent', depth: 'deep', freq: '每周', time: '09:00' },
    { id: `t${++taskSeq}`, reportId: 'perovskite', depth: 'simple', freq: '每月', time: '08:30' },
  ];
}

function recordConversation(report: Report, depth: ReportDepth): Conversation {
  const u = usageFor(depth);
  const id = `c${++convSeq}`;
  const conv: Conversation = {
    id,
    reportId: report.id,
    title: report.topic,
    domain: report.domain,
    time: fmtTime(new Date()),
    depth,
    cost: u.cost,
    messages: [],
  };
  conversations.unshift(conv);
  todaySpend += u.cost;
  activeConvId = id;
  activeConv = conv;
  saveConvs();
  renderSidebar();
  return conv;
}

function replayConversation(conv: Conversation): void {
  dockComposer();
  activeConv = conv;
  activeConvId = conv.id;
  currentDepth = conv.depth;
  setDepthUI(conv.depth);
  setDepthLocked(true);
  if (!conv.messages || conv.messages.length === 0) {
    conv.messages = [
      { type: 'user', text: reports[conv.reportId].topic },
      { type: 'report', reportId: conv.reportId, depth: conv.depth },
    ];
    saveConvs();
  }
  renderMessages(conv.messages);
  renderSidebar();
}

function followAgentHtml(label: string, steps: Step[], bullets: string[]): string {
  const id = `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const trace = steps.map((s, i) => stepRow(s, i)).join('');
  const body = `<ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  return `
    <div class="msg agent" data-role="follow-agent" data-label="${esc(label)}">
      <div class="msg-head">
        <div class="avatar">研</div>
        <div class="agent-meta">
          <div class="agent-name">研衡 Agent</div>
          <div class="agent-domain">${esc(label)}</div>
        </div>
      </div>
      <div class="trace" id="trace-${id}">${trace}</div>
      <div class="follow-body" id="body-${id}">${body}</div>
      <div class="msg-foot">
        <span class="agent-time">${fmtTime(new Date())}</span>
        ${usageChip(SUP_USAGE)}
        ${msgActionsHtml(false)}
      </div>
    </div>`;
}

function renderMessages(messages: ChatMessage[]): void {
  const chat = document.getElementById('chat')!;
  chat.innerHTML = '';
  let seq = 0;
  for (const msg of messages) {
    if (msg.type === 'user' || msg.type === 'follow-user') {
      chat.insertAdjacentHTML('beforeend', userMsg(msg.text, msg.type));
    } else if (msg.type === 'report') {
      const report = reports[msg.reportId];
      const id = `${report.id}-${Date.now()}-${seq++}`;
      const run = buildRunFor(report, msg.depth);
      const usage = usageFor(msg.depth);
      chat.insertAdjacentHTML('beforeend', agentShell(id, report, run, usage, currentModel, msg.depth));
      const box = document.getElementById(`report-${id}`)!;
      renderReport(box, report, msg.depth);
      bindFollowUp(`follow-${id}`, report);
    } else if (msg.type === 'follow-agent') {
      chat.insertAdjacentHTML('beforeend', followAgentHtml(msg.label, msg.steps, msg.bullets));
    }
  }
  chat.querySelectorAll<HTMLElement>('.pipe-node, .stage, .worker').forEach((el) => {
    el.classList.add('done');
  });
  chat.querySelectorAll<HTMLElement>('.task-timer').forEach((el) => {
    el.textContent = '完成';
  });
  chat.querySelectorAll<HTMLElement>('.step').forEach((el) => {
    el.classList.remove('pending', 'running');
    el.classList.add('done');
  });
  chat.querySelectorAll<HTMLElement>('.step-item').forEach((el) => {
    el.classList.add('completed');
    const t = el.querySelector<HTMLElement>('.step-status-text');
    if (t) t.textContent = '已完成';
  });
  chat.querySelectorAll<HTMLElement>('.global-progress-fill').forEach((el) => {
    el.style.width = '100%';
  });
  setStatus('已完成', 'ok');
  scrollBottom();
}

function deleteConversation(id: string): void {
  const conv = conversations.find((c) => c.id === id);
  conversations = conversations.filter((c) => c.id !== id);
  if (conv) todaySpend = Math.max(0, todaySpend - conv.cost);
  if (activeConvId === id) {
    activeConvId = null;
    activeConv = null;
  }
  saveConvs();
  renderSidebar();
}

function clearConversations(): void {
  conversations = [];
  todaySpend = 0;
  activeConvId = null;
  activeConv = null;
  saveConvs();
  renderSidebar();
}

function convItemHtml(c: Conversation): string {
  const depthLabel = c.depth === 'deep' ? '深度' : '简版';
  const active = c.id === activeConvId ? ' active' : '';
  return `
    <div class="history-item${active}" data-conv="${c.id}">
      <button class="hi-body" data-conv="${c.id}" title="点击回放此对话">
        <div class="hi-top">
          <div class="hi-title">${esc(c.title)}</div>
          <div class="hi-cost">¥${c.cost.toFixed(2)}</div>
        </div>
        <div class="hi-meta">
          <span class="hi-domain">${esc(c.domain)} · ${depthLabel}</span>
          <span class="hi-time">${esc(c.time)}</span>
        </div>
      </button>
      <button class="hi-del" data-del="${c.id}" title="删除此对话">✕</button>
    </div>`;
}

function taskItemHtml(t: ScheduledTask): string {
  return `
    <div class="task-item" data-task="${t.id}">
      <div class="task-head">
        <div class="task-title">${esc(reports[t.reportId].domain)}</div>
        <button class="task-del" data-del="${t.id}" title="删除">✕</button>
      </div>
      <div class="task-meta">
        <span>${t.freq} · ${esc(t.time)}</span>
        <span class="task-depth">${t.depth === 'deep' ? '深度' : '简版'}</span>
      </div>
    </div>`;
}

function renderSidebar(): void {
  const convList = document.getElementById('convList')!;
  const taskList = document.getElementById('taskList')!;
  const convCount = document.getElementById('convCount')!;
  const spend = document.getElementById('totalSpend')!;
  convList.innerHTML = conversations.map(convItemHtml).join('');
  taskList.innerHTML = tasks.map(taskItemHtml).join('');
  convCount.textContent = String(conversations.length);
  spend.textContent = `今日 ¥${todaySpend.toFixed(2)}`;
}

/* ---------------- 结构 ---------------- */
function shell(): string {
  return `
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">研</div>
          <div class="brand-text">
            <div class="brand-name">研衡</div>
            <div class="brand-sub">YANHENG · 行业调研助手</div>
          </div>
        </div>
        <div class="demo-badge">DEMO · 虚拟数据</div>
        <button class="new-btn" id="newBtn"><span class="plus">＋</span> 新建调研</button>

        <div class="side-scroll">
          <div class="history">
            <div class="history-label">历史对话 <span class="count" id="convCount"></span>
              <button class="clear-convs" id="clearConvs" title="清空历史">清空</button>
            </div>
            <div class="history-list" id="convList"></div>
          </div>
          <div class="history tasks">
            <div class="history-label">定时任务 <button class="add-task" id="addTask" title="新建定时任务">＋</button></div>
            <div class="task-list" id="taskList"></div>
          </div>
        </div>

        <div class="sidebar-foot">
          <span class="dot"></span><span class="foot-text">Agent 在线</span>
          <span class="spend" id="totalSpend">今日 ¥0.00</span>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div class="crumb">调研台 / 新建任务</div>
          <div class="topbar-right">
            <button class="compare-btn" id="compareBtn">⇄ 双行业对比</button>
            <button class="theme-btn" id="themeBtn" title="切换深浅色主题">☾</button>
            <div class="status" id="agentStatus" data-state="idle">
              <span class="status-dot"></span>
              <span id="statusText">待命中</span>
            </div>
          </div>
        </header>

        <section class="chat" id="chat"></section>

        <footer class="composer" id="composer">
          <div class="search-box">
            <div class="search-left-group">
              <div class="depth-toggle" id="depthToggle">
                <button class="depth-opt" data-depth="simple">简单</button>
                <button class="depth-opt active" data-depth="deep">深度</button>
              </div>
              <span class="divider"></span>
              <div class="model-select-wrapper">
                <select class="model-select" id="modelSelect" title="选择模型">
                  <option value="pro">研衡 Pro</option>
                  <option value="turbo">研衡 Turbo</option>
                  <option value="claude">Claude</option>
                  <option value="gpt">GPT-4o</option>
                </select>
                <svg class="model-select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <textarea id="input" class="search-input" rows="1" placeholder="输入你想调研的行业或主题…"></textarea>
            <button id="send" class="send-btn" aria-label="发送">发送</button>
          </div>
          <div class="hint"><span class="model-hint" id="modelHint"></span>Enter 发送 · Shift+Enter 换行 · 深度/追问/定时任务 · 本 Demo 全部为虚拟数据</div>
        </footer>
      </main>
    </div>`;
}

function welcomeHtml(): string {
  const chips = suggestions.map(chipHtml).join('');
  return `
    <div class="welcome" id="welcome">
      <div class="welcome-kicker">INDUSTRY INTELLIGENCE</div>
      <h1 class="welcome-title">想了解哪个行业？把问题交给<em>研衡</em>。</h1>
      <p class="welcome-sub">选「简单 / 深度」，输入主题即可生成报告，报告内支持继续追问。</p>
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

function dockComposer(): void {
  const main = document.querySelector<HTMLElement>('.main')!;
  const chat = document.getElementById('chat')!;
  const composer = document.getElementById('composer')!;
  if (composer.parentElement !== main) main.appendChild(composer);
  composer.classList.remove('in-welcome');
  composer.classList.add('hidden');
  chat.classList.remove('welcome-mode');
  document.getElementById('wordWall')?.remove();
}

function floatComposer(): void {
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

function showWelcome(): void {
  const chat = document.getElementById('chat')!;
  dockComposer();
  chat.innerHTML = welcomeHtml();
  floatComposer();
  activeConv = null;
  activeConvId = null;
  setDepthLocked(false);
  renderSidebar();
  setStatus('待命中', 'idle');
}

function stepRow(s: Step, i: number): string {
  return `
    <div class="step pending">
      <div class="step-index">${i + 1}</div>
      <div class="step-body">
        <div class="step-label">${esc(s.label)}</div>
        <div class="step-detail">${esc(s.detail)}</div>
      </div>
      <div class="step-check">✓</div>
    </div>`;
}

function roleLabel(role: AgentRole): string {
  return {
    lead: 'Lead · 规划者',
    collector: 'Collector · 搜集',
    verifier: 'Verifier · 核查',
    synthesizer: 'Synthesizer · 合成',
  }[role];
}

function matrixHtml(run: ResearchRun): string {
  const header = `<div class="matrix-row matrix-head"><span class="matrix-company">公司 \\ 维度</span>${run.dims
    .map((d) => `<span class="matrix-dim">${esc(d)}</span>`)
    .join('')}</div>`;
  const rows = run.companies
    .map((company) => {
      const cells = run.dims
        .map((dim) => {
          const cell = run.cells.find((c) => c.company === company && c.dim === dim);
          const status = cell?.status ?? 'gap';
          return `<span class="matrix-cell cell-${status}" title="${esc(company)} × ${esc(dim)}：${esc(cell?.summary ?? '')}"></span>`;
        })
        .join('');
      return `<div class="matrix-row"><span class="matrix-company">${esc(company)}</span>${cells}</div>`;
    })
    .join('');
  return `
    <div class="matrix">
      <div class="coverage">
        <div class="coverage-label">覆盖度 ${Math.round(run.coverage * 100)}%</div>
        <div class="coverage-bar"><span class="coverage-fill" style="width:${Math.round(run.coverage * 100)}%"></span></div>
      </div>
      <div class="matrix-grid">${header}${rows}</div>
      <div class="matrix-legend">
        <span><i class="dot cell-covered"></i>已覆盖</span>
        <span><i class="dot cell-gap"></i>缺口</span>
        <span><i class="dot cell-unresolved"></i>待确认</span>
      </div>
    </div>`;
}

function evidenceLedgerHtml(evidences: EvidenceItem[]): string {
  const rows = evidences
    .map(
      (e) => `
    <div class="ledger-row">
      <span class="ledger-id">${esc(e.id)}</span>
      <span class="ledger-title">${esc(e.title)}</span>
      <span class="level-tag level-${e.level}">L${e.level}</span>
      <span class="cred">${Math.round(e.credibility * 100)}%</span>
    </div>`,
    )
    .join('');
  return `
    <div class="ledger">
      <div class="ledger-head">证据台账 · ${evidences.length} 条</div>
      ${rows}
    </div>`;
}

function claimLedgerHtml(claims: ClaimItem[]): string {
  const rows = claims
    .map(
      (c) => `
    <div class="ledger-row claim-row">
      <span class="ledger-id">${esc(c.id)}</span>
      <span class="ledger-title">${esc(c.text)}</span>
      <span class="strength strength-${c.strength}">${STRENGTH_LABEL[c.strength]}</span>
      <span class="role-tag role-${c.role}">${roleLabel(c.role)}</span>
    </div>`,
    )
    .join('');
  return `
    <div class="ledger">
      <div class="ledger-head">结论台账 · ${claims.length} 条</div>
      ${rows}
    </div>`;
}

function startTaskTimer(el: HTMLElement): () => void {
  const timerEl = el.querySelector<HTMLElement>('.task-timer');
  if (!timerEl) return () => {};
  const start = Date.now();
  const iv = window.setInterval(() => {
    timerEl.textContent = `${((Date.now() - start) / 1000).toFixed(1)}s`;
  }, 100);
  return () => {
    window.clearInterval(iv);
    timerEl.textContent = `${((Date.now() - start) / 1000).toFixed(1)}s`;
  };
}

function pipeProgressHtml(id: string): string {
  const stages: { key: StageName; name: string }[] = [
    { key: 'align', name: 'Align' },
    { key: 'collect', name: 'Collect' },
    { key: 'verify', name: 'Verify' },
    { key: 'synthesize', name: 'Synthesize' },
  ];
  const nodes = stages
    .map(
      (s) => `
    <div class="pipe-node" data-stage="${s.key}">
      <span class="pipe-dot"></span>
      <span class="pipe-name">${s.name}</span>
    </div>`,
    )
    .join('<span class="pipe-edge"></span>');
  return `<div class="pipeline" id="pipeline-${id}">${nodes}</div>`;
}

function stageHtml(stage: StageName, title: string, role: AgentRole, body: string, sub?: string): string {
  return `
    <div class="stage" data-stage="${stage}">
      <div class="stage-head">
        <span class="spinner"></span>
        <span class="role-badge role-${role}">${role.toUpperCase()}</span>
        <span class="stage-title">${title}</span>
        <span class="task-timer">--</span>
      </div>
      <div class="stage-body">
        ${sub ? `<div class="agent-line">${sub}</div>` : ''}
        ${body}
      </div>
    </div>`;
}

function agentShell(id: string, r: Report, run: ResearchRun, usage: Usage, model: string, depth: ReportDepth): string {
  const collectors = run.dims
    .map(
      (dim, i) => `
    <div class="worker">
      <div class="worker-head">
        <span class="spinner"></span>
        <span class="worker-name">Collector ${i + 1}</span>
        <span class="worker-role">${esc(dim)}</span>
        <span class="task-timer">--</span>
      </div>
      <div class="worker-task">采集「${esc(dim)}」相关来源并抽取结构化结论</div>
    </div>`,
    )
    .join('');

  const stepNames = ['拆解问题与大纲', '全网数据检索', '深度交叉验证', '最终报告合成'];
  const steps = stepNames
    .map(
      (name, i) => `
        <div class="step-item" data-step="${i}">
          <div class="step-icon"></div>
          <div class="step-content">
            <div class="step-name">${name}</div>
            <div class="step-status-text">等待中</div>
          </div>
        </div>`,
    )
    .join('');

  return `
    <div class="msg agent report-card" data-role="report" data-reportid="${r.id}" data-depth="${depth}">
      <div class="global-progress"><div class="global-progress-fill" id="gp-${id}"></div></div>
      <div class="card-body">
        <aside class="thinking-sidebar">
          <div class="sidebar-title">研衡思考过程</div>
          <div class="steps-container" id="steps-${id}">${steps}</div>
        </aside>
        <div class="document-area">
          <div class="msg-head">
            <div class="avatar">研</div>
            <div class="agent-meta">
              <div class="agent-name">研衡 Agent</div>
              <div class="agent-domain">研究主题 · ${esc(r.domain)} · ${esc(MODEL_LABEL[model] ?? model)}</div>
            </div>
          </div>
          ${pipeProgressHtml(id)}
          <div class="stages" id="stages-${id}">
            ${stageHtml('align', 'Align · 前置对齐', 'lead', matrixHtml(run), `Lead 生成研究矩阵：${run.companies.length} 家公司 × ${run.dims.length} 个维度`)}
            ${stageHtml('collect', 'Collect · 并行搜集', 'collector', `<div class="workers">${collectors}</div>${evidenceLedgerHtml(run.evidences)}`, '并行 fan-out 派发 Collector，更新证据台账')}
            ${stageHtml('verify', 'Verify · 交叉核查', 'verifier', claimLedgerHtml(run.claims), '缺口补充 + 证据可信度分级 + 结论标注证据强度')}
            ${stageHtml('synthesize', 'Synthesize · 合成报告', 'synthesizer', '', '聚合结论去重 + 一致性校验 → 生成报告')}
          </div>
          <div class="report" id="report-${id}"></div>
        </div>
      </div>
      <div class="card-footer">
        <div class="msg-foot">
          <span class="agent-time">${fmtTime(new Date())}</span>
          ${usageChip(usage)}
          ${msgActionsHtml(false)}
        </div>
        ${followUpHtml(r, id)}
      </div>
    </div>`;
}

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

function userMsg(text: string, role: 'user' | 'follow-user' = 'user'): string {
  return `
    <div class="msg user" data-role="${role}">
      <div class="user-bubble">${esc(text)}</div>
      ${msgActionsHtml(true)}
    </div>`;
}

function lineChart(series: SeriesPoint[], unit: string): string {
  const W = 600;
  const H = 240;
  const PL = 50;
  const PR = 18;
  const PT = 22;
  const PB = 36;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const max = Math.max(...series.map((s) => s.value)) * 1.18;
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
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${unit} 趋势图">
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

function sectionHtml(i: number, s: Section): string {
  let body = '';
  if (s.kind === 'prose') {
    body = `<div class="prose">${(s.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
  } else if (s.kind === 'bullets') {
    body = `<ul class="bullets">${(s.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  } else if (s.kind === 'chart') {
    body = `<div class="chart-wrap">${lineChart(s.series ?? [], s.unit ?? '')}</div>`;
  } else if (s.kind === 'bars') {
    body = barList(s.bars ?? []);
  } else if (s.kind === 'swot') {
    body = swotHtml(s.swot!);
  } else if (s.kind === 'risk') {
    body = riskMatrixHtml(s.risks ?? []);
  }
  return `
    <section class="section">
      <div class="sec-head">
        <span class="sec-index">${String(i).padStart(2, '0')}</span>
        <h3 class="sec-title">${esc(s.heading)}</h3>
        <button class="deepdive-btn" data-dive="${i - 1}">深入 ↳</button>
      </div>
      ${body}
    </section>`;
}

function renderReport(box: HTMLElement, r: Report, depth: ReportDepth): void {
  const visible = depth === 'deep' ? r.sections : r.sections.filter((s) => s.depth !== 'deep');
  const tags = r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const depthBadge = depth === 'deep' ? '深度报告' : '简版报告';
  const takeaways = (depth === 'deep' ? r.takeaways : r.takeaways.slice(0, 3))
    .map(
      (t) => `
    <li>
      ${esc(t.text)}
      <span class="strength strength-${t.strength}">${STRENGTH_LABEL[t.strength]}</span>
      <span class="trefs">${t.refs.map((i) => `[${i + 1}]`).join('')}</span>
    </li>`,
    )
    .join('');
  const sections = visible.map((s, i) => sectionHtml(i + 1, s)).join('');
  const cites = r.citations
    .map(
      (c, i) =>
        `<li><span class="src">[${i + 1}]</span> ${esc(c.title)} <span class="strength strength-${c.strength}">${STRENGTH_LABEL[c.strength]}</span> <span class="src-meta">· ${esc(c.source)} · ${esc(c.date)}</span></li>`,
    )
    .join('');
  box.innerHTML = `
    <div class="report-head">
      <div class="report-kicker">RESEARCH BRIEF · ${esc(r.domain)}</div>
      <h2 class="report-title">${esc(r.topic)}</h2>
      <div class="report-meta">${tags}<span class="tag depth-tag">${depthBadge}</span><span class="updated">更新于 ${esc(r.updatedAt)}</span></div>
      <p class="report-summary">${esc(r.summary)}</p>
    </div>
    <div class="takeaways">
      <div class="takeaways-title">核心结论</div>
      <ol>${takeaways}</ol>
    </div>
    ${sections}
    <div class="citations">
      <div class="citations-title">参考来源</div>
      <ol>${cites}</ol>
    </div>
    <p class="footnote">注：本报告全部数据与图表均为演示用虚拟数据，不构成任何投资建议。</p>`;

  const items = box.querySelectorAll<HTMLElement>(
    '.report-head, .takeaways, .section, .citations, .footnote',
  );
  items.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.animationDelay = `${i * 90}ms`;
  });

  box.querySelectorAll<HTMLElement>('.deepdive-btn').forEach((btn) => {
    btn.addEventListener('click', () => appendDeepDive(r, visible[Number(btn.dataset.dive)]));
  });
}

function followUpHtml(r: Report, id: string): string {
  const chips = r.followUpHints.map((h) => `<button class="follow-chip" data-q="${esc(h)}">${esc(h)}</button>`).join('');
  return `
    <div class="follow-up" id="follow-${id}">
      <div class="follow-title">继续追问</div>
      <div class="follow-chips">${chips}</div>
      <div class="follow-row">
        <input class="follow-input" placeholder="针对本报告继续提问…" />
        <button class="follow-send">追问</button>
      </div>
    </div>`;
}

function bindFollowUp(id: string, report: Report): void {
  const box = document.getElementById(id);
  if (!box) return;
  const followInput = box.querySelector<HTMLInputElement>('.follow-input');
  const followSend = box.querySelector<HTMLElement>('.follow-send');
  if (!followInput || !followSend) return;
  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    followInput.value = '';
    appendFollowUp(report, text);
  };
  followSend.addEventListener('click', () => ask(followInput.value));
  followInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ask(followInput.value);
    }
  });
  box.querySelectorAll<HTMLElement>('.follow-chip').forEach((chip) => {
    chip.addEventListener('click', () => ask(chip.dataset.q ?? ''));
  });
}

function setStatus(text: string, state: 'idle' | 'busy' | 'ok'): void {
  const status = document.getElementById('agentStatus');
  const textEl = document.getElementById('statusText');
  if (status) status.dataset.state = state;
  if (textEl) textEl.textContent = text;
}

function scrollBottom(): void {
  const chat = document.getElementById('chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function animateSteps(
  traceEl: HTMLElement,
  onStep: ((i: number) => void) | undefined,
  onDone: () => void,
): void {
  const els = Array.from(traceEl.querySelectorAll<HTMLElement>('.step'));
  const stepDur = 700;
  const runDur = 540;
  els.forEach((el, i) => {
    setTimeout(() => {
      el.classList.remove('pending');
      el.classList.add('running');
      onStep?.(i);
    }, i * stepDur);
    setTimeout(() => {
      el.classList.remove('running');
      el.classList.add('done');
    }, i * stepDur + runDur);
  });
  setTimeout(onDone, (els.length - 1) * stepDur + runDur + 300);
}

function runPipeline(report: Report, depth: ReportDepth): void {
  const chat = document.getElementById('chat')!;
  const id = `${report.id}-${Date.now()}`;
  const run = buildRunFor(report, depth);
  const usage = usageFor(depth);
  chat.insertAdjacentHTML('beforeend', agentShell(id, report, run, usage, currentModel, depth));

  const pipelineEl = document.getElementById(`pipeline-${id}`)!;
  const stagesEl = document.getElementById(`stages-${id}`)!;
  const box = document.getElementById(`report-${id}`)!;
  const globalFill = document.getElementById(`gp-${id}`)!;
  const stageNodes = Array.from(pipelineEl.querySelectorAll<HTMLElement>('.pipe-node'));
  const stageEls = Array.from(stagesEl.querySelectorAll<HTMLElement>('.stage'));
  const stepItems = Array.from(document.getElementById(`steps-${id}`)!.querySelectorAll<HTMLElement>('.step-item'));
  const progressPct = [20, 50, 80, 100];

  const setStep = (i: number, state: 'active' | 'completed') => {
    const item = stepItems[i];
    item.classList.remove('active', 'completed');
    item.classList.add(state);
    const t = item.querySelector<HTMLElement>('.step-status-text');
    if (t) t.textContent = state === 'active' ? '正在执行…' : '已完成';
  };

  const startStage = (i: number): (() => void) => {
    stageNodes[i].classList.add('running');
    stageEls[i].classList.add('running');
    setStep(i, 'active');
    globalFill.style.width = `${progressPct[i]}%`;
    return startTaskTimer(stageEls[i]);
  };
  const finishStage = (i: number, stop: () => void) => {
    stageNodes[i].classList.remove('running');
    stageNodes[i].classList.add('done');
    stageEls[i].classList.remove('running');
    stageEls[i].classList.add('done');
    setStep(i, 'completed');
    stop();
  };

  // 阶段 1 · align
  setStatus('Lead Agent 规划中…', 'busy');
  const stopAlign = startStage(0);
  setTimeout(() => {
    finishStage(0, stopAlign);

    // 阶段 2 · collect：并行 fan-out
    setStatus('Collector 并行搜集…', 'busy');
    const stopCollect = startStage(1);
    const cards = Array.from(stagesEl.querySelectorAll<HTMLElement>('[data-stage="collect"] .worker'));
    const cardStops = cards.map((card) => {
      card.classList.add('running');
      return startTaskTimer(card);
    });
    cards.forEach((card, i) => {
      setTimeout(() => {
        card.classList.remove('running');
        card.classList.add('done');
        cardStops[i]();
      }, 900 + i * 220);
    });
    setTimeout(() => {
      finishStage(1, stopCollect);

      // 阶段 3 · verify
      setStatus('Verifier 核查中…', 'busy');
      const stopVerify = startStage(2);
      setTimeout(() => {
        finishStage(2, stopVerify);

        // 阶段 4 · synthesize
        setStatus('Synthesizer 合成中…', 'busy');
        const stopSynth = startStage(3);
        setTimeout(() => {
          finishStage(3, stopSynth);
          setStatus('已完成', 'ok');
          renderReport(box, report, depth);
          bindFollowUp(`follow-${id}`, report);
          scrollBottom();
          if (activeConv) {
            activeConv.messages.push({ type: 'report', reportId: report.id, depth });
            saveConvs();
          }
        }, 900);
      }, 1300);
    }, cards.length * 220 + 900 + 400);
  }, 900);
  scrollBottom();
}

function matchReport(q: string): Report {
  const t = q.toLowerCase();
  if (t.includes('机器人') || t.includes('具身') || t.includes('humanoid')) return reports.humanoid;
  if (t.includes('钙钛矿') || t.includes('光伏') || t.includes('perovskite')) return reports.perovskite;
  return reports['ai-agent'];
}

function sendMessage(text: string): void {
  const chat = document.getElementById('chat')!;
  dockComposer();
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();
  chat.insertAdjacentHTML('beforeend', userMsg(text));
  const report = matchReport(text);
  const conv = recordConversation(report, currentDepth);
  conv.messages.push({ type: 'user', text });
  saveConvs();
  setDepthLocked(true);
  runPipeline(report, currentDepth);
}

/* ---------------- 消息操作：复制 / 修改 / 删除 ---------------- */
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
  let text: string;
  if (msg.classList.contains('user')) {
    text = msg.querySelector('.user-bubble')?.textContent ?? '';
  } else {
    const report = msg.querySelector('.report');
    const follow = msg.querySelector('.follow-body');
    text = report?.textContent ?? follow?.textContent ?? msg.querySelector('.agent-domain')?.textContent ?? '';
  }
  const done = () => toast('已复制到剪贴板');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text.trim()).then(done).catch(() => fallbackCopy(text.trim(), done));
  } else {
    fallbackCopy(text.trim(), done);
  }
}

function syncMessagesOnDelete(msg: HTMLElement): void {
  if (!activeConv) return;
  const role = msg.dataset.role;
  const text = msg.querySelector('.user-bubble')?.textContent ?? '';
  const label = msg.dataset.label;
  const reportId = msg.dataset.reportid;
  const msgs = activeConv.messages;
  let i = -1;
  if (role === 'user') {
    i = msgs.findIndex((m) => m.type === 'user' && m.text === text);
    if (i >= 0) {
      msgs.splice(i, 1);
      if (msgs[i]?.type === 'report') msgs.splice(i, 1);
    }
  } else if (role === 'follow-user') {
    i = msgs.findIndex((m) => m.type === 'follow-user' && m.text === text);
    if (i >= 0) {
      msgs.splice(i, 1);
      if (msgs[i]?.type === 'follow-agent') msgs.splice(i, 1);
    }
  } else if (role === 'report') {
    i = msgs.findIndex((m) => m.type === 'report' && m.reportId === reportId);
    if (i >= 0) msgs.splice(i, 1);
  } else if (role === 'follow-agent') {
    i = msgs.findIndex((m) => m.type === 'follow-agent' && m.label === label);
    if (i >= 0) msgs.splice(i, 1);
  }
  if (i >= 0) saveConvs();
}

function deleteMessage(msg: HTMLElement): void {
  syncMessagesOnDelete(msg);
  msg.remove();
  toast('已删除');
}

function editMessage(msg: HTMLElement): void {
  const bubble = msg.querySelector('.user-bubble');
  if (!bubble) return;
  const text = bubble.textContent ?? '';
  msg.querySelector('.msg-actions')?.remove();
  bubble.outerHTML = `
    <div class="edit-row">
      <textarea class="edit-input" rows="1">${esc(text)}</textarea>
      <div class="edit-btns">
        <button class="edit-save">保存</button>
        <button class="edit-cancel">取消</button>
      </div>
    </div>`;
  const input = msg.querySelector('.edit-input') as HTMLTextAreaElement;
  input.focus();
  msg.querySelector('.edit-cancel')!.addEventListener('click', () => {
    msg.innerHTML = `<div class="user-bubble">${esc(text)}</div>${msgActionsHtml(true)}`;
  });
  msg.querySelector('.edit-save')!.addEventListener('click', () => {
    const newText = input.value.trim();
    if (!newText) return;
    msg.innerHTML = `<div class="user-bubble">${esc(newText)}</div>${msgActionsHtml(true)}`;
    if (activeConv) {
      const i = activeConv.messages.findIndex((m) => m.type === 'user' && m.text === text);
      if (i >= 0) {
        activeConv.messages[i] = { type: 'user', text: newText };
        if (activeConv.messages[i + 1]?.type === 'report') activeConv.messages.splice(i + 1, 1);
        saveConvs();
      }
    }
    let next = msg.nextElementSibling;
    while (next && !next.classList.contains('user')) {
      const r = next;
      next = next.nextElementSibling;
      r.remove();
    }
    const report = matchReport(newText);
    runPipeline(report, currentDepth);
  });
}

function fallbackDeepDive(s: Section, r: Report): string[] {
  return [
    `围绕「${s.heading}」这一维度，我们进一步交叉了 ${r.domain} 相关的多个来源，发现的主要分歧点是统计口径与采样边界。`,
    `下一步建议：对可比口径做对齐、拆解头部样本，并补充时间序列的同比校验（更多细节需接入实时数据源）。`,
  ];
}

function appendAgentMessage(label: string, steps: Step[], fill: (body: HTMLElement) => void): void {
  const chat = document.getElementById('chat')!;
  const id = `sup-${Date.now()}`;
  const trace = steps.map((s, i) => stepRow(s, i)).join('');
  chat.insertAdjacentHTML(
    'beforeend',
    `
    <div class="msg agent" data-role="follow-agent" data-label="${esc(label)}">
      <div class="msg-head">
        <div class="avatar">研</div>
        <div class="agent-meta">
          <div class="agent-name">研衡 Agent</div>
          <div class="agent-domain">${esc(label)}</div>
        </div>
      </div>
      <div class="trace" id="trace-${id}">${trace}</div>
      <div class="follow-body" id="body-${id}"></div>
      <div class="msg-foot">
        <span class="agent-time">${fmtTime(new Date())}</span>
        ${usageChip(SUP_USAGE)}
      </div>
    </div>`,
  );
  todaySpend += SUP_USAGE.cost;
  saveConvs();
  renderSidebar();
  const traceEl = document.getElementById(`trace-${id}`)!;
  const bodyEl = document.getElementById(`body-${id}`)!;
  animateSteps(traceEl, undefined, () => {
    fill(bodyEl);
    bodyEl.classList.add('reveal');
  });
  scrollBottom();
}

function appendDeepDive(report: Report, section: Section | undefined): void {
  if (!section) return;
  const steps: Step[] = [
    { label: '检索补充来源', detail: `针对「${section.heading}」补充检索 ${report.domain} 相关来源` },
    { label: '输出深挖结论', detail: '交叉核对后生成补充分析' },
  ];
  const bullets = section.deepDive ?? fallbackDeepDive(section, report);
  const label = `深挖 · ${section.heading}`;
  if (activeConv) {
    activeConv.messages.push({ type: 'follow-agent', label, steps, bullets });
    saveConvs();
  }
  appendAgentMessage(label, steps, (body) => {
    body.innerHTML = `<ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  });
}

function appendFollowUp(report: Report, question: string): void {
  const chat = document.getElementById('chat')!;
  chat.insertAdjacentHTML('beforeend', userMsg(question, 'follow-user'));
  const steps: Step[] = [
    { label: '检索补充信息', detail: `围绕追问「${question}」补充检索` },
    { label: '输出结论', detail: `结合 ${report.domain} 最新数据作答` },
  ];
  const bullets = [
    `关于「${question}」，结合 ${report.domain} 的最新公开数据，我们初步判断该议题仍处于快速演进阶段，短期存在口径分歧。`,
    `建议下一步：拉取近 12 个月的相关来源，并对头部厂商的公开口径做交叉核对（完整回复需接入实时数据源）。`,
  ];
  const label = `追问 · ${report.domain}`;
  if (activeConv) {
    activeConv.messages.push({ type: 'follow-user', text: question });
    activeConv.messages.push({ type: 'follow-agent', label, steps, bullets });
    saveConvs();
  }
  appendAgentMessage(label, steps, (body) => {
    body.innerHTML = `<ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
  });
}

/* ---------------- 双行业对比 ---------------- */
function reportOptions(selected: string): string {
  return allReportIds
    .map((id) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(reports[id].topic)}</option>`)
    .join('');
}

function compareColumn(r: Report): string {
  const takes = r.takeaways.slice(0, 3).map((t) => `<li>${esc(t.text)}</li>`).join('');
  return `
    <div class="compare-col">
      <div class="cmp-kicker">${esc(r.domain)}</div>
      <h3 class="cmp-title">${esc(r.topic)}</h3>
      <div class="cmp-metric"><span>${esc(r.headline.label)}</span><b>${esc(r.headline.value)}</b></div>
      <div class="cmp-cagr">CAGR <b>${esc(r.cagr)}</b></div>
      <div class="cmp-tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <ol class="cmp-takeaways">${takes}</ol>
    </div>`;
}

function openCompare(): void {
  let a = reports['ai-agent'];
  let b = reports['humanoid'];
  const overlay = document.createElement('div');
  overlay.className = 'compare-overlay';
  overlay.innerHTML = `
    <div class="compare">
      <div class="compare-head">
        <div class="compare-title">双行业对比 <span class="compare-sub">RESEARCH COMPARISON · 虚拟数据</span></div>
        <button class="close-btn" id="closeCompare">✕ 关闭</button>
      </div>
      <div class="compare-controls">
        <select id="cmpA">${reportOptions(a.id)}</select>
        <span class="vs">VS</span>
        <select id="cmpB">${reportOptions(b.id)}</select>
      </div>
      <div class="compare-grid" id="cmpGrid">${compareColumn(a)}${compareColumn(b)}</div>
    </div>`;
  document.body.appendChild(overlay);

  const selA = overlay.querySelector<HTMLSelectElement>('#cmpA')!;
  const selB = overlay.querySelector<HTMLSelectElement>('#cmpB')!;
  const grid = overlay.querySelector<HTMLElement>('#cmpGrid')!;
  const update = () => {
    a = reports[selA.value];
    b = reports[selB.value];
    grid.innerHTML = `${compareColumn(a)}${compareColumn(b)}`;
  };
  selA.addEventListener('change', update);
  selB.addEventListener('change', update);
  overlay.querySelector('#closeCompare')!.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/* ---------------- 定时任务弹窗 ---------------- */
function closeTaskModal(): void {
  document.getElementById('taskModal')?.remove();
}

function openTaskModal(): void {
  closeTaskModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'taskModal';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">创建定时任务 <span class="modal-sub">SCHEDULED RESEARCH · 虚拟数据</span></div>
        <button class="close-btn" id="closeTask">✕ 关闭</button>
      </div>
      <form id="taskForm" class="task-form">
        <label class="field"><span>调研行业</span>
          <select id="tReport">${reportOptions('ai-agent')}</select>
        </label>
        <label class="field"><span>报告深度</span>
          <select id="tDepth"><option value="deep">深度</option><option value="simple">简单</option></select>
        </label>
        <label class="field"><span>执行频率</span>
          <select id="tFreq"><option>每天</option><option>每周</option><option>每月</option></select>
        </label>
        <label class="field"><span>执行时间</span>
          <input type="time" id="tTime" value="09:00" />
        </label>
        <button class="modal-submit" type="submit">创建任务</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#closeTask')!.addEventListener('click', closeTaskModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskModal();
  });
  overlay.querySelector<HTMLFormElement>('#taskForm')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const reportId = (overlay.querySelector('#tReport') as HTMLSelectElement).value;
    const depth = (overlay.querySelector('#tDepth') as HTMLSelectElement).value as ReportDepth;
    const freq = (overlay.querySelector('#tFreq') as HTMLSelectElement).value as ScheduledTask['freq'];
    const time = (overlay.querySelector('#tTime') as HTMLInputElement).value || '09:00';
    tasks.push({ id: `t${++taskSeq}`, reportId, depth, freq, time });
    renderSidebar();
    closeTaskModal();
  });
}

/* ---------------- 事件绑定 ---------------- */
function bind(): void {
  const input = document.getElementById('input') as HTMLTextAreaElement;
  const send = document.getElementById('send') as HTMLButtonElement;

  const submit = () => {
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    input.style.height = 'auto';
    sendMessage(v);
  };

  send.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  });

  document.getElementById('depthToggle')!.addEventListener('click', (e) => {
    if (depthLocked) return;
    const opt = (e.target as HTMLElement).closest<HTMLElement>('.depth-opt');
    if (!opt) return;
    currentDepth = opt.dataset.depth as ReportDepth;
    setDepthUI(currentDepth);
  });

  const modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
  const updateModelHint = () => {
    const el = document.getElementById('modelHint');
    if (el) el.textContent = `模型 · ${MODEL_LABEL[currentModel] ?? currentModel} · `;
  };
  modelSelect.addEventListener('change', () => {
    currentModel = modelSelect.value;
    updateModelHint();
  });
  updateModelHint();

  document.getElementById('compareBtn')!.addEventListener('click', openCompare);
  document.getElementById('addTask')!.addEventListener('click', openTaskModal);

  const themeBtn = document.getElementById('themeBtn')!;
  themeBtn.textContent = currentTheme === 'dark' ? '☾' : '☀';
  themeBtn.addEventListener('click', () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('newBtn')!.addEventListener('click', showWelcome);

  document.getElementById('convList')!.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const del = target.closest<HTMLElement>('.hi-del');
    if (del) {
      deleteConversation(del.dataset.del ?? '');
      return;
    }
    const item = target.closest<HTMLElement>('.hi-body');
    if (!item) return;
    const conv = conversations.find((c) => c.id === item.dataset.conv);
    if (conv) replayConversation(conv);
  });

  document.getElementById('clearConvs')!.addEventListener('click', () => {
    if (conversations.length === 0) return;
    if (confirm('确定清空全部历史对话？此操作不可恢复。')) clearConversations();
  });

  document.getElementById('taskList')!.addEventListener('click', (e) => {
    const del = (e.target as HTMLElement).closest<HTMLElement>('.task-del');
    if (!del) return;
    tasks = tasks.filter((t) => t.id !== del.dataset.del);
    renderSidebar();
  });

  document.getElementById('chat')!.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const actBtn = target.closest<HTMLElement>('.ma-btn');
    if (actBtn) {
      const msg = actBtn.closest<HTMLElement>('.msg')!;
      const act = actBtn.dataset.act;
      if (act === 'copy') copyMessage(msg);
      else if (act === 'edit') editMessage(msg);
      else if (act === 'del') deleteMessage(msg);
      return;
    }
    const chip = target.closest<HTMLElement>('.chip');
    if (chip) sendMessage(chip.dataset.query ?? '');
  });
}

const savedTheme = localStorage.getItem(LS_THEME);
if (savedTheme === 'light') {
  currentTheme = 'light';
  document.documentElement.dataset.theme = 'light';
}

app.innerHTML = shell();
const chat = document.getElementById('chat')!;
chat.innerHTML = welcomeHtml();
floatComposer();
if (!loadConvs()) seedConvs();
seedTasks();
bind();
renderSidebar();
setStatus('待命中', 'idle');