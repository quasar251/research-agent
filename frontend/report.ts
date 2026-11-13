import {
  STRENGTH_LABEL,
  type Report,
  type ReportDepth,
  type Section,
  type EvidenceStrength,
} from './mock';
import { esc } from './common';

/* ================================================================
 * 完整报告渲染（全部为虚拟数据，来源 mock.ts）
 * ----------------------------------------------------------------
 * 1. 章节渲染：prose / bullets / chart / bars / swot / risk
 * 2. fullReportHtml：头部指标 + 核心结论 + 章节 + 信息来源
 *    （由 dialog.ts 阅读模式在卡片内展示，不新建页面）
 * ================================================================ */

function strengthChip(s: EvidenceStrength): string {
  return `<span class="strength strength-${s}">${STRENGTH_LABEL[s]}</span>`;
}

function levelClass(v: number): string {
  return v >= 4 ? 'high' : v >= 3 ? 'mid' : 'low';
}

/* ---------------- 折线 / 面积图 ---------------- */
function chartSvg(section: Section): string {
  const series = section.series ?? [];
  if (!series.length) return '';
  const unit = section.unit ?? '';
  const W = 640;
  const H = 220;
  const padL = 46;
  const padR = 16;
  const padT = 20;
  const padB = 30;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const max = Math.max(...series.map((p) => p.value)) * 1.15;
  const x = (i: number) => padL + (series.length === 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const y = (v: number) => padT + ih - (v / max) * ih;

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(series.length - 1).toFixed(1)} ${padT + ih} L ${x(0).toFixed(1)} ${padT + ih} Z`;

  const gridN = 4;
  const grid = Array.from({ length: gridN + 1 }, (_, g) => {
    const gy = padT + (g / gridN) * ih;
    const gv = Math.round((max * (gridN - g)) / gridN * 10) / 10;
    return `<line class="grid" x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}"></line><text class="axis" x="${padL - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end">${gv}</text>`;
  }).join('');

  const dots = series
    .map(
      (p, i) =>
        `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5"></circle>` +
        `<text class="vlabel" x="${x(i).toFixed(1)}" y="${(y(p.value) - 10).toFixed(1)}" text-anchor="middle">${p.value}</text>`,
    )
    .join('');
  const xlabels = series
    .map((p, i) => `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(p.year)}</text>`)
    .join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}">
        ${grid}
        <path class="area" d="${area}"></path>
        <path class="line" d="${line}"></path>
        ${dots}
        ${xlabels}
      </svg>
      <div class="chart-caption">单位：${esc(unit)}</div>
    </div>`;
}

/* ---------------- 横向条形图（份额） ---------------- */
function barsHtml(section: Section): string {
  const bars = section.bars ?? [];
  if (!bars.length) return '';
  const max = Math.max(...bars.map((b) => b.pct), 1);
  return `
    <div class="bars">
      ${bars
        .map(
          (b) => `
        <div class="bar-row">
          <div class="bar-name">${esc(b.name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${((b.pct / max) * 100).toFixed(1)}%"></div></div>
          <div class="bar-val">${b.pct}%</div>
        </div>`,
        )
        .join('')}
    </div>`;
}

/* ---------------- SWOT 四象限 ---------------- */
function swotHtml(section: Section): string {
  const swot = section.swot;
  if (!swot) return '';
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

/* ---------------- 风险矩阵 ---------------- */
function riskHtml(section: Section): string {
  const risks = section.risks ?? [];
  if (!risks.length) return '';
  return `
    <div class="risk-matrix">
      ${risks
        .map(
          (rk) => `
        <div class="risk-row">
          <div class="risk-name">${esc(rk.name)}</div>
          <div class="risk-metric">
            <span class="risk-tag risk-l-${levelClass(rk.likelihood)}">可能性 ${rk.likelihood}/5</span>
            <span class="risk-tag risk-i-${levelClass(rk.impact)}">影响 ${rk.impact}/5</span>
          </div>
        </div>`,
        )
        .join('')}
    </div>`;
}

/* ---------------- 单章节 ---------------- */
function sectionHtml(section: Section, idx: number): string {
  let body = '';
  switch (section.kind) {
    case 'prose':
      body = `<div class="prose">${(section.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
      break;
    case 'bullets':
      body = `<ul class="bullets">${(section.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
      break;
    case 'chart':
      body = chartSvg(section);
      break;
    case 'bars':
      body = barsHtml(section);
      break;
    case 'swot':
      body = swotHtml(section);
      break;
    case 'risk':
      body = riskHtml(section);
      break;
  }
  const deep = (section.deepDive ?? []).map((d) => `<li>${esc(d)}</li>`).join('');
  const deepBlock = deep
    ? `<div class="report-deep"><div class="report-deep-title">深挖补充 DEEP DIVE</div><ul class="bullets">${deep}</ul></div>`
    : '';
  return `
    <div class="section">
      <div class="sec-head">
        <span class="sec-index">${String(idx + 1).padStart(2, '0')}</span>
        <span class="sec-title">${esc(section.heading)}</span>
      </div>
      ${body}
      ${deepBlock}
    </div>`;
}

/* ---------------- 完整报告 ---------------- */
export function fullReportHtml(r: Report, depth: ReportDepth): string {
  const sections = depth === 'deep' ? r.sections : r.sections.filter((s) => s.depth !== 'deep');
  const depthLabel = depth === 'deep' ? '深度' : '简版';
  return `
    <div class="report">
      <div class="report-head">
        <div class="report-kicker">deep research · ${esc(r.domain)} · ${depthLabel}报告</div>
        <h2 class="report-title">${esc(r.topic)}深度洞察</h2>
        <div class="report-meta">
          ${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
          <span class="updated">更新于 ${esc(r.updatedAt)}</span>
        </div>
        <div class="report-metrics">
          <div class="report-metric"><span>${esc(r.headline.label)}</span><b>${esc(r.headline.value)}</b></div>
          <div class="report-metric"><span>三年 CAGR</span><b class="report-cagr">${esc(r.cagr)}</b></div>
        </div>
        <div class="report-summary">${esc(r.summary)}</div>
      </div>

      <div class="takeaways">
        <div class="takeaways-title">核心结论 KEY TAKEAWAYS</div>
        <ol>
          ${r.takeaways
            .map(
              (t) =>
                `<li>${esc(t.text)}${strengthChip(t.strength)}${
                  t.refs.length ? `<span class="trefs">[${t.refs.map((i) => i + 1).join(',')}]</span>` : ''
                }</li>`,
            )
            .join('')}
        </ol>
      </div>

      ${sections.map((s, i) => sectionHtml(s, i)).join('')}

      <div class="section">
        <div class="sec-head">
          <span class="sec-index">REF</span>
          <span class="sec-title">信息来源 References</span>
        </div>
        <ol class="cite-list">
          ${r.citations
            .map(
              (c, i) => `
          <li class="cite-item">
            <span class="cite-no">[${i + 1}]</span>
            <span class="cite-title">${esc(c.title)}</span>
            <span class="cite-src">${esc(c.source)} · ${esc(c.date)}</span>
            ${strengthChip(c.strength)}
          </li>`,
            )
            .join('')}
        </ol>
      </div>
    </div>`;
}
