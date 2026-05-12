import { useEffect, useState } from 'react';

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

import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';

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

function QualityPage() {
  const [quality, setQuality] = useState<QualityPayload | null>(null);
  const [modelQuality, setModelQuality] = useState<ModelQualityPayload | null>(null);
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const safeNumber = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  useEffect(() => {
    let mounted = true;

    const pickArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

    Promise.all([
      fetch(withProjectParam('/api/charts/quality', project)),
      fetch(withProjectParam('/api/charts/model-quality', project)),
    ])
      .then(async ([qualityResp, modelResp]) => {
        if (!qualityResp.ok || !modelResp.ok) {
          throw new Error('A quality API did not respond correctly.');
        }

        const [qualityPayloadRaw, modelPayloadRaw] = await Promise.all([qualityResp.json(), modelResp.json()]);

        if (!mounted) return;

        const rawQuality =
          qualityPayloadRaw && typeof qualityPayloadRaw === 'object' && !Array.isArray(qualityPayloadRaw)
            ? (qualityPayloadRaw as Record<string, unknown>)
            : {};
        const rawModel =
          modelPayloadRaw && typeof modelPayloadRaw === 'object' && !Array.isArray(modelPayloadRaw)
            ? (modelPayloadRaw as Record<string, unknown>)
            : {};

        setQuality({
          completionByDay: pickArray<CompletionRow>(rawQuality.completionByDay),
          runtimeByAgent: pickArray<RuntimeRow>(rawQuality.runtimeByAgent),
          secondaryHealth: pickArray<SecondaryHealthRow>(rawQuality.secondaryHealth),
          mergeDisposition: pickArray<MergeRow>(rawQuality.mergeDisposition),
          mergeClassification: pickArray<{
            classification?: string | null;
            count?: number | string | null;
          }>(rawQuality.mergeClassification),
          agentVerdicts: pickArray<{ agent?: string | null; verdict?: string | null; count?: number | string | null }>(rawQuality.agentVerdicts),
          malformedByDay: pickArray<{ day?: string | null; malformed?: number | string | null }>(rawQuality.malformedByDay),
          g9ByDay: pickArray<{ day?: string | null; g9_events?: number | string | null; g9_rejections?: number | string | null }>(rawQuality.g9ByDay),
          gatesByPipeline: pickArray<{
            project?: string | null;
            plan_key?: string | null;
            gates?: number | string | null;
            failures?: number | string | null;
            total_runtime_ms?: number | string | null;
            cost_usd?: number | string | null;
          }>(rawQuality.gatesByPipeline),
          reworkByPipeline: pickArray<{
            project?: string | null;
            plan_key?: string | null;
            agent_runs?: number | string | null;
            gates?: number | string | null;
            failures?: number | string | null;
            total_runtime_ms?: number | string | null;
            cost_usd?: number | string | null;
          }>(rawQuality.reworkByPipeline),
          plannerRevisionsByPlan: pickArray<{
            project?: string | null;
            plan_key?: string | null;
            planner_runs?: number | string | null;
          }>(rawQuality.plannerRevisionsByPlan),
          analystVerdicts: rawQuality.analystVerdicts ?? [],
          qualityImpactByDay: pickArray<unknown>(rawQuality.qualityImpactByDay),
          infraMarkers:
            rawQuality.infraMarkers && typeof rawQuality.infraMarkers === 'object' && !Array.isArray(rawQuality.infraMarkers)
              ? (rawQuality.infraMarkers as Record<string, unknown>)
              : {},
        });

        setModelQuality({
          models: pickArray<ModelQualityRow>(rawModel.models),
        });

        const hasApiIssue =
          !Array.isArray(rawQuality.completionByDay) ||
          !Array.isArray(rawModel.models);
        if (hasApiIssue) {
          setError('Unexpected response format, using fallback view.');
        } else {
          setError('');
        }
      })
      .catch(() => {
        if (!mounted) return;
        setQuality({
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
        });
        setModelQuality({ models: [] });
        setError('Quality data could not be loaded.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [project]);

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

  if (loading) {
    return (
      <section className="grid" style={{ marginTop: 12 }}>
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <h2 className="h2">Quality</h2>
          <p className="muted">Loading quality metrics…</p>
        </article>
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p className="muted">Data loading…</p>
        </article>
      </section>
    );
  }

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Quality</h2>
        <p className="muted">Pipeline, model, and artifact quality with Recharts (Area/Line/Bar/Pie).</p>
        {error ? <p style={{ color: '#f8a' }}>{error}</p> : null}
      </article>

      <article className="glass-card glass quality-card">
        <h3>Completion rate (Area)</h3>
        <p className="muted">Latest completion rate: {latestCompletion}</p>
        {completionData.length ? (
          <ResponsiveContainer width="100%" height={220}>
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

      <article className="glass-card glass quality-card">
        <h3>Agent runtime (Line)</h3>
        <p className="muted">Average runtime by agent (ms).</p>
        {runtimeData.length ? (
          <ResponsiveContainer width="100%" height={220}>
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

      <article className="glass-card glass quality-card">
        <h3>Top models (Bar)</h3>
        <p className="muted">Quality score by model (significant models only).</p>
        {modelBars.length ? (
          <ResponsiveContainer width="100%" height={220}>
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
    </section>
  );
}

export const Route = createFileRoute('/quality')({
  component: QualityPage,
});
