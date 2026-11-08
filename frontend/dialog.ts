import { state, setDepthLocked, setDepthUI, setStatus } from './common';
import { backendReportHtml } from './report';
import { newRunId, subscribeEvents, getResearch } from './api';
import {
  refreshSidebar,
  setActiveConv,
  recordBackendConversation,
  setConvReport,
  type Conversation,
} from './store';
import { welcomeHtml, wordWallHtml, realCardHtml } from './views';

/* ================================================================
 * 对话区模块（数据来自后端 API，前端只做渲染）
 * ----------------------------------------------------------------
 * - 新建调研页（欢迎态 / 文字墙 / 输入框浮沉）
 * - 真实调研卡片（SSE 驱动进度 + 后端报告渲染）
 * - 历史会话回放（后端报告缓存）
 * ================================================================ */

/* ---------------- 新建调研页（欢迎态） ---------------- */
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
  setActiveConv(null);
  setDepthLocked(false);
  refreshSidebar();
  setStatus('待命中', 'idle');
}

/* ---------------- 追问栏（后端追问暂未接入，先隐藏） ---------------- */
function hideFollowDock(): void {
  document.getElementById('followDock')?.classList.add('hidden');
}

/** 供控制台查询：当前是否有调研在跑（新路径无全局 running 态，恒为 false） */
export function isResearchRunning(): boolean {
  return false;
}

/** 供控制台关闭后恢复追问栏（新路径暂无追问，no-op） */
export function restoreFollowDock(): void {
  /* no-op */
}

/* ---------------- 滚动辅助 ---------------- */
function scrollToCard(): void {
  document
    .querySelector<HTMLElement>('.research-card .research-header')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function lockPageScroll(lock: boolean): void {
  document.querySelector<HTMLElement>('.main')?.classList.toggle('scroll-locked', lock);
}

/* ================================================================
 * 消息发送与回放（后端 API）
 * ================================================================ */
const STAGE_LABEL: Record<string, string> = {
  align: '任务拆解中...',
  collect: '数据检索中...',
  verify: '交叉审查中...',
  synthesize: '生成报告中...',
};

export function sendMessage(text: string): void {
  const query = text.trim();
  if (!query) return;

  dockComposer();
  document.getElementById('welcome')?.remove();

  const depth = state.depth;
  const runId = newRunId();
  const conv = recordBackendConversation(query, depth, runId);

  // 挂载真实调研卡片（数据来自后端 API）
  const chat = document.getElementById('chat')!;
  chat.insertAdjacentHTML('beforeend', realCardHtml(runId, query, depth));
  const card = chat.querySelector<HTMLElement>(`[data-real-card="${runId}"]`)!;

  setDepthLocked(true);
  hideFollowDock();
  setStatus('调研中…', 'busy');
  scrollToCard();

  subscribeEvents(
    runId,
    query,
    depth,
    (node) => {
      const el = card.querySelector<HTMLElement>('.real-status');
      if (el) el.textContent = STAGE_LABEL[node] ?? node;
    },
    async () => {
      const reportEl = card.querySelector<HTMLElement>('.real-report');
      try {
        const st = await getResearch(runId);
        if (st.report && reportEl) {
          setConvReport(conv.id, st.report);
          reportEl.innerHTML = backendReportHtml(st.report, depth);
          setStatus('已完成', 'ok');
        } else {
          setStatus('调研失败', 'idle');
          if (reportEl) reportEl.innerHTML = '<div class="doc-text">调研失败，请稍后重试。</div>';
        }
      } catch {
        setStatus('调研失败', 'idle');
        if (reportEl) reportEl.innerHTML = '<div class="doc-text">调研失败，请稍后重试。</div>';
      }
    },
  );
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

  // 渲染真实后端报告（有缓存直接用，无缓存从后端拉取）
  chat.insertAdjacentHTML('beforeend', realCardHtml(conv.runId, conv.title, conv.depth));
  const card = chat.querySelector<HTMLElement>(`[data-real-card="${conv.runId}"]`)!;
  const reportEl = card.querySelector<HTMLElement>('.real-report')!;

  if (conv.report) {
    reportEl.innerHTML = backendReportHtml(conv.report, conv.depth);
    setStatus('已完成', 'ok');
  } else {
    getResearch(conv.runId)
      .then((st) => {
        if (st.report) {
          setConvReport(conv.id, st.report);
          reportEl.innerHTML = backendReportHtml(st.report, conv.depth);
          setStatus('已完成', 'ok');
        } else {
          reportEl.innerHTML = '<div class="doc-text">报告不可用，请重新发起调研。</div>';
          setStatus('调研失败', 'idle');
        }
      })
      .catch(() => {
        reportEl.innerHTML = '<div class="doc-text">报告不可用，请重新发起调研。</div>';
        setStatus('调研失败', 'idle');
      });
  }
  refreshSidebar();
  scrollToCard();
}

/* ================================================================
 * 聊天区事件委托
 * ================================================================ */
export function bindChatEvents(): void {
  const root = document.querySelector<HTMLElement>('.main')!;

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const chip = target.closest<HTMLElement>('.chip');
    if (chip) {
      sendMessage(chip.dataset.query ?? '');
    }
  });
}
