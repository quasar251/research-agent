import './style.css';
import { suggestions, type ReportDepth } from './mock';
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
  deleteConversation,
  clearConversations,
  setSidebarRefresh,
} from './store';
import {
  replayConversation,
  floatComposer,
  showWelcome,
  sendMessage,
  bindChatEvents,
} from './dialog';
import { welcomeHtml } from './views';
import { openConsole, isConsoleOpen, closeConsole } from './console';
import {
  tasks,
  taskItemHtml,
  seedTasks,
  removeTask,
  openTaskModal,
  setTasksRefresh,
} from './tasks';
import { openCompare } from './compare';

const app = document.querySelector<HTMLDivElement>('#app')!;

const LS_THEME = 'yanheng.theme';
const LS_SIDEBAR = 'yanheng.sidebar';

let currentTheme: 'dark' | 'light' = 'dark';
let sidebarPinned = localStorage.getItem(LS_SIDEBAR) !== 'hidden';

/** 固定 / 自动隐藏侧边栏 */
function applySidebar(pinned: boolean): void {
  const root = document.querySelector<HTMLElement>('.app');
  if (root) root.classList.toggle('sidebar-pinned', pinned);
  const btn = document.getElementById('sidebarToggle');
  if (btn) {
    btn.classList.toggle('pinned', pinned);
    btn.textContent = pinned ? '<' : '>';
    btn.title = pinned
      ? '收起左侧边栏'
      : '展开左侧边栏';
  }
  localStorage.setItem(LS_SIDEBAR, pinned ? 'pinned' : 'hidden');
}

function applyTheme(theme: 'dark' | 'light'): void {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(LS_THEME, theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☾' : '☀';
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
    <div class="app sidebar-pinned">
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

        <button class="console-nav" id="consoleBtn" title="查看调研行为与成本"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"></path></svg> 用户控制台</button>

        <div class="sidebar-foot">
          <span class="dot"></span><span class="foot-text">Agent 在线</span>
          <span class="spend" id="totalSpend">今日 ¥0.00</span>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div class="topbar-left">
            <button class="sidebar-toggle" id="sidebarToggle" title="收起左侧边栏">&lt;</button>
            <div class="crumb">调研台 / 新建任务</div>
          </div>
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

  document.getElementById('sidebarToggle')!.addEventListener('click', () => {
    sidebarPinned = !sidebarPinned;
    applySidebar(sidebarPinned);
  });

  document.getElementById('newBtn')!.addEventListener('click', () => {
    if (isConsoleOpen()) closeConsole();
    showWelcome(suggestions);
  });

  document.getElementById('consoleBtn')!.addEventListener('click', openConsole);

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
    if (conv) {
      /* 控制台页内点击历史会话：先退回对话页再回放 */
      if (isConsoleOpen()) closeConsole();
      replayConversation(conv);
    }
  });

  document.getElementById('clearConvs')!.addEventListener('click', () => {
    if (conversations.length === 0) return;
    if (confirm('确定清空全部历史对话？此操作不可恢复。')) clearConversations();
  });

  document.getElementById('taskList')!.addEventListener('click', (e) => {
    const del = (e.target as HTMLElement).closest<HTMLElement>('.task-del');
    if (!del) return;
    removeTask(del.dataset.del ?? '');
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
applySidebar(sidebarPinned);
setSidebarRefresh(renderSidebar);
const chat = document.getElementById('chat')!;
chat.innerHTML = welcomeHtml(suggestions);
floatComposer();
if (!loadConvs()) seedConvs();
seedTasks();
bind();
renderSidebar();
setStatus('待命中', 'idle');
