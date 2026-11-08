import type { ReportDepth } from './mock';
import type { BackendReport } from './api';
import { fmtTime, usageFor } from './common';

/* ================================================================
 * 会话存储（历史对话持久化）
 * ----------------------------------------------------------------
 * 独立的低耦合模块：只负责会话数据的类型、内存态与 localStorage 落盘。
 * 不依赖任何 DOM / 运行时 / UI 逻辑，可被 main / dialog / console 共享。
 * ================================================================ */

export type ChatMessage =
  | { type: 'user'; text: string }
  | { type: 'research'; reportId: string; depth: ReportDepth; stage?: number; hitlDone?: boolean }
  | { type: 'follow-user'; text: string }
  | { type: 'follow-agent'; label: string; bullets: string[]; time: string; model?: string };

export interface Conversation {
  id: string;
  runId: string;
  reportId: string;  // 兼容旧数据（等于 runId）
  title: string;
  domain: string;
  time: string;
  depth: ReportDepth;
  cost: number;
  report?: BackendReport;  // 后端报告缓存（回放用）
  messages: ChatMessage[];
}

export let conversations: Conversation[] = [];
export let activeConvId: string | null = null;
export let activeConv: Conversation | null = null;
export let todaySpend = 0;
let convSeq = 0;

const LS_CONVS = 'deepresearch.conversations';
const LS_SPEND = 'deepresearch.todaySpend';

/** 侧边栏刷新回调，由应用外壳注册（避免模块间循环依赖） */
let sidebarRefresh: () => void = () => {};

export function setSidebarRefresh(fn: () => void): void {
  sidebarRefresh = fn;
}

/** 供需要主动刷新侧边栏的模块调用（例如新建调研时清除高亮） */
export function refreshSidebar(): void {
  sidebarRefresh();
}

/** 设置当前活跃会话（activeConv 与 activeConvId 保持一致） */
export function setActiveConv(conv: Conversation | null): void {
  activeConv = conv;
  activeConvId = conv ? conv.id : null;
}

/** 设置今日花费（供追问消息增删改时回写） */
export function setTodaySpend(v: number): void {
  todaySpend = v;
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
    stage?: number;
    hitlDone?: boolean;
    label?: string;
    bullets?: string[];
    time?: string;
    model?: string;
  };
  if (m.type === 'user' && typeof m.text === 'string') return { type: 'user', text: m.text };
  if ((m.type === 'research' || m.type === 'report') && m.reportId) {
    return { type: 'research', reportId: m.reportId, depth: m.depth ?? 'deep', stage: m.stage, hitlDone: m.hitlDone };
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
  // 后端数据源，不再种子 Mock 会话
  conversations = [];
  todaySpend = 0;
  saveConvs();
}

/** 记录一次真实后端调研（sendMessage 用） */
export function recordBackendConversation(query: string, depth: ReportDepth, runId: string): Conversation {
  const cost = usageFor(depth).cost;
  const id = `c${++convSeq}`;
  const conv: Conversation = {
    id,
    runId,
    reportId: runId,
    title: query,
    domain: query,
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

/** 调研完成后回写报告缓存（回放用） */
export function setConvReport(convId: string, report: BackendReport): void {
  const conv = conversations.find((c) => c.id === convId);
  if (conv) {
    conv.report = report;
    conv.title = report.topic || conv.title;
    saveConvs();
    sidebarRefresh();
  }
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
