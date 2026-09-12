import type { ReactNode } from 'react';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import { AlertTriangle, Bot, Coins, FileStack, GitBranch, Radio, ShieldAlert, Sparkles } from 'lucide-react';
import { GlassPanel } from '../components/ui/glass-panel';
import { readIncludeTestProjectsFromSearch, readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { LoadingIndicator } from '../components/ui/loading-indicator';
import { MetricTile } from '../components/ui/metric-tile';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';
import { RuntimeDecisionPanel } from '../components/runtime-decision-panel';

type SummaryPayload = {
  projects: number;
  pipeline_runs: string;
  pipeline_runs_started: number;
  pipeline_runs_completed: number;
  pipeline_evidence_basis?: 'recorded_pipeline_events';
  pipeline_events: number;
  agent_runs: number;
  secondary_artifacts: number;
  merge_artifacts: number;
  malformed_secondary: number;
  estimated_cost: number | null;
  by_model: Array<{ model: string; count: number }>;
  by_agent: Array<{ agent: string; count: number }>;
  by_mode: Array<{ project_mode: string; count: number }>;
};

function DashboardOverviewPage() {
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const includeTestProjects = readIncludeTestProjectsFromSearch(location.search);
  const summaryQuery = useDashboardQuery<SummaryPayload>(['summary', project, includeTestProjects], withProjectParam('/api/summary', project, includeTestProjects));
  const data = !summaryQuery.isError && summaryQuery.data?.pipeline_evidence_basis === 'recorded_pipeline_events' ? summaryQuery.data : null;
  const isLoading = summaryQuery.isLoading;

  const cards: Array<{ label: string; value: string; subtitle?: string; icon: ReactNode }> = data
    ? [
        {
          label: 'Recorded Pipeline Identities',
          value: data.pipeline_runs,
          subtitle: `${data.pipeline_runs_started} opened · ${data.pipeline_runs_completed} recorded successes (not live readiness)`,
          icon: <GitBranch size={18} />,
        },
        { label: 'Agent Runs', value: String(data.agent_runs), subtitle: 'specialist executions', icon: <Bot size={18} /> },
        { label: 'Estimated Cost', value: data.estimated_cost == null ? '—' : `$${data.estimated_cost}`, subtitle: 'reported spend', icon: <Coins size={18} /> },
        { label: 'Pipeline Events', value: String(data.pipeline_events), subtitle: 'orchestrator trace events', icon: <Radio size={18} /> },
        { label: 'Secondary Artifacts', value: String(data.secondary_artifacts), subtitle: 'parallel-lane outputs', icon: <FileStack size={18} /> },
        { label: 'Malformed Secondary', value: String(data.malformed_secondary), subtitle: 'needs cleanup/review', icon: <AlertTriangle size={18} /> },
      ]
    : [];

  return (
    <section className="grid overview-grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card overview-hero" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Overview</h2>
        <p className="muted">KPI landing for pipeline, quality, and token metrics.</p>
      </GlassPanel>

      <RuntimeDecisionPanel />

      {summaryQuery.isError ? <p role="alert">Kennzahlen nicht verfügbar. Keine erfolgreichen Abschlüsse aus fehlenden Daten ableiten.</p> : null}
      <p className="muted" style={{ gridColumn: '1 / -1' }}>Pipeline-Zähler basieren auf expliziten Opening-/Terminal-Ereignissen der importierten Historie, nicht auf Agentenverdikten. Kein frischer Closeout-, Installations- oder Betriebsnachweis.</p>
      {isLoading ? (
        <LoadingIndicator label="Loading overview…" />
      ) : (
        <>
          {cards.map(({ label, value, subtitle, icon }) => (
            <MetricTile key={label} title={label} value={value} subtitle={subtitle} icon={icon} />
          ))}
          <MetricTile
            title="Top Model"
            value={data?.by_model?.[0]?.model || '—'}
            subtitle={data?.by_model?.[0]?.count ? `${data.by_model[0].count} runs` : 'no model data'}
            icon={<Sparkles size={18} />}
          />
          <MetricTile
            title="Top Agent"
            value={data?.by_agent?.[0]?.agent || '—'}
            subtitle={data?.by_agent?.[0]?.count ? `${data.by_agent[0].count} runs` : 'no agent data'}
            icon={<ShieldAlert size={18} />}
          />
          <MetricTile
            title="Top Mode"
            value={data?.by_mode?.[0]?.project_mode || '—'}
            subtitle={data?.by_mode?.[0]?.count ? `${data.by_mode[0].count} runs` : 'no mode telemetry'}
            icon={<GitBranch size={18} />}
          />
        </>
      )}
    </section>
  );
}

export const Route = createFileRoute('/overview')({
  component: DashboardOverviewPage,
});
