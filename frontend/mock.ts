// 数据契约与运行时容器。
// 所有业务数据（报告 / 五阶段流程 / 建议词）均由 Python 后端 /demo/bootstrap 注入，
// 本文件不再包含任何硬编码假数据，仅保留类型定义。

export interface Step {
  label: string;
  detail: string;
}

export type EvidenceStrength = 'solid' | 'inferred' | 'consensus' | 'divided';

export const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  solid: '实锤',
  inferred: '推断',
  consensus: '共识',
  divided: '分歧',
};

export interface Citation {
  title: string;
  source: string;
  date: string;
  strength: EvidenceStrength;
}

export interface Takeaway {
  text: string;
  strength: EvidenceStrength;
  refs: number[];
}

export interface SeriesPoint {
  year: string;
  value: number;
}

export interface BarItem {
  name: string;
  pct: number;
}

export type SectionKind = 'prose' | 'bullets' | 'chart' | 'bars' | 'swot' | 'risk';
export type ReportDepth = 'simple' | 'deep';

export interface SwotItem {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface RiskItem {
  name: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
}

export interface Section {
  heading: string;
  kind: SectionKind;
  depth?: ReportDepth;
  paragraphs?: string[];
  bullets?: string[];
  series?: SeriesPoint[];
  unit?: string;
  bars?: BarItem[];
  swot?: SwotItem;
  risks?: RiskItem[];
  deepDive?: string[];
}

export interface Report {
  id: string;
  topic: string;
  domain: string;
  updatedAt: string;
  tags: string[];
  headline: { label: string; value: string };
  cagr: string;
  summary: string;
  takeaways: Takeaway[];
  followUpHints: string[];
  citations: Citation[];
  sections: Section[];
}

export interface HistoryItem {
  id: string;
  title: string;
  domain: string;
  time: string;
}

/** 阶段定义（对齐 stages.ts 的 StageDef），由后端下发 */
export interface StageDefData {
  title: string;
  cards: { title: string; logs: string[]; ms: number }[];
  result: string;
  hitl: string | null;
}

/** key 形如 "ai-agent:deep" */
export type StageDefLookup = Record<string, StageDefData[]>;

/* ------------------------------------------------------------------
 * 运行时数据容器：由 demoApi.loadDemoData() 原地填充，
 * 使用 const + Object.assign 以兼容各模块的静态 import 引用。
 * ------------------------------------------------------------------ */
export const reports: Record<string, Report> = {};
export const history: HistoryItem[] = [];
export const suggestions: string[] = [];
export const backendStages: StageDefLookup = {};

let dataReady = false;

export function isDataReady(): boolean {
  return dataReady;
}

export function setBackendData(
  newReports: Record<string, Report>,
  newSuggestions: string[],
  newStages: StageDefLookup,
  newHistory: HistoryItem[] = [],
): void {
  Object.keys(reports).forEach((k) => delete reports[k]);
  Object.assign(reports, newReports);
  suggestions.splice(0, suggestions.length, ...newSuggestions);
  history.splice(0, history.length, ...newHistory);
  Object.keys(backendStages).forEach((k) => delete backendStages[k]);
  Object.assign(backendStages, newStages);
  dataReady = Object.keys(reports).length > 0;
}

/** 取后端下发的阶段定义；缺失时返回 null，由调用方降级 */
export function stagesForReport(reportId: string, depth: ReportDepth): StageDefData[] | null {
  return backendStages[`${reportId}:${depth}`] ?? null;
}
