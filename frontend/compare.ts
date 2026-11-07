import { reports, type Report } from './mock';
import { esc } from './common';
import { reportOptions } from './tasks';

/* ================================================================
 * 双行业对比弹窗
 * ----------------------------------------------------------------
 * 独立模块：以覆盖层方式呈现两份报告的关键指标对比。
 * ================================================================ */

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

export function openCompare(): void {
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
