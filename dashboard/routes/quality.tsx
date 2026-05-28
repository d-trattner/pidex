import { createFileRoute, useLocation } from '@tanstack/react-router';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { HelpPopover } from '../components/ui/help-popover';
import { LoadingIndicator } from '../components/ui/loading-indicator';
import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type CompletionRow = {
  day?: string | null;
  started?: number | string | null;
  completed?: number | string | null;
  completion_rate?: number | string | null;
};

type RuntimeRow = {
  agent?: string | null;
  avg_ms?: number | string | null;
  max_ms?: number | string | null;
  count?: number | string | null;
};

type MergeRow = {
  disposition?: string | null;
  count?: number | string | null;
};

type SecondaryHealthRow = {
  model?: string | null;
  total?: number | string | null;
  clean?: number | string | null;
  malformed?: number | string | null;
};

type ModelQualityRow = {
  model?: string | null;
  raw_model?: string | null;
  total_runs?: number | string | null;
  quality_score?: number | string | null;
  success_rate?: number | string | null;
  continuation_rate?: number | string | null;
  rejection_rate?: number | string | null;
  sigterm_rate?: number | string | null;
  avg_tokens?: number | string | null;
  avg_cost?: number | string | null;
  total_cost?: number | string | null;
};

type QualityPayload = {
  completionByDay: CompletionRow[];
  runtimeByAgent: RuntimeRow[];
  secondaryHealth: SecondaryHealthRow[];
  mergeDisposition: MergeRow[];
  mergeClassification: Array<{ classification?: string | null; count?: number | string | null }>;
  agentVerdicts: Array<{ agent?: string | null; verdict?: string | null; count?: number | string | null }>;
  malformedByDay: Array<{ day?: string | null; malformed?: number | string | null }>;
  g9ByDay: Array<{ day?: string | null; g9_events?: number | string | null; g9_rejections?: number | string | null }>;
  gatesByPipeline: Array<{ project?: string | null; plan_key?: string | null; gates?: number | string | null; failures?: number | string | null; total_runtime_ms?: number | string | null; cost_usd?: number | string | null }>;
  reworkByPipeline: Array<{ project?: string | null; plan_key?: string | null; agent_runs?: number | string | null; gates?: number | string | null; failures?: number | string | null; total_runtime_ms?: number | string | null; cost_usd?: number | string | null }>;
  plannerRevisionsByPlan: Array<{ project?: string | null; plan_key?: string | null; planner_runs?: number | string | null }>;
  analystVerdicts: unknown;
  qualityImpactByDay: unknown[];
  infraMarkers: Record<string, unknown>;
};

type ModelQualityPayload = {
  models: ModelQualityRow[];
};

type QualityReadModelSummary = {
  project: string;
  project_path: string;
  generated_at: string | null;
  confidence: string | null;
  plans: string[];
  trace_gaps: number;
  critical_missing_operators: number;
  trace: {
    by_type: Record<string, number>;
    by_operator: Record<string, number>;
    by_severity: Record<string, number>;
    findings: Array<{ type: string; operator_type: string; plan_key: string; severity: string; confidence: string; reason: string; evidence: string | null }>;
  };
  rule_impact: Array<{
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
  }>;
  regression_detectors: Array<{ dimension?: string; severity?: string; confidence?: string; count?: number; reason?: string }>;
  comparability: { label?: string; sample_size?: number; reasons?: string[]; topologies?: string[] } | null;
  latest_report: { json: string; markdown: string | null } | null;
  review_state: { reviewed_plans_count: number; last_review_at: string | null };
  scope?: 'project' | 'aggregate';
  included_projects?: Array<{ project: string; generated_at: string | null; trace_gaps: number; critical_missing_operators: number; confidence: string | null }>;
  confidence_mix?: Record<string, number>;
  stale_projects?: Array<{ project: string; generated_at: string | null; age_hours: number | null }>;
};

