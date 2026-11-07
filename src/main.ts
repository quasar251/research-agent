import './style.css';
import { reports, suggestions, type Report, type ReportDepth } from './mock';
import {
  esc,
  state,
  setDepthUI,
  setStatus,
  MODEL_LABEL,
} from './common';
import {
  conversations,
  todaySpend,
  activeConvId,
  loadConvs,
  seedConvs,
  replayConversation,
  deleteConversation,
  clearConversations,
  setSidebarRefresh,
  welcomeHtml,
  floatComposer,
  showWelcome,
  sendMessage,
  bindChatEvents,
} from './dialog';

const app = document.querySelector<HTMLDivElement>('#app')!;
const allReportIds = ['ai-agent', 'humanoid', 'perovskite'];

const LS_THEME = 'yanheng.theme';

let currentTheme: 'dark' | 'light' = 'dark';

function applyTheme(theme: 'dark' | 'light'): void {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(LS_THEME, theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☾' : '☀';
}

/* ---------------- 定时任务（内存态，Mock） ---------------- */
interface ScheduledTask {
  id: string;
  reportId: string;
  depth: ReportDepth;
  freq: '每天' | '每周' | '每月';
  time: string;
}

let tasks: ScheduledTask[] = [];
let taskSeq = 0;

function seedTasks(): void {
  tasks = [
    { id: `t${++taskSeq}`, reportId: 'ai-agent', depth: 'deep', freq: '每周', time: '09:00' },
    { id: `t${++taskSeq}`, reportId: 'perovskite', depth: 'simple', freq: '每月', time: '08:30' },
  ];
}

/* ---------------- 侧边栏 ---------------- */
function convItemHtml(c: (typeof conversations)[number]): string {
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
    if (state.depthLocked) return;
    const opt = (e.target as HTMLElement).closest<HTMLElement>('.depth-opt');
    if (!opt) return;
    state.depth = opt.dataset.depth as ReportDepth;
    setDepthUI(state.depth);
  });

  const modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
  const updateModelHint = () => {
    const el = document.getElementById('modelHint');
    if (el) el.textContent = `模型 · ${MODEL_LABEL[state.model] ?? state.model} · `;
  };
  modelSelect.addEventListener('change', () => {
    state.model = modelSelect.value;
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

  document.getElementById('newBtn')!.addEventListener('click', () => showWelcome(suggestions));

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

  bindChatEvents();
}

/* ---------------- 启动 ---------------- */
const savedTheme = localStorage.getItem(LS_THEME);
if (savedTheme === 'light') {
  currentTheme = 'light';
  document.documentElement.dataset.theme = 'light';
}

app.innerHTML = shell();
setSidebarRefresh(renderSidebar);
const chat = document.getElementById('chat')!;
chat.innerHTML = welcomeHtml(suggestions);
floatComposer();
if (!loadConvs()) seedConvs();
seedTasks();
bind();
renderSidebar();
setStatus('待命中', 'idle');
