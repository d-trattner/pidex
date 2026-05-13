import { createFileRoute, useLocation } from '@tanstack/react-router';

type PipelineRow = {
  completed_at: unknown;
  project: unknown;
  plan_key: unknown;
  agent_runs: unknown;
  distinct_agents: unknown;
  wall_runtime_ms: unknown;
  total_runtime_ms: unknown;
  input_tokens: unknown;
  output_tokens: unknown;
  cost_usd: unknown;
  gates: unknown;
  failures: unknown;
};

function formatText(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return '—';
  const text = String(value).trim();
  return text.length > 0 ? text : '—';
}

function formatDate(value: unknown): string {
  const text = formatText(value);
  if (text === '—') return text;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return text;
  return dt.toLocaleString();
}

function formatNumber(value: unknown): string {
  if (typeof value === 'object' || typeof value === 'symbol') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return '—';
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return n.toLocaleString();
}

import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

function PipelinesPage() {
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const query = useDashboardQuery<PipelineRow[]>(['pipelines', project], withProjectParam('/api/pipelines', project));
  const rows = Array.isArray(query.data) ? query.data : [];
  const loading = query.isLoading;
  const error = query.isError ? 'Pipelines could not be loaded.' : '';

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Pipelines</h2>
        <p className="muted">Completed pipeline runs with runtime, tokens, and gate status.</p>
      </article>

      {loading ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p className="muted">Loading pipelines…</p>
        </article>
      ) : (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <div className="table-scroll">
          <table className="table" aria-label="pipelines table">
            <thead>
              <tr>
                <th>completed_at</th>
                <th>project</th>
                <th>plan_key</th>
                <th>agent_runs</th>
                <th>distinct_agents</th>
                <th>wall_runtime_ms</th>
                <th>agent_runtime_ms</th>
                <th>input_tokens</th>
                <th>output_tokens</th>
                <th>cost_usd</th>
                <th>gates</th>
                <th>failures</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${formatText(row.completed_at)}-${formatText(row.project)}-${formatText(row.plan_key)}-${index}`}>
                  <td>{formatDate(row.completed_at)}</td>
                  <td>{formatText(row.project)}</td>
                  <td>{formatText(row.plan_key)}</td>
                  <td>{formatNumber(row.agent_runs)}</td>
                  <td>{formatNumber(row.distinct_agents)}</td>
                  <td>{formatNumber(row.wall_runtime_ms)}</td>
                  <td>{formatNumber(row.total_runtime_ms)}</td>
                  <td>{formatNumber(row.input_tokens)}</td>
                  <td>{formatNumber(row.output_tokens)}</td>
                  <td>{formatNumber(row.cost_usd)}</td>
                  <td>{formatNumber(row.gates)}</td>
                  <td>{formatNumber(row.failures)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12}>No pipeline entries found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
          {error ? <p style={{ color: '#f8a', marginTop: 12 }}>{error}</p> : null}
        </article>
      )}
    </section>
  );
}

export const Route = createFileRoute('/pipelines')({
  component: PipelinesPage,
});