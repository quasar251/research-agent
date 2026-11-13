// 演示数据 API：所有业务数据由 Python 后端 /demo/* 提供，前端不再硬编码 mock。
import type { Report, ReportDepth, StageDefLookup } from './mock';
import { setBackendData } from './mock';

const BASE = 'http://127.0.0.1:8000/demo';

export interface BootstrapPayload {
  reports: Record<string, Report>;
  suggestions: string[];
  history: { id: string; title: string; domain: string; time: string }[];
  stages: StageDefLookup;
  server_time: string;
}

async function post<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const resp = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return fallback;
    return (await resp.json()) as T;
  } catch {
    return fallback;
  }
}

/** 启动时拉取全部静态数据并注入 mock.ts 的可变容器 */
export async function loadDemoData(): Promise<BootstrapPayload | null> {
  try {
    const resp = await fetch(`${BASE}/bootstrap`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as BootstrapPayload;
    setBackendData(data.reports, data.suggestions, data.stages);
    return data;
  } catch {
    return null;
  }
}

/** 按用户意图匹配报告（后端决定，替代前端关键词匹配） */
export async function matchReportFromBackend(query: string): Promise<Report | null> {
  const r = await post<{ report_id: string; report: Report } | null>(
    '/match',
    { query },
    null,
  );
  return r?.report ?? null;
}

/** 追问回答由 Python 后端模拟 */
export async function followFromBackend(
  question: string,
  reportId: string,
  model: string,
): Promise<{ label: string; bullets: string[] }> {
  const fallback = {
    label: '追问 · 本地降级',
    bullets: ['后端暂不可用，请稍后重试。'],
  };
  return post('/follow', { question, report_id: reportId, model }, fallback);
}

/** HITL 审批动作发到后端记录（不阻塞前端 DAG Promise 语义） */
export function sendActionToBackend(
  action: 'confirm' | 'retry',
  reportId: string,
  stage: number,
  feedback: string,
): void {
  void post('/action', { action, report_id: reportId, stage, feedback }, { ok: false });
}

/** 按 reportId + depth 取后端下发的阶段定义 */
export function stagesFor(
  stages: StageDefLookup,
  reportId: string,
  depth: ReportDepth,
): StageDefLookup[string] | null {
  return stages[`${reportId}:${depth}`] ?? null;
}