type QualityLatestPayload = {
  ok: boolean;
  latest: QualityReadModelSummary | null;
};

const EMPTY_QUALITY: QualityPayload = {
  completionByDay: [],
  runtimeByAgent: [],
  secondaryHealth: [],
  mergeDisposition: [],
  mergeClassification: [],
  agentVerdicts: [],
  malformedByDay: [],
  g9ByDay: [],
  gatesByPipeline: [],
  reworkByPipeline: [],
  plannerRevisionsByPlan: [],
  analystVerdicts: [],
  qualityImpactByDay: [],
  infraMarkers: {},
};

function QualityPage() {
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const qualityQuery = useDashboardQuery<QualityPayload>(['quality-chart', project], withProjectParam('/api/charts/quality', project));
  const modelQuery = useDashboardQuery<ModelQualityPayload>(['model-quality', project], withProjectParam('/api/charts/model-quality', project));
  const qualityLatestQuery = useDashboardQuery<QualityLatestPayload>(['quality-latest-read-model', project], withProjectParam('/api/quality/latest', project));
  const quality = qualityQuery.data ?? EMPTY_QUALITY;
  const modelQuality = modelQuery.data ?? { models: [] };
  const latestQuality = qualityLatestQuery.data?.latest ?? null;
  const scopeLabel = project || 'All projects';
  const scopeDescription = project ? `${project} · latest project PDQ report` : 'All projects · aggregate across non-smoke latest reports';
  const loading = qualityQuery.isLoading || modelQuery.isLoading || qualityLatestQuery.isLoading;
  const error = qualityQuery.isError || modelQuery.isError || qualityLatestQuery.isError ? 'Quality data could not be loaded.' : '';

  const safeNumber = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };


  const completionData = (quality?.completionByDay || [])
    .map((row) => ({
      day: row.day || '—',
      started: safeNumber(row.started),
      completed: safeNumber(row.completed),
      completion_rate: safeNumber(row.completion_rate),
    }))
    .filter((row) => row.day !== '—');

  const runtimeData = (quality?.runtimeByAgent || [])
    .slice()
    .sort((a, b) => {
      const av = safeNumber(a.avg_ms);
      const bv = safeNumber(b.avg_ms);
      return bv - av;
    })
    .slice(0, 8)
    .map((row) => ({
      agent: row.agent || 'unknown',
      avg_ms: safeNumber(row.avg_ms),
      max_ms: safeNumber(row.max_ms),
      runs: safeNumber(row.count),
    }));

  const modelBars = (modelQuality?.models || [])
    .slice()
    .sort((a, b) => safeNumber(b.quality_score) - safeNumber(a.quality_score))
    .slice(0, 8)
    .map((row) => ({
      model: row.raw_model || row.model || 'unknown',
      quality_score: safeNumber(row.quality_score),
      avg_tokens: safeNumber(row.avg_tokens),
      avg_cost: safeNumber(row.avg_cost),
      success_rate: safeNumber(row.success_rate),
      total_runs: safeNumber(row.total_runs),
    }));

  const cleanSecondary = (quality?.secondaryHealth || []).reduce((sum, row) => sum + safeNumber(row.clean), 0);
  const malformedSecondary = (quality?.secondaryHealth || []).reduce((sum, row) => sum + safeNumber(row.malformed), 0);
  const totalSecondary = (quality?.secondaryHealth || []).reduce((sum, row) => sum + safeNumber(row.total), 0);
  const pieData =
    totalSecondary > 0
      ? [
          { name: 'Clean', value: cleanSecondary },
          { name: 'Malformed', value: malformedSecondary },
        ]
      : [];

  const latest = completionData.at(-1);
  const latestCompletion = latest ? `${safeNumber(latest.completion_rate).toFixed(1)}%` : '—';
  const palette = ['#00f5ff', '#9d7bff', '#ffcc66', '#ff6b9d', '#66ff99', '#ff8a4c'];
  const qualityState = !latestQuality
    ? { label: 'unknown', tone: 'warn', next: 'Generate a PDQ report for this scope.' }
    : latestQuality.critical_missing_operators > 0
      ? { label: 'needs attention', tone: 'bad', next: 'Fix critical missing operator evidence, then refresh PDQ.' }
      : latestQuality.trace_gaps > 0
        ? { label: 'instrumentation debt', tone: 'warn', next: 'Repair repeated trace gaps and validate on the next real pipeline.' }
        : latestQuality.plans.length < 6
          ? { label: 'clean, low sample', tone: 'warn', next: 'Run more comparable pipelines before trusting trend direction.' }
          : { label: 'clean', tone: 'good', next: 'Keep monitoring trend and refresh stale reports.' };
  const traceTypeData = latestQuality
    ? Object.entries(latestQuality.trace.by_type).map(([name, value]) => ({ name, value: safeNumber(value) }))
    : [];
  const severityData = latestQuality
    ? Object.entries(latestQuality.trace.by_severity).map(([severity, count]) => ({ severity, count: safeNumber(count) }))
    : [];
  const operatorGapData = latestQuality
    ? Object.entries(latestQuality.trace.by_operator)
        .map(([operator, count]) => ({ operator, count: safeNumber(count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
    : [];
  const ruleImpactData = latestQuality
    ? Object.entries(
        latestQuality.rule_impact.reduce<Record<string, number>>((acc, item) => {
          acc[item.label] = (acc[item.label] || 0) + 1;
          return acc;
        }, {}),
      ).map(([label, count]) => ({ label, count }))
    : [];

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <div className="card-heading-row">
          <div>
            <h2 className="h2">Quality</h2>
            <p className="muted">Scope: <strong>{scopeDescription}</strong>. Quality signals stay here; usage/cost/quota stay in Usage.</p>
          </div>
          <HelpPopover
            title="Quality page scope"
            shows="Quality metrics for the active global project selector. All projects aggregates non-smoke reports; one selected project shows only that project."
            source="Global project selector plus /api/quality/latest, /api/charts/quality, and /api/charts/model-quality."
            reading="Start with trend, current state, top issue, and next action before reading detailed tables."
            improve="Select the right scope, refresh PDQ for stale reports, and reduce critical gaps before optimizing lower-severity signals."
            caveats="Aggregate mode is not a project comparison table; it summarizes the selected scope."
          />
        </div>
        {error ? <p style={{ color: '#f8a' }}>{error}</p> : null}
      </article>

      {loading ? <LoadingIndicator label="Loading quality metrics…" /> : null}
      {loading ? null : (
        <>

      <article className="glass-card glass quality-card quality-card-full">
        <div className="card-heading-row">
          <div>
            <h3>Quality trajectory</h3>
            <p className="muted">Current state for {scopeLabel}: <strong className={`metric-${qualityState.tone}`}>{qualityState.label}</strong>. Next action: {qualityState.next}</p>
          </div>
          <HelpPopover
            title="Quality trajectory"
            shows="The top-level quality state and next recommended operator action for the selected scope."
            source="Latest PDQ read model from /api/quality/latest."
            reading="Critical missing operators outrank trace gaps. Low samples are labelled as weak evidence rather than success."
            improve="Fix critical gaps, repair repeated trace instrumentation debt, and run comparable pipelines."
            caveats="This avoids a fake single quality score and does not claim causality."
          />
        </div>
      </article>

      <article className="glass-card glass quality-card quality-card-full">
        <div className="card-heading-row">
          <div>
            <h3>Self-improvement quality overview</h3>
            <p className="muted">Latest PDQ read model. This does not recompute reports on page load.</p>
          </div>
          <HelpPopover
            title="PDQ read model"
            shows="The compact quality facts extracted from existing PDQ JSON reports."
            source="/api/quality/latest reading state/quality/*.json."
            reading="Use confidence, trace gaps, critical missing, regressions, and comparability together."
            improve="Generate fresh PDQ reports after real pipelines and fix repeated operator gaps."
            caveats="Ordinary page loads never recompute PDQ."
          />
        </div>
        {latestQuality ? (
          <>
            <div className="grid quality-metrics-grid" style={{ gap: 12 }}>
              <div className="glass-card glass quality-metric-card">
                <p className="muted">Confidence</p>
                <p className="metric-value">{latestQuality.confidence || '—'}</p>
              </div>
              <div className="glass-card glass quality-metric-card">
                <p className="muted">Plans reviewed</p>
                <p className="metric-value">{latestQuality.plans.length}</p>
              </div>
              <div className="glass-card glass quality-metric-card">
                <p className="muted">Trace gaps</p>
                <p className="metric-value">{latestQuality.trace_gaps}</p>
              </div>
              <div className="glass-card glass quality-metric-card">
                <p className="muted">Critical missing</p>
                <p className="metric-value">{latestQuality.critical_missing_operators}</p>
              </div>
              <div className="glass-card glass quality-metric-card">
                <p className="muted">Regressions</p>
                <p className="metric-value">{latestQuality.regression_detectors.length}</p>
              </div>
              <div className="glass-card glass quality-metric-card">
                <p className="muted">Comparability</p>
                <p className="metric-value">{latestQuality.comparability?.label || '—'}</p>
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
              <div className="glass-card glass">
                <div className="card-heading-row"><h4>Trace gap mix</h4><HelpPopover title="Trace gap mix" shows="Counts by trace gap type." source="PDQ operator_trace.findings." reading="Instrumentation gaps mean PIDEX probably did work but did not observe the expected event." improve="Add or repair instrumentation for the missing event class." /></div>
                {traceTypeData.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={traceTypeData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={3}>
                        {traceTypeData.map((_, index) => <Cell key={`trace-${index}`} fill={palette[index % palette.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="muted">No trace gaps</p>}
              </div>
              <div className="glass-card glass">
                <div className="card-heading-row"><h4>Operator gaps</h4><HelpPopover title="Operator gaps" shows="Which operator event types are missing most often." source="PDQ operator trace findings." reading="Repeated operators indicate where the pipeline instrumentation is weakest." improve="Fix the most repeated operator event emitter first." /></div>
                {operatorGapData.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={operatorGapData} layout="vertical" margin={{ left: 24, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid stroke="rgba(34,255,225,0.12)" />
                      <XAxis type="number" stroke="#8ad7ff" />
                      <YAxis type="category" dataKey="operator" stroke="#8ad7ff" width={104} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#9d7bff" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="muted">No operator gaps</p>}
              </div>
              <div className="glass-card glass">
                <div className="card-heading-row"><h4>Rule impact labels</h4><HelpPopover title="Rule impact labels" shows="Directional labels for approved rule-action before/after windows." source="PDQ rule action windows and rule-action ledger." reading="Labels are proxies such as insufficient-data or directionally-improving, not causal proof." improve="Record approved rule actions and gather comparable before/after samples." /></div>
                {ruleImpactData.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ruleImpactData} margin={{ left: 4, right: 8, top: 8, bottom: 36 }}>
                      <CartesianGrid stroke="rgba(34,255,225,0.12)" />
                      <XAxis dataKey="label" stroke="#8ad7ff" angle={-20} textAnchor="end" interval={0} height={56} />
                      <YAxis stroke="#8ad7ff" allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#66ff99" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="muted">No rule impact windows</p>}
              </div>
              <div className="glass-card glass">
                <div className="card-heading-row"><h4>Severity</h4><HelpPopover title="Severity" shows="Trace findings grouped by severity." source="PDQ operator trace findings." reading="Critical/high should be fixed before low instrumentation debt." improve="Prioritize critical findings, then repeated low-severity gaps." /></div>
                {severityData.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={severityData} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid stroke="rgba(34,255,225,0.12)" />
                      <XAxis dataKey="severity" stroke="#8ad7ff" />
                      <YAxis stroke="#8ad7ff" allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#ffcc66" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="muted">No severity findings</p>}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <h4>Latest report</h4>
              <p className="muted">{latestQuality.generated_at || '—'} · {latestQuality.latest_report?.markdown || latestQuality.latest_report?.json || 'No report path'}</p>
            </div>
            {latestQuality.regression_detectors.length ? (
              <div style={{ marginTop: 12 }}>
                <h4>Regression detectors</h4>
                <ul>
                  {latestQuality.regression_detectors.slice(0, 5).map((item, idx) => (
                    <li key={`${item.dimension || 'regression'}-${idx}`}>
                      <span>{item.dimension || 'unknown'} · {item.severity || 'unknown'} · {item.confidence || 'unknown'}</span>
                      {item.reason ? <span className="muted"> — {item.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div style={{ marginTop: 16 }}>
              <h4>Rule impact</h4>
              <p className="muted">Before/after windows are directional proxies only; labels avoid causal claims.</p>
              {latestQuality.rule_impact.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Rule</th>
                        <th>Action</th>
                        <th>Dimension</th>
                        <th>Before / after</th>
                        <th>Result</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestQuality.rule_impact.slice(0, 8).map((item, idx) => (
                        <tr key={`${item.rule_path}-${idx}`}>
                          <td style={{ maxWidth: 360, wordBreak: 'break-all' }}>{item.rule_path}</td>
                          <td>{item.action}</td>
                          <td>{item.expected_impact_dimension}</td>
                          <td>{item.before_count} / {item.after_count}</td>
                          <td>{item.label}</td>
                          <td>{item.confidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No rule impact windows in the latest report.</p>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="card-heading-row"><h4>Trace gap findings</h4><HelpPopover title="Trace gap findings" shows="Detailed missing/unobserved operator evidence rows." source="PDQ operator trace findings." reading="Group by operator first; repeated reasons usually indicate one instrumentation fix." improve="Record finalized preflight, restore quality-review events, or add explicit skip events depending on the reason." /></div>
              {latestQuality.trace.findings.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Plan</th>
                        <th>Operator</th>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Confidence</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestQuality.trace.findings.slice(0, 12).map((item, idx) => (
                        <tr key={`${item.plan_key}-${item.operator_type}-${idx}`}>
                          <td>{item.plan_key}</td>
                          <td>{item.operator_type}</td>
                          <td>{item.type}</td>
                          <td>{item.severity}</td>
                          <td>{item.confidence}</td>
                          <td style={{ minWidth: 320 }}>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No trace gap findings in the latest report.</p>
              )}
            </div>
          </>
        ) : (
          <p className="muted">No PDQ report has been generated yet.</p>
        )}
      </article>

      <article className="glass-card glass quality-card quality-card-full">
        <h3>Completion rate</h3>
        <p className="muted">Latest completion rate: {latestCompletion}</p>
        {completionData.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={completionData} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(34,255,225,0.16)" />
              <XAxis dataKey="day" stroke="#8ad7ff" />
              <YAxis stroke="#8ad7ff" />
              <Tooltip />
              <Area type="monotone" dataKey="completion_rate" stroke="#00f5ff" fill="#00f5ff55" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">No completion data available yet.</p>
        )}
      </article>

      <article className="glass-card glass quality-card quality-card-full">
        <h3>Agent runtime</h3>
        <p className="muted">Average runtime by agent (ms).</p>
        {runtimeData.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={runtimeData} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(34,255,225,0.16)" />
              <XAxis dataKey="agent" stroke="#8ad7ff" />
              <YAxis stroke="#8ad7ff" />
              <Tooltip />
              <Line type="monotone" dataKey="avg_ms" stroke="#ffe600" activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="max_ms" stroke="#ff3864" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">No runtime data available yet.</p>
        )}
      </article>

      <article className="glass-card glass quality-card quality-card-full">
        <h3>Top models</h3>
        <p className="muted">Quality score by model (significant models only).</p>
        {modelBars.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={modelBars} margin={{ left: 4, right: 4, top: 8, bottom: 32 }}>
              <CartesianGrid stroke="rgba(34,255,225,0.16)" />
              <XAxis dataKey="model" stroke="#8ad7ff" angle={-30} textAnchor="end" interval={0} height={45} />
              <YAxis stroke="#8ad7ff" />
              <Tooltip />
              <Bar dataKey="quality_score" fill="#00f5ff" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">No model quality data available yet.</p>
        )}
      </article>

      <article className="glass-card glass quality-card">
        <h3>Secondary Health (Pie)</h3>
        <p className="muted">Clean vs malformed in secondary artifacts.</p>
        {pieData.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Tooltip />
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={78}
                dataKey="value"
                label
              >
                {pieData.map((entry, idx) => (
                  <Cell key={`${entry.name}-${idx}`} fill={idx === 0 ? '#00ff85' : '#ff3864'} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">No secondary data available yet.</p>
        )}
      </article>

      <article className="glass-card glass quality-card">
        <h3>Cards</h3>
        <div className="grid quality-metrics-grid" style={{ gap: 12 }}>
          <div className="glass-card glass quality-metric-card">
            <p className="muted">Models in report</p>
            <p className="metric-value">{(modelQuality?.models || []).length}</p>
          </div>
          <div className="glass-card glass quality-metric-card">
            <p className="muted">Secondary models</p>
            <p className="metric-value">{totalSecondary}</p>
          </div>
          <div className="glass-card glass quality-metric-card">
            <p className="muted">Secondary clean samples</p>
            <p className="metric-value">{cleanSecondary}</p>
          </div>
          <div className="glass-card glass quality-metric-card">
            <p className="muted">Secondary error rate</p>
            <p className="metric-value">{totalSecondary ? `${((malformedSecondary / totalSecondary) * 100).toFixed(1)}%` : '—'}</p>
          </div>
        </div>
      </article>

      <article className="glass-card glass quality-card">
        <h3>Malformed routing trend</h3>
        <p className="muted">Daily malformed secondary artifacts.</p>
        {(quality?.malformedByDay || []).length === 0 ? <p className="muted">No malformed trend data.</p> : <p>{(quality?.malformedByDay || []).map((row) => `${row.day || '—'}: ${safeNumber(row.malformed)}`).join(' · ')}</p>}
      </article>

      <article className="glass-card glass quality-card">
        <h3>G9 events / rejections</h3>
        {(quality?.g9ByDay || []).length === 0 ? <p className="muted">No G9 trend data.</p> : <p>{(quality?.g9ByDay || []).map((row) => `${row.day || '—'}: ${safeNumber(row.g9_events)}/${safeNumber(row.g9_rejections)}`).join(' · ')}</p>}
      </article>

      <article className="glass-card glass quality-card">
        <h3>Merge disposition</h3>
        {(quality?.mergeDisposition || []).length === 0 ? <p className="muted">No merge disposition data.</p> : <p>{(quality?.mergeDisposition || []).map((row) => `${row.disposition || 'unknown'}: ${safeNumber(row.count)}`).join(' · ')}</p>}
      </article>

      <article className="glass-card glass quality-card">
        <h3>Merge classification</h3>
        {(quality?.mergeClassification || []).length === 0 ? <p className="muted">No merge classification data.</p> : <p>{(quality?.mergeClassification || []).map((row) => `${row.classification || 'unknown'}: ${safeNumber(row.count)}`).join(' · ')}</p>}
      </article>

      {error ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p style={{ color: '#f8a', margin: 0 }}>
            Note: Some fields may be missing in this DB view (stable API paths preserved). Showing safe fallback view.
          </p>
        </article>
      ) : null}
        </>
      )}
    </section>
  );
}

export const Route = createFileRoute('/quality')({
  component: QualityPage,
});
