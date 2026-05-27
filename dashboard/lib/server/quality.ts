import { promises as fs } from 'node:fs';
import path from 'node:path';
import { URLSearchParams } from 'node:url';

const PIDEX_ROOT = path.resolve(process.cwd(), '..');

type AnyRecord = Record<string, any>;

export type TraceFinding = {
  type: string;
  operator_type: string;
  plan_key: string;
  severity: string;
  confidence: string;
  reason: string;
  evidence: string | null;
};

export type RuleImpactSummary = {
  rule_path: string;
  action: string;
  owning_agent: string;
  expected_impact_dimension: string;
  expected_direction: string;
  before_count: number;
  after_count: number;
  label: string;
  confidence: string;
  before_rejections: number;
  after_rejections: number;
  before_trace_proxy_gates: number;
  after_trace_proxy_gates: number;
};

export type TraceBreakdown = {
  by_type: Record<string, number>;
  by_operator: Record<string, number>;
  by_severity: Record<string, number>;
  findings: TraceFinding[];
};

export type QualitySummary = {
  project: string;
  project_path: string;
  generated_at: string | null;
  confidence: string | null;
  plans: string[];
  trace_gaps: number;
  critical_missing_operators: number;
  trace: TraceBreakdown;
  rule_impact: RuleImpactSummary[];
  regression_detectors: AnyRecord[];
  comparability: AnyRecord | null;
  latest_report: { json: string; markdown: string | null } | null;
  review_state: { reviewed_plans_count: number; last_review_at: string | null };
};

function projectName(projectPath: string): string {
  return path.basename(projectPath || '') || 'unknown';
}

function countBy(rows: AnyRecord[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const value = String(row?.[key] || 'unknown');
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelConfidence(label: string, beforeCount: number, afterCount: number): string {
  if (label === 'insufficient-data' || beforeCount < 3 || afterCount < 3) return 'low';
  if (label === 'not-comparable') return 'low';
  return beforeCount >= 6 && afterCount >= 6 ? 'medium' : 'low';
}

function normalizeFinding(row: AnyRecord): TraceFinding {
  return {
    type: String(row?.type || 'unknown'),
    operator_type: String(row?.operator_type || 'unknown'),
    plan_key: String(row?.plan_key || 'unknown-plan'),
    severity: String(row?.severity || 'unknown'),
    confidence: String(row?.confidence || 'unknown'),
    reason: String(row?.reason || ''),
    evidence: row?.evidence ? String(row.evidence) : null,
  };
}

function normalizeRuleImpact(row: AnyRecord): RuleImpactSummary {
  const beforeCount = num(row?.before_count);
  const afterCount = num(row?.after_count);
  const label = String(row?.label || 'insufficient-data');
  return {
    rule_path: String(row?.rule_path || 'unknown'),
    action: String(row?.action || 'unknown'),
    owning_agent: String(row?.owning_agent || 'unknown'),
    expected_impact_dimension: String(row?.expected_impact_dimension || 'unknown'),
    expected_direction: String(row?.expected_direction || 'unknown'),
    before_count: beforeCount,
    after_count: afterCount,
    label,
    confidence: String(row?.confidence || labelConfidence(label, beforeCount, afterCount)),
    before_rejections: num(row?.before_rejections),
    after_rejections: num(row?.after_rejections),
    before_trace_proxy_gates: num(row?.before_trace_proxy_gates),
    after_trace_proxy_gates: num(row?.after_trace_proxy_gates),
  };
}

async function walkJson(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
    }
  }
  await walk(dir);
  return out.sort();
}

async function readReport(file: string): Promise<(AnyRecord & { _path: string; _mtime: number }) | null> {
  try {
    const stat = await fs.stat(file);
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.summary) return null;
    return { ...parsed, _path: file, _mtime: stat.mtimeMs };
  } catch {
    return null;
  }
}

