import { reports, suggestions } from './mock';
import { esc } from './common';
import { conversations, todaySpend } from './store';
import { isResearchRunning, restoreFollowDock, showWelcome } from './dialog';

/* ================================================================
 * 用户控制台 · 调研台账（独立页面视图，复用 .main 布局与顶栏）
 * ----------------------------------------------------------------
 * 视觉方向：编辑风「台账 / 铅账」——衬线大数字、mono 小字、双细线
 * 分隔、壹贰叁小节编号，与全站暖纸色报告风格同源。
 * 数据全部来自 localStorage 中真实保存的会话记录。
 * ================================================================ */

let consoleOpen = false;

export function isConsoleOpen(): boolean {
  return consoleOpen;
}

interface ConvStat {
  topic: string;
  domain: string;
  depth: 'deep' | 'simple';
  time: string;
  cost: number;
  stage: number;
}

function convStage(c: (typeof conversations)[number]): number {
  const rm = c.messages.find((m) => m.type === 'research');
  const stage = rm && rm.type === 'research' ? rm.stage : undefined;
  return stage ?? 5;
}

function collectStats(): ConvStat[] {
  return conversations.map((c) => ({
    topic: c.title || reports[c.reportId]?.topic || c.reportId,
    domain: c.domain,
    depth: c.depth,
    time: c.time,
    cost: c.cost,
    stage: convStage(c),
  }));
}

function distRow(name: string, count: number, total: number, cost: number, accent: string): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `
    <div class="cd-row">
      <span class="cd-name">${esc(name)}</span>
      <span class="cd-bar"><i style="width:${pct}%;background:${accent}"></i></span>
      <span class="cd-num">${count} 次</span>
      <span class="cd-cost">¥${cost.toFixed(2)}</span>
    </div>`;
}

function activityRow(s: ConvStat, i: number): string {
  const status =
    s.stage >= 5
      ? '<span class="ca-status done">已完成</span>'
      : `<span class="ca-status running">进行中 ${s.stage}/5</span>`;
  return `
    <div class="ca-row">
      <span class="ca-idx">${String(i + 1).padStart(2, '0')}</span>
      <div class="ca-main">
        <div class="ca-topic">${esc(s.topic)}</div>
        <div class="ca-meta">${esc(s.domain)} · ${s.depth === 'deep' ? '深度' : '简版'} · ${esc(s.time)}</div>
      </div>
      ${status}
      <span class="ca-cost">¥${s.cost.toFixed(2)}</span>
    </div>`;
}

