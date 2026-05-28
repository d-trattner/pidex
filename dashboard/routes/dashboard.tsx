import { createFileRoute, useLocation } from '@tanstack/react-router';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { HelpPopover } from '../components/ui/help-popover';
import { LoadingIndicator } from '../components/ui/loading-indicator';
import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type SummaryPayload = {
  projects: number;
  pipeline_runs_started: number;
  pipeline_runs_completed: number;
  pipeline_events: number;
  agent_runs: number;
};

type QualitySummary = {
  project: string;
  scope?: 'project' | 'aggregate';
  generated_at: string | null;
  confidence: string | null;
  plans: string[];
  trace_gaps: number;
  critical_missing_operators: number;
  trace: { by_operator: Record<string, number>; by_severity: Record<string, number> };
  confidence_mix?: Record<string, number>;
  stale_projects?: Array<{ project: string; generated_at: string | null; age_hours: number | null }>;
  included_projects?: Array<{ project: string; trace_gaps: number; critical_missing_operators: number; confidence: string | null; generated_at: string | null }>;
};

type QualityLatestPayload = { ok: boolean; latest: QualitySummary | null };
type ProviderLimitsPayload = { records?: Array<{ provider?: string; window?: string; used_percent?: number; status?: string; forecast_status?: string; limit_reached?: boolean }> };
type QualityHistoryPayload = { history: Array<{ generated_at: string | null; trace_gaps: number; critical_missing_operators: number; confidence: string | null; regression_count: number }> };

function pct(done: number, total: number): string {
  if (!total) return '—';
  return `${((done / total) * 100).toFixed(1)}%`;
}

function ageLabel(generatedAt: string | null): string {
  if (!generatedAt) return 'no report timestamp';
  const ageHours = Math.max(0, (Date.now() - (Date.parse(generatedAt) || Date.now())) / 3_600_000);
  if (ageHours < 24) return `${ageHours.toFixed(0)}h old`;
  return `${(ageHours / 24).toFixed(1)}d old`;
}

function statusForQuality(latest: QualitySummary | null): { label: string; tone: 'good' | 'warn' | 'bad'; next: string } {
  if (!latest) return { label: 'unknown', tone: 'warn', next: 'Generate a PDQ report for this scope.' };
  if (latest.critical_missing_operators > 0) return { label: 'needs attention', tone: 'bad', next: 'Fix critical missing operator evidence, then refresh PDQ.' };
  if (latest.trace_gaps > 0) return { label: 'instrumentation debt', tone: 'warn', next: 'Repair repeated low-severity trace gaps and validate on the next real pipeline.' };
  if ((latest.plans?.length || 0) < 6) return { label: 'clean, low sample', tone: 'warn', next: 'Run more comparable pipelines before trusting trend direction.' };
  return { label: 'clean', tone: 'good', next: 'Keep monitoring trend and refresh stale reports.' };
}

function quotaRisk(records: ProviderLimitsPayload['records']): { label: string; tone: 'good' | 'warn' | 'bad'; detail: string } {
  const values = records || [];
  if (values.some((record) => record.limit_reached || record.status === 'exhausted')) return { label: 'blocked', tone: 'bad', detail: 'A provider quota appears exhausted.' };
  if (values.some((record) => Number(record.used_percent || 0) >= 85 || record.forecast_status === 'forecast-hit-before-reset')) return { label: 'risk', tone: 'warn', detail: 'A provider window is close to limit.' };
  return { label: 'safe', tone: 'good', detail: values.length ? 'No provider limit risk detected.' : 'No provider limit records available.' };
}