async function readReviewState(root: string): Promise<QualitySummary['review_state']> {
  const file = path.join(root, 'state', 'quality', 'review-state.json');
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
    const reviewed = Array.isArray(parsed?.reviewed_plans) ? parsed.reviewed_plans : [];
    return { reviewed_plans_count: reviewed.length, last_review_at: parsed?.last_review_at || parsed?.updated_at || null };
  } catch {
    return { reviewed_plans_count: 0, last_review_at: null };
  }
}

function markdownPathFor(reportPath: string, report: AnyRecord): string | null {
  const physical = report?.summary?.operator_trace?.physical_action?.markdown_report;
  if (typeof physical === 'string') return physical;
  const md = reportPath.replace(`${path.sep}state${path.sep}quality${path.sep}`, `${path.sep}agents.output${path.sep}quality${path.sep}`).replace(/\.json$/, '.md');
  return md;
}

export function summarizeQualityReport(report: AnyRecord, reviewState: QualitySummary['review_state'] = { reviewed_plans_count: 0, last_review_at: null }): QualitySummary {
  const summary = report.summary || {};
  const trace = summary.operator_trace || {};
  const findings = Array.isArray(trace.findings) ? trace.findings : [];
  const projectPath = String(report.project_path || '');
  return {
    project: projectName(projectPath),
    project_path: projectPath,
    generated_at: report.generated_at || null,
    confidence: summary.confidence || null,
    plans: Array.isArray(summary.plans_reviewed) ? summary.plans_reviewed : [],
    trace_gaps: Number(trace.gap_count || 0),
    critical_missing_operators: Number(trace.critical_missing_operators || 0),
    trace: {
      by_type: countBy(findings, 'type'),
      by_operator: countBy(findings, 'operator_type'),
      by_severity: countBy(findings, 'severity'),
      findings: findings.slice(0, 50).map(normalizeFinding),
    },
    rule_impact: Array.isArray(summary.rule_action_windows) ? summary.rule_action_windows.map(normalizeRuleImpact) : [],
    regression_detectors: Array.isArray(summary.regression_detectors) ? summary.regression_detectors : [],
    comparability: summary.comparability || null,
    latest_report: report._path ? { json: report._path, markdown: markdownPathFor(report._path, report) } : null,
    review_state: reviewState,
  };
}

async function loadReports(root: string): Promise<AnyRecord[]> {
  const files = await walkJson(path.join(root, 'state', 'quality'));
  const reports = (await Promise.all(files.map(readReport))).filter(Boolean) as AnyRecord[];
  return reports.sort((a, b) => (Date.parse(b.generated_at || '') || b._mtime || 0) - (Date.parse(a.generated_at || '') || a._mtime || 0));
}

function matchesProject(report: AnyRecord, project: string): boolean {
  const p = project.trim();
  if (!p) return true;
  const projectPath = String(report.project_path || '');
  return projectPath === p || projectName(projectPath) === p || projectPath.toLowerCase().includes(p.toLowerCase());
}

export async function getQualityProjects(search = '', root = PIDEX_ROOT): Promise<{ ok: true; generated_at: string; projects: QualitySummary[] }> {
  const reports = await loadReports(root);
  const reviewState = await readReviewState(root);
  const byProject = new Map<string, AnyRecord>();
  for (const report of reports) {
    const key = String(report.project_path || 'unknown');
    if (!byProject.has(key)) byProject.set(key, report);
  }
  return { ok: true, generated_at: new Date().toISOString(), projects: [...byProject.values()].map((r) => summarizeQualityReport(r, reviewState)) };
}

export async function getQualityLatest(search = '', root = PIDEX_ROOT): Promise<{ ok: true; generated_at: string; latest: QualitySummary | null }> {
  const q = new URLSearchParams(search);
  const project = q.get('project') || '';
  const reports = (await loadReports(root)).filter((r) => matchesProject(r, project));
  const reviewState = await readReviewState(root);
  return { ok: true, generated_at: new Date().toISOString(), latest: reports[0] ? summarizeQualityReport(reports[0], reviewState) : null };
}
