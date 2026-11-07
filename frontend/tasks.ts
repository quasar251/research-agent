import { reports, type ReportDepth } from './mock';
import { esc } from './common';

/* ================================================================
 * 定时任务（内存态，Mock）
 * ----------------------------------------------------------------
 * 独立模块：持有定时任务列表状态、种子数据与创建/删除弹窗，
 * 变化时通过 setTasksRefresh 通知应用外壳刷新侧边栏。
 * ================================================================ */

export interface ScheduledTask {
  id: string;
  reportId: string;
  depth: ReportDepth;
  freq: '每天' | '每周' | '每月';
  time: string;
}

export let tasks: ScheduledTask[] = [];
let taskSeq = 0;

/** 定时任务变化后的侧边栏刷新回调，由应用外壳注册 */
let tasksRefresh: () => void = () => {};

export function setTasksRefresh(fn: () => void): void {
  tasksRefresh = fn;
}

export function seedTasks(): void {
  tasks = [
    { id: `t${++taskSeq}`, reportId: 'ai-agent', depth: 'deep', freq: '每周', time: '09:00' },
    { id: `t${++taskSeq}`, reportId: 'perovskite', depth: 'simple', freq: '每月', time: '08:30' },
  ];
}

const ALL_REPORT_IDS = ['ai-agent', 'humanoid', 'perovskite'];

/** 调研行业 <option> 列表（对比弹窗与定时任务弹窗共用） */
export function reportOptions(selected: string): string {
  return ALL_REPORT_IDS
    .map((id) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(reports[id].topic)}</option>`)
    .join('');
}

export function taskItemHtml(t: ScheduledTask): string {
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

export function removeTask(id: string): void {
  tasks = tasks.filter((t) => t.id !== id);
  tasksRefresh();
}

function addTask(reportId: string, depth: ReportDepth, freq: ScheduledTask['freq'], time: string): void {
  tasks.push({ id: `t${++taskSeq}`, reportId, depth, freq, time });
  tasksRefresh();
}

function closeTaskModal(): void {
  document.getElementById('taskModal')?.remove();
}

export function openTaskModal(): void {
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
    addTask(reportId, depth, freq, time);
    closeTaskModal();
  });
}