function DashboardLayout() {
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const scopeLabel = project || 'All projects';
  const summaryQuery = useDashboardQuery<SummaryPayload>(['dashboard-summary', project], withProjectParam('/api/summary', project));
  const qualityQuery = useDashboardQuery<QualityLatestPayload>(['dashboard-quality-latest', project], withProjectParam('/api/quality/latest', project));
  const historyQuery = useDashboardQuery<QualityHistoryPayload>(['dashboard-quality-history', project], withProjectParam('/api/quality/history?limit=12', project));
  const limitsQuery = useDashboardQuery<ProviderLimitsPayload>(['dashboard-provider-limits'], '/api/provider-limits');
  const loading = summaryQuery.isLoading || qualityQuery.isLoading || historyQuery.isLoading || limitsQuery.isLoading;
  const summary = summaryQuery.data;
  const latest = qualityQuery.data?.latest ?? null;
  const status = statusForQuality(latest);
  const quota = quotaRisk(limitsQuery.data?.records);
  const history = (historyQuery.data?.history || []).slice().reverse().map((row, index) => ({
    label: row.generated_at ? new Date(row.generated_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) : `#${index + 1}`,
    trace_gaps: Number(row.trace_gaps || 0),
    critical_missing_operators: Number(row.critical_missing_operators || 0),
    regression_count: Number(row.regression_count || 0),
  }));
  const confidenceData = Object.entries(latest?.confidence_mix || (latest?.confidence ? { [latest.confidence]: 1 } : {})).map(([name, value]) => ({ name, value }));
  const included = latest?.included_projects || [];
  const completion = pct(summary?.pipeline_runs_completed || 0, summary?.pipeline_runs_started || 0);

  return (
    <section className="dashboard-overview grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass dashboard-hero">
        <div className="card-heading-row">
          <div>
            <h2 className="h2">Dashboard</h2>
            <p className="muted">Selector-scoped operator overview for <strong>{scopeLabel}</strong>. Focus: quality trend and next action.</p>
          </div>
          <HelpPopover
            title="Dashboard scope"
            shows="The operational summary for the active project selector. All projects aggregates non-smoke projects; one selected project narrows the data."
            source="Global project selector, /api/summary, /api/quality/latest, /api/quality/history, /api/provider-limits."
            reading="Use this page for the first answer: what changed and what should I do next?"
            improve="Keep project selection correct, refresh stale PDQ reports, and fix high-risk gaps first."
            caveats="Aggregate mode intentionally hides smoke/tmp projects by default."
          />
        </div>
      </article>

      {loading ? <LoadingIndicator label="Loading dashboard overview…" /> : null}
      {!loading ? (
        <>
          <article className="glass-card glass metric-card-tight">
            <div className="card-heading-row"><p className="muted">Quality trend</p><HelpPopover title="Quality trend" shows="Current quality direction for the selected scope." source="/api/quality/latest and /api/quality/history." reading="Critical gaps outrank trace debt; low sample means the trend is not trustworthy yet." improve="Run comparable pipelines, refresh PDQ, and reduce critical/trace gaps." caveats="This is not a single quality score and should not be read as causality." /></div>
            <p className={`metric-value metric-${status.tone}`}>{status.label}</p>
            <p className="muted">{latest ? `${latest.trace_gaps} trace gaps · ${latest.critical_missing_operators} critical` : 'No PDQ report yet'}</p>
          </article>
          <article className="glass-card glass metric-card-tight">
            <div className="card-heading-row"><p className="muted">Next action</p><HelpPopover title="Next action" shows="The highest-leverage operator action inferred from current risk." source="Deterministic rules over quality read models and staleness." reading="Red/yellow states should produce concrete actions rather than just warnings." improve="Complete the suggested action and refresh PDQ to verify effect." caveats="Initial recommendations are rule-based, not LLM-generated." /></div>
            <p className="metric-value metric-action">{status.tone === 'bad' ? 'fix gaps' : status.tone === 'warn' ? 'validate' : 'monitor'}</p>
            <p className="muted">{status.next}</p>
          </article>
          <article className="glass-card glass metric-card-tight">
            <div className="card-heading-row"><p className="muted">Completion</p><HelpPopover title="Completion rate" shows="Completed plans over started plans for the selected scope." source="/api/summary from dashboard SQLite pipeline/agent data." reading="Low completion can mean failed, paused, or still-running work; inspect Runs for details." improve="Close terminal pipeline events cleanly and resolve failed review loops." /></div>
            <p className="metric-value">{completion}</p>
            <p className="muted">{summary?.pipeline_runs_completed || 0}/{summary?.pipeline_runs_started || 0} completed · {summary?.agent_runs || 0} agent runs</p>
          </article>
          <article className="glass-card glass metric-card-tight">
            <div className="card-heading-row"><p className="muted">Quota risk</p><HelpPopover title="Provider quota risk" shows="Whether Codex/Spark provider windows are close to blocking new work." source="/api/provider-limits." reading="Safe means no window currently looks likely to block; risk/block requires changing profile or waiting." improve="Switch profiles, reduce expensive lanes, or wait for provider reset." /></div>
            <p className={`metric-value metric-${quota.tone}`}>{quota.label}</p>
            <p className="muted">{quota.detail}</p>
          </article>

          <article className="glass-card glass quality-card quality-card-full">
            <div className="card-heading-row"><h3>Quality trend and critical burn-down</h3><HelpPopover title="Quality trend chart" shows="Trace gaps, critical missing operators, and regressions over recent PDQ reports." source="/api/quality/history reading existing state/quality/*.json files only." reading="Good direction means critical missing trends to zero and trace gaps fall or stay low." improve="Fix repeated operator gaps, rerun real pipelines, and refresh PDQ." caveats="Reports with different task classes may not be comparable." /></div>
            {history.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={history} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(34,255,225,0.16)" />
                  <XAxis dataKey="label" stroke="#8ad7ff" />
                  <YAxis stroke="#8ad7ff" allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="trace_gaps" name="Trace gaps" stroke="#00f5ff" fill="#00f5ff44" />
                  <Area type="monotone" dataKey="critical_missing_operators" name="Critical missing" stroke="#ff3864" fill="#ff386444" />
                  <Area type="monotone" dataKey="regression_count" name="Regressions" stroke="#ffe600" fill="#ffe60033" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="muted">No quality history available yet.</p>}
          </article>

          <article className="glass-card glass quality-card chart-card--roomy-mobile">
            <div className="card-heading-row"><h3>Confidence mix</h3><HelpPopover title="Confidence mix" shows="Evidence confidence labels in the active scope." source="/api/quality/latest aggregate confidence_mix or project confidence." reading="More medium/high confidence means the trend is more trustworthy." improve="Increase sample size, reduce stale reports, and keep report scope comparable." /></div>
            {confidenceData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart><Pie data={confidenceData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={96}>{confidenceData.map((_, idx) => <Cell key={idx} fill={['#00f5ff', '#9d7bff', '#ffe600', '#ff3864'][idx % 4]} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            ) : <p className="muted">No confidence data.</p>}
          </article>

          <article className="glass-card glass quality-card">
            <div className="card-heading-row"><h3>Included reports</h3><HelpPopover title="Included reports" shows="Which reports contribute to the active scope." source="/api/quality/latest included_projects." reading="All projects should include non-smoke reports only; selected project should show one report." improve="Refresh stale project PDQ reports or select a specific project for detail." /></div>
            <div className="quality-list">
              {(included.length ? included : latest ? [{ project: latest.project, trace_gaps: latest.trace_gaps, critical_missing_operators: latest.critical_missing_operators, confidence: latest.confidence, generated_at: latest.generated_at }] : []).slice(0, 8).map((item) => (
                <div className="quality-list-row" key={`${item.project}-${item.generated_at || ''}`}>
                  <strong>{item.project}</strong>
                  <span>{item.trace_gaps} gaps · {item.critical_missing_operators} critical</span>
                  <span className="muted">{item.confidence || 'unknown'} · {ageLabel(item.generated_at)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-card glass quality-card">
            <div className="card-heading-row"><h3>Operator gaps</h3><HelpPopover title="Operator gap bars" shows="Which operator event types are missing most often." source="Latest PDQ operator trace findings." reading="Repeated missing operator types point to instrumentation debt." improve="Add or repair event emission for the repeated missing operator type." /></div>
            {latest && Object.keys(latest.trace.by_operator || {}).length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={Object.entries(latest.trace.by_operator).map(([operator, count]) => ({ operator, count }))} layout="vertical" margin={{ left: 24, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(34,255,225,0.12)" />
                  <XAxis type="number" stroke="#8ad7ff" allowDecimals={false} />
                  <YAxis type="category" dataKey="operator" width={112} stroke="#8ad7ff" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#9d7bff" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="muted">No operator gaps.</p>}
          </article>
        </>
      ) : null}
    </section>
  );
}

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
});
