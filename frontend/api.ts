// 后端 API client：对接 /research 端点（替换 mock.ts 的虚拟数据源）

const BASE = 'http://127.0.0.1:8000';

export interface BackendTakeaway {
  text: string;
  strength: string;
  refs: number[];
}

export interface BackendCitation {
  title: string;
  source: string;
  date: string;
  strength: string | null;
}

export interface BackendSeriesPoint {
  year: string;
  value: number;
}

export interface BackendBarItem {
  name: string;
  pct: number;
}

export interface BackendSwot {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface BackendRisk {
  name: string;
  likelihood: number;
  impact: number;
}

export interface BackendSection {
  heading: string;
  kind: string;
  paragraphs: string[];
  bullets: string[];
  series: BackendSeriesPoint[];
  unit: string;
  bars: BackendBarItem[];
  swot: BackendSwot | null;
  risks: BackendRisk[];
}

export interface BackendReport {
  topic: string;
  summary: string;
  takeaways: BackendTakeaway[];
  citations: BackendCitation[];
  sections: BackendSection[];
  coverage: number;
}

export interface ResearchStatus {
  run_id: string;
  status: string;
  report?: BackendReport;
  metrics?: Record<string, unknown>;
  approval_hint?: string;
}

export function newRunId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

export async function createResearch(intent: string, depth: string): Promise<{ run_id: string; status: string }> {
  const resp = await fetch(`${BASE}/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, depth }),
  });
  if (!resp.ok) throw new Error(`create research failed: ${resp.status}`);
  return resp.json();
}

export async function getResearch(run_id: string): Promise<ResearchStatus> {
  const resp = await fetch(`${BASE}/research/${run_id}`);
  if (!resp.ok) throw new Error(`get research failed: ${resp.status}`);
  return resp.json();
}

/** SSE 订阅调研进度；返回取消函数。onNode 收到阶段名，onDone 收到结束（成功或失败）。 */
export function subscribeEvents(
  run_id: string,
  intent: string,
  depth: string,
  onNode: (node: string) => void,
  onDone: () => void,
): () => void {
  const es = new EventSource(
    `${BASE}/research/${run_id}/events?intent=${encodeURIComponent(intent)}&depth=${depth}`,
  );
  es.onmessage = (e) => {
    if (e.data === '[DONE]') {
      es.close();
      onDone();
      return;
    }
    try {
      const msg = JSON.parse(e.data);
      if (msg.node) onNode(msg.node);
    } catch {
      /* ignore malformed event */
    }
  };
  es.onerror = () => {
    es.close();
    onDone();
  };
  return () => es.close();
}
