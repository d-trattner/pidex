import { useEffect, useState } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { GlassPanel } from '../components/ui/glass-panel';
import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { MetricTile } from '../components/ui/metric-tile';

type SummaryPayload = {
  projects: number;
  pipeline_runs: string;
  pipeline_runs_started: number;
  pipeline_runs_completed: number;
  pipeline_events: number;
  agent_runs: number;
  secondary_artifacts: number;
  merge_artifacts: number;
  malformed_secondary: number;
  estimated_cost: number | null;
  by_model: Array<{ model: string; count: number }>;
  by_agent: Array<{ agent: string; count: number }>;
};

function DashboardOverviewPage() {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [isLoading, setLoading] = useState(true);
  const location = useLocation();
  const project = readProjectFromSearch(location.search);

  useEffect(() => {
    let mounted = true;
    fetch(withProjectParam('/api/summary', project))
      .then((res) => res.json())
      .then((payload) => {
        if (!mounted) return;
        if (payload && typeof payload === 'object' && 'projects' in payload && 'agent_runs' in payload) {
          setData(payload as SummaryPayload);
        }
      })
      .catch(() => {
        setData(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [project]);

  const cards: Array<{ label: string; value: string }> = data
    ? [
        { label: 'Pipeline Runs', value: data.pipeline_runs },
        { label: 'Agent Runs', value: String(data.agent_runs) },
        { label: 'Estimated Cost', value: data.estimated_cost == null ? '—' : `$${data.estimated_cost}` },
        { label: 'Secondary Artifacts', value: String(data.secondary_artifacts) },
        { label: 'Malformed Secondary', value: String(data.malformed_secondary) },
        { label: 'Pipeline Events', value: String(data.pipeline_events) },
      ]
    : [];

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Overview</h2>
        <p className="muted">KPI landing for pipeline, quality, and token metrics.</p>
      </GlassPanel>

      {isLoading ? (
        <p className="muted">Loading metrics…</p>
      ) : (
        <>
          {cards.map(({ label, value }) => (
            <MetricTile key={label} title={label} value={value} />
          ))}
          <MetricTile
            title="Top Model"
            value={data?.by_model?.[0]?.model || '—'}
            subtitle={data?.by_model?.[0]?.count ? `${data.by_model[0].count} runs` : 'no model data'}
          />
          <MetricTile
            title="Top Agent"
            value={data?.by_agent?.[0]?.agent || '—'}
            subtitle={data?.by_agent?.[0]?.count ? `${data.by_agent[0].count} runs` : 'no agent data'}
          />
        </>
      )}
    </section>
  );
}

export const Route = createFileRoute('/overview')({
  component: DashboardOverviewPage,
});
