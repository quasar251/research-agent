import {
  esc,
  fmtTime,
  state,
  usageChip,
  usageFor,
  usageForModel,
  MODEL_LABEL,
} from './common';
import type { Report, ReportDepth } from './mock';

/* ================================================================
 * 视图模板层（纯 HTML 字符串生成，无运行时 / 流程状态）
 * ----------------------------------------------------------------
 * 只负责「把数据拼成 DOM 字符串」，不持有 runtimes/threads 等状态，
 * 与交互逻辑（dialog.ts）彻底解耦，便于独立复用与测试。
 * ================================================================ */

/* ---------------- 欢迎页 ---------------- */
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
      <h1 class="welcome-title">想了解哪个行业？把问题交给<em>研小报</em>。</h1>
      <p class="welcome-sub">选「简单 / 深度」，输入主题即可生成报告，过程中可随时确认或提出修改意见。</p>
      <div class="welcome-actions">${chips}</div>
    </div>`;
}

export function wordWallHtml(): string {
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

/* ---------------- 调研卡片骨架 ---------------- */
const BACK_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

const STEP_LABELS = ['任务拆解', '数据检索', '深度分析', '交叉审查', '生成报告'];
const STEP_LABELS_SIMPLE = ['规划检索', '速览分析', '核验报告'];

function stepperHtml(labels: string[] = STEP_LABELS): string {
  return labels.map((label, i) => {
    const line = i < labels.length - 1 ? `<div class="stepper-line" data-line="${i}"></div>` : '';
    return `
      <div class="stepper-item" data-step="${i}"><div class="stepper-dot">${i + 1}</div><div class="stepper-label">${label}</div></div>
      ${line}`;
  }).join('');
}

function wfNode(key: 'm' | 's' | 'a' | 'c', color: string, letter: string, name: string): string {
  return `<div class="wf-node" data-agent="${key}">
    <div class="wf-icon" style="background-color:${color}">${letter}</div>
    <div class="wf-info"><div class="wf-name">${name}</div><div class="wf-status" data-status="${key}">待命</div></div>
  </div>`;
}

/** 页面底部常驻的追问栏（唯一实例，挂在 .main 上，随滚动始终可见） */
export function ensureFollowDock(): HTMLElement {
  const existing = document.getElementById('followDock');
  if (existing) return existing;
  const main = document.querySelector<HTMLElement>('.main')!;
  main.insertAdjacentHTML(
    'beforeend',
    `
    <div class="follow-dock hidden" id="followDock">
      <div class="follow-hover-zone"></div>
      <div class="follow-up">
        <div class="follow-title">继续追问</div>
        <div class="follow-chips"></div>
        <div class="follow-row">
          <label class="follow-model" title="选择追问模型">
            <span class="model-select-wrapper">
              <select class="model-select follow-model-select" id="followModelSelect" title="选择追问模型" aria-label="选择追问模型">
                <option value="pro">研小报 Pro</option>
                <option value="turbo">研小报 Turbo</option>
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

export function msgActionsHtml(editable: boolean): string {
  return `
    <div class="msg-actions">
      <button class="ma-btn" data-act="copy" title="复制">${ICON_COPY}</button>
      ${editable ? `<button class="ma-btn" data-act="edit" title="修改">${ICON_EDIT}</button>` : ''}
      <button class="ma-btn" data-act="del" title="删除">${ICON_DEL}</button>
    </div>`;
}

/** 追问回复消息（带模型、时间与 token / 成本） */
export function followAgentHtml(
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
          <div class="agent-name">研小报 Agent</div>
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

/** 调研主卡片骨架 HTML */
export function cardHtml(id: string, r: Report, depth: ReportDepth, query?: string): string {
  const model = MODEL_LABEL[state.model] ?? state.model;
  return `
    <div class="research-card" data-card="${id}" data-reportid="${r.id}" data-depth="${depth}">
      <header class="research-header">
        <div class="header-left">
          <div class="header-tag">Multi-Agent Topology</div>
          <div class="header-title">${depth === 'deep' ? '正在深度调研：' : '正在调研：'}<span>${esc(query || r.domain)}</span></div>
        </div>
        <button class="back-btn" data-act="exit-reader">${BACK_SVG}返回调研过程</button>
      </header>
      <div class="main-card">
        <div class="stepper-container">${stepperHtml(depth === 'simple' ? STEP_LABELS_SIMPLE : STEP_LABELS)}</div>
        <div class="card-body">
          <div class="dag-sidebar">
            <div class="sidebar-title">${depth === 'simple' ? 'Agent 轻量流水线' : 'Agent 协同工作流'}</div>
            <div class="workflow-container">
              <svg class="workflow-svg"></svg>
              ${wfNode('m', 'var(--agent-m)', 'M', 'Master 规划&写作')}
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

/** 用户 / 追问用户消息气泡 */
export function userMsgHtml(
  text: string,
  role: 'user' | 'follow-user' = 'user',
  index = -1,
  threadId = '',
): string {
  const attrs = `${index >= 0 ? ` data-msg-index="${index}"` : ''}${threadId ? ` data-thread="${threadId}"` : ''}`;
  const actions = role === 'follow-user' ? msgActionsHtml(true) : '';
  return `<div class="msg user" data-role="${role}"${attrs}><div class="user-bubble">${esc(text)}</div>${actions}</div>`;
}

/** 真实调研卡片骨架：走后端 API，进度由 SSE 驱动，报告由 backendReportHtml 渲染 */
export function realCardHtml(id: string, query: string, depth: ReportDepth): string {
  return `
    <div class="research-card" data-real-card="${id}" data-depth="${depth}">
      <header class="research-header">
        <div class="header-left">
          <div class="header-tag">REAL RESEARCH · 后端调研</div>
          <div class="header-title">正在${depth === 'deep' ? '深度' : ''}调研：<span>${esc(query)}</span></div>
        </div>
      </header>
      <div class="main-card">
        <div class="main-content">
          <div class="collab-status-banner"><div class="dag-dot"></div><span class="banner-text real-status">准备启动...</span></div>
          <div class="document-area"><div class="real-report"></div></div>
        </div>
      </div>
    </div>`;
}