function consoleHtml(stats: ConvStat[]): string {
  const total = stats.length;
  const totalCost = stats.reduce((s, x) => s + x.cost, 0);
  const avgCost = total > 0 ? totalCost / total : 0;
  const deep = stats.filter((s) => s.depth === 'deep');
  const simple = stats.filter((s) => s.depth === 'simple');
  const running = stats.filter((s) => s.stage < 5).length;

  const domains = new Map<string, { count: number; cost: number }>();
  for (const s of stats) {
    const d = domains.get(s.domain) ?? { count: 0, cost: 0 };
    d.count += 1;
    d.cost += s.cost;
    domains.set(s.domain, d);
  }
  const domainRows = [...domains.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const palette = ['var(--accent)', 'var(--agent-a, #8B6FAE)', 'var(--success)'];

  return `
    <div class="console">
      <header class="console-head">
        <div>
          <div class="console-kicker">USER CONSOLE · 虚拟数据</div>
          <h1 class="console-title">调研台账</h1>
          <p class="console-desc">每一次调研行为与成本发生，皆有账可查。</p>
        </div>
        <button class="console-back" id="consoleBack">← 返回调研台</button>
      </header>

      ${
        total === 0
          ? '<div class="console-empty">暂无调研记录，先发起一次行业调研吧。</div>'
          : `
      <section class="ledger-strip">
        <div class="ls-cell">
          <span class="ls-label">累计调研</span>
          <span class="ls-value">${total}<i>次</i></span>
          <span class="ls-sub">${running > 0 ? `${running} 项进行中` : '全部已完成'}</span>
        </div>
        <div class="ls-cell">
          <span class="ls-label">累计花费</span>
          <span class="ls-value">¥${totalCost.toFixed(2)}</span>
          <span class="ls-sub">含全部会话</span>
        </div>
        <div class="ls-cell">
          <span class="ls-label">今日花费</span>
          <span class="ls-value">¥${todaySpend.toFixed(2)}</span>
          <span class="ls-sub">当日口径</span>
        </div>
        <div class="ls-cell">
          <span class="ls-label">平均单次</span>
          <span class="ls-value">¥${avgCost.toFixed(2)}</span>
          <span class="ls-sub">累计 ÷ 次数</span>
        </div>
      </section>

      <div class="ledger-cols">
        <section class="ledger-panel">
          <h2 class="lp-head">调研行为分布</h2>
          ${distRow('深度调研', deep.length, total, deep.reduce((s, x) => s + x.cost, 0), palette[0])}
          ${distRow('简版调研', simple.length, total, simple.reduce((s, x) => s + x.cost, 0), palette[2])}
          ${domainRows
            .map(([name, d], i) => distRow(name, d.count, total, d.cost, palette[i % palette.length]))
            .join('')}
        </section>
        <section class="ledger-panel">
          <h2 class="lp-head">成本构成</h2>
          ${domainRows
            .map(([name, d]) => {
              const pct = totalCost > 0 ? Math.round((d.cost / totalCost) * 100) : 0;
              return `
              <div class="cd-row">
                <span class="cd-name">${esc(name)}</span>
                <span class="cd-bar"><i style="width:${pct}%;background:var(--gold)"></i></span>
                <span class="cd-num">${pct}%</span>
                <span class="cd-cost">¥${d.cost.toFixed(2)}</span>
              </div>`;
            })
            .join('')}
          <div class="cp-note">成本为虚拟估算 · 深度 ¥0.40 / 次 · 简版 ¥0.20 / 次</div>
        </section>
      </div>

      <section class="ledger-panel">
        <h2 class="lp-head">最近调研行为</h2>
        <div class="ca-list">${stats.map(activityRow).join('')}</div>
      </section>`
      }
    </div>`;
}

export function openConsole(): void {
  if (consoleOpen) return;
  const main = document.querySelector<HTMLElement>('.main');
  const chat = document.getElementById('chat');
  const composer = document.getElementById('composer');
  if (!main || !chat || !composer) return;

  chat.style.display = 'none';
  composer.style.display = 'none';
  document.getElementById('followDock')?.classList.add('hidden');
  main.classList.remove('scroll-locked');

  const crumb = main.querySelector<HTMLElement>('.crumb');
  if (crumb) {
    crumb.dataset.prev = crumb.textContent ?? '';
    crumb.textContent = '调研台 / 用户控制台';
  }

  const view = document.createElement('section');
  view.className = 'console-view';
  view.id = 'consoleView';
  view.innerHTML = consoleHtml(collectStats());
  main.appendChild(view);
  consoleOpen = true;

  /* 返回调研台：关闭控制台并回到「新建任务」欢迎页（与面包屑文案一致） */
  const backToDesk = () => {
    closeConsole();
    showWelcome(suggestions);
  };
  view.querySelector('#consoleBack')!.addEventListener('click', backToDesk);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      backToDesk();
      main.removeEventListener('keydown', onKey);
    }
  };
  main.addEventListener('keydown', onKey);
  main.scrollTop = 0;
}

export function closeConsole(): void {
  if (!consoleOpen) return;
  document.getElementById('consoleView')?.remove();
  const chat = document.getElementById('chat');
  const composer = document.getElementById('composer');
  chat?.style.removeProperty('display');
  composer?.style.removeProperty('display');

  const crumb = document.querySelector<HTMLElement>('.crumb');
  if (crumb && crumb.dataset.prev !== undefined) {
    crumb.textContent = crumb.dataset.prev;
    delete crumb.dataset.prev;
  }

  /* 恢复对话页状态：调研进行中则继续锁定滚动，已完成则恢复追问栏 */
  if (isResearchRunning()) {
    document.querySelector<HTMLElement>('.main')?.classList.add('scroll-locked');
  } else {
    restoreFollowDock();
  }
  consoleOpen = false;
}
