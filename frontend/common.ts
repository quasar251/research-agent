import type { ReportDepth } from './mock';

/* ---------------- HTML 转义 ---------------- */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const esc = escapeHtml;

/* ---------------- 时间格式化 ---------------- */
export function fmtTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/* ---------------- 全局状态（应用外壳与对话区共享） ---------------- */
export const state = {
  /** 当前报告深度 */
  depth: 'deep' as ReportDepth,
  /** 深度是否已锁定（一次对话只做一次） */
  depthLocked: false,
  /** 当前模型 */
  model: 'pro',
};

export const MODEL_LABEL: Record<string, string> = {
  pro: '研衡 Pro',
  turbo: '研衡 Turbo',
  claude: 'Claude',
  gpt: 'GPT-4o',
};

/* ---------------- 用量与成本（Mock） ---------------- */
export interface Usage {
  inT: number;
  outT: number;
  cost: number;
}

export const SUP_USAGE: Usage = { inT: 600, outT: 1400, cost: 0.05 };

/** 追问按所选模型计费（Mock） */
export const MODEL_USAGE: Record<string, Usage> = {
  pro: SUP_USAGE,
  turbo: { inT: 400, outT: 900, cost: 0.02 },
  claude: { inT: 700, outT: 1500, cost: 0.09 },
  gpt: { inT: 650, outT: 1400, cost: 0.07 },
};

export function usageForModel(model: string): Usage {
  return MODEL_USAGE[model] ?? SUP_USAGE;
}

export function usageFor(depth: ReportDepth): Usage {
  const inT = depth === 'deep' ? 4200 : 1800;
  const outT = depth === 'deep' ? 11800 : 3200;
  const cost = Math.round((inT * 0.00001 + outT * 0.00003) * 100) / 100;
  return { inT, outT, cost };
}

export function usageChip(u: Usage): string {
  const total = u.inT + u.outT;
  const tok = total >= 1000 ? `${parseFloat((total / 1000).toFixed(1))}k` : `${total}`;
  return `<span class="msg-cost">token ${tok}</span><span class="msg-cost">¥${u.cost.toFixed(2)}</span>`;
}

/* ---------------- 报告深度（一次对话只做一次） ---------------- */
export function setDepthUI(depth: ReportDepth): void {
  document.querySelectorAll<HTMLElement>('.depth-opt').forEach((o) => {
    o.classList.toggle('active', o.dataset.depth === depth);
  });
}

export function setDepthLocked(locked: boolean): void {
  state.depthLocked = locked;
  document.querySelectorAll<HTMLButtonElement>('.depth-opt').forEach((o) => {
    o.disabled = locked;
  });
  document.getElementById('depthToggle')?.classList.toggle('locked', locked);
}

/* ---------------- 顶部状态指示 ---------------- */
export function setStatus(text: string, kind: 'idle' | 'busy' | 'ok'): void {
  const el = document.getElementById('agentStatus');
  const textEl = document.getElementById('statusText');
  if (el) el.dataset.state = kind;
  if (textEl) textEl.textContent = text;
}

/* ---------------- 主区域滚动（整页上下滑动） ---------------- */
export function scrollBottom(): void {
  const main = document.querySelector<HTMLElement>('.main');
  if (main && main.scrollHeight > main.clientHeight) {
    main.scrollTop = main.scrollHeight;
    return;
  }
  const chat = document.getElementById('chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}
