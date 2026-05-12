import { useEffect, useState } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';

import { GlassPanel } from '../components/ui/glass-panel';
import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { MetricTile } from '../components/ui/metric-tile';

type JsonRecord = Record<string, unknown>;

type LiveSummary = {
  running_pipelines?: unknown;
  unresolved_inferred?: unknown;
  pending_gate?: unknown;
  running_agents?: unknown;
};

type LivePayload = {
  generated_at?: unknown;
  summary?: LiveSummary;
  unresolved_inferred?: unknown;
  running_pipelines?: unknown;
  pending_gate?: unknown;
  open_pipelines?: unknown;
  latest_by_agent?: unknown;
  latest_runs?: unknown;
  recent_secondary?: unknown;
  recent?: unknown;
  status_counts?: JsonRecord;
  running_agents?: unknown;
};

type PipelineRow = {
  project?: unknown;
  plan_key?: unknown;
  pipeline_id?: unknown;
  status?: unknown;
  source?: unknown;
  started_at?: unknown;
  last_at?: unknown;
  event_type?: unknown;
  message?: unknown;
  agent_runs?: unknown;
  distinct_agents?: unknown;
  failures?: unknown;
  last_agent?: unknown;
  count?: unknown;
};

type PendingGateRow = {
  project?: unknown;
  plan_key?: unknown;
  gate?: unknown;
  agent?: unknown;
  timestamp?: unknown;
};

type LatestByAgentRow = {
  timestamp?: unknown;
  agent?: unknown;
  project?: unknown;
  plan_key?: unknown;
  provider?: unknown;
  model?: unknown;
  verdict?: unknown;
  route_to?: unknown;
  gate?: unknown;
  duration_ms?: unknown;
  context_file?: unknown;
};

type RunRow = {
  timestamp?: unknown;
  project?: unknown;
  plan_key?: unknown;
  agent?: unknown;
  provider?: unknown;
  model?: unknown;
  verdict?: unknown;
  route_to?: unknown;
  gate?: unknown;
  duration_ms?: unknown;
  exit_code?: unknown;
  context_file?: unknown;
};

type SecondaryRow = {
  mtime?: unknown;
  project?: unknown;
  plan_key?: unknown;
  role?: unknown;
  model_label?: unknown;
  verdict?: unknown;
  route_to?: unknown;
  gate?: unknown;
  has_routing?: unknown;
  path?: unknown;
};

const toArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toText = (value: unknown): string => {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '—';
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toDateText = (value: unknown): string => {
  if (value == null) return '—';
  const text = String(value);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
};

const toOpenPipelines = (payload: LivePayload): PipelineRow[] => {
  const list = toArray<PipelineRow>(payload.open_pipelines);
  if (list.length > 0) return list;

  if (Array.isArray(payload.running_pipelines)) {
    return toArray<JsonRecord>(payload.running_pipelines).map((row) => ({
      project: row.project,
      plan_key: row.plan_key,
      agent_runs: row.count,
      status: 'running',
      source: row.source ?? 'agent_runs',
    }));
  }
  return [];
};

const toLatestByAgent = (payload: LivePayload): LatestByAgentRow[] => {
  const list = toArray<LatestByAgentRow>(payload.latest_by_agent);
  if (list.length > 0) return list;

  const latest = toArray<RunRow>(payload.latest_runs).map((row) => ({
    timestamp: row.timestamp,
    project: row.project,
    plan_key: row.plan_key,
    agent: row.agent,
    provider: row.provider,
    verdict: row.verdict,
    route_to: row.route_to,
    gate: row.gate,
    duration_ms: row.duration_ms,
    model: row.model,
  }));
  return latest.slice(0, 10);
};

const toLatestRuns = (payload: LivePayload): RunRow[] => {
  const list = toArray<RunRow>(payload.latest_runs);
  if (list.length > 0) return list;
  return toArray<RunRow>(payload.recent);
};

const toRecentSecondary = (payload: LivePayload): SecondaryRow[] => {
  const list = toArray<SecondaryRow>(payload.recent_secondary);
  if (list.length > 0) return list;
  return toArray<SecondaryRow>(payload.recent_secondary ?? []);
};

function LivePage() {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(withProjectParam('/api/live', project), { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        const data = await response.json();
        if (!mounted) return;
        if (!data || typeof data !== 'object') {
          setPayload(null);
          setError('Invalid live payload format.');
          return;
        }
        setPayload(data as LivePayload);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (mounted) {
          setPayload(null);
          setError('Live data could not be loaded.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [project]);

  const openPipelines = toOpenPipelines(payload || {});
  const latestByAgent = toLatestByAgent(payload || {});
  const latestRuns = toLatestRuns(payload || {});
  const recentSecondary = toRecentSecondary(payload || {});
  const pendingGate = toArray<PendingGateRow>(payload?.pending_gate);

  const summary = payload?.summary || {};
  const statusCounts = payload?.status_counts || {};

  const runningPipelinesRaw =
    summary.running_pipelines ??
    payload?.running_pipelines ??
    openPipelines.length;

  const unresolvedInferred = summary.unresolved_inferred ?? payload?.unresolved_inferred;
  const pendingGateRaw = summary.pending_gate ?? payload?.pending_gate;

  const runningPipelines = toNumber(runningPipelinesRaw) ?? (typeof runningPipelinesRaw === 'number' ? runningPipelinesRaw : null) ?? openPipelines.length;
  const unresolvedValue = toNumber(unresolvedInferred) ?? (Array.isArray(unresolvedInferred) ? 0 : null);
  const pendingGateValue =
    typeof pendingGateRaw === 'boolean'
      ? (pendingGateRaw ? 'yes' : 'no')
      : Array.isArray(pendingGateRaw)
        ? (pendingGateRaw.length > 0 ? 'yes' : 'no')
        : pendingGateRaw == null
          ? 'no'
          : toText(pendingGateRaw);

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Live</h2>
        <p className="muted">Live overview for active pipelines, running gates, and secondary events.</p>
        <p className="muted">Last updated: {toDateText(payload?.generated_at)}</p>
      </GlassPanel>

      {loading ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p className="muted">Loading live data…</p>
        </article>
      ) : null}

      {error ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p style={{ color: '#f8a' }}>{error}</p>
        </article>
      ) : null}

      {!loading && !error ? (
        <>
          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3>Summary</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <MetricTile title="running_pipelines" value={runningPipelines} />
              <MetricTile title="unresolved_inferred" value={unresolvedValue == null ? '—' : unresolvedValue} />
              <MetricTile title="pending_gate" value={pendingGateValue} />
              <MetricTile title="running_agents" value={toText(summary.running_agents)} />
              {Object.entries(statusCounts).map(([key, value]) => (
                <MetricTile key={key} title={`status: ${key}`} value={toText(value)} />
              ))}
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>Open Pipelines</h3>
            <table className="table" aria-label="open pipelines">
              <thead>
                <tr>
                  <th>project</th>
                  <th>plan_key</th>
                  <th>pipeline_id</th>
                  <th>status</th>
                  <th>source</th>
                  <th>started_at</th>
                  <th>last_at</th>
                  <th>event_type</th>
                  <th>agent_runs</th>
                  <th>distinct_agents</th>
                  <th>failures</th>
                  <th>last_agent</th>
                </tr>
              </thead>
              <tbody>
                {openPipelines.map((row, index) => (
                  <tr key={`${toText(row.project)}-${toText(row.plan_key)}-${index}`}>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.pipeline_id)}</td>
                    <td>{toText(row.status)}</td>
                    <td>{toText(row.source)}</td>
                    <td>{toText(row.started_at)}</td>
                    <td>{toText(row.last_at)}</td>
                    <td>{toText(row.event_type)}</td>
                    <td>{toText(row.agent_runs)}</td>
                    <td>{toText(row.distinct_agents)}</td>
                    <td>{toText(row.failures)}</td>
                    <td>{toText(row.last_agent)}</td>
                  </tr>
                ))}
                {openPipelines.length === 0 ? (
                  <tr>
                    <td colSpan={11}>No open pipelines found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>Latest by Agent</h3>
            <table className="table" aria-label="latest by agent">
              <thead>
                <tr>
                  <th>time</th>
                  <th>agent</th>
                  <th>project</th>
                  <th>plan_key</th>
                  <th>provider</th>
                  <th>model</th>
                  <th>verdict</th>
                  <th>route_to</th>
                  <th>gate</th>
                  <th>runtime_ms</th>
                  <th>context_file</th>
                </tr>
              </thead>
              <tbody>
                {latestByAgent.map((row, index) => (
                  <tr key={`${toText(row.agent)}-${toText(row.timestamp)}-${index}`}>
                    <td>{toDateText(row.timestamp)}</td>
                    <td>{toText(row.agent)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.provider)}</td>
                    <td>{toText(row.model)}</td>
                    <td>{toText(row.verdict)}</td>
                    <td>{toText(row.route_to)}</td>
                    <td>{toText(row.gate)}</td>
                    <td>{toText(row.duration_ms)}</td>
                    <td>{toText(row.context_file)}</td>
                  </tr>
                ))}
                {latestByAgent.length === 0 ? (
                  <tr>
                    <td colSpan={11}>No agent entries found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>Latest Runs</h3>
            <table className="table" aria-label="latest runs">
              <thead>
                <tr>
                  <th>time</th>
                  <th>project</th>
                  <th>plan_key</th>
                  <th>agent</th>
                  <th>provider</th>
                  <th>model</th>
                  <th>verdict</th>
                  <th>route_to</th>
                  <th>gate</th>
                  <th>runtime_ms</th>
                  <th>exit_code</th>
                </tr>
              </thead>
              <tbody>
                {latestRuns.map((row, index) => (
                  <tr key={`${toText(row.timestamp)}-${toText(row.agent)}-${index}`}>
                    <td>{toDateText(row.timestamp)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.agent)}</td>
                    <td>{toText(row.provider)}</td>
                    <td>{toText(row.model)}</td>
                    <td>{toText(row.verdict)}</td>
                    <td>{toText(row.route_to)}</td>
                    <td>{toText(row.gate)}</td>
                    <td>{toText(row.duration_ms)}</td>
                    <td>{toText(row.exit_code)}</td>
                  </tr>
                ))}
                {latestRuns.length === 0 ? (
                  <tr>
                    <td colSpan={11}>No runs in feed.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>Recent Secondary</h3>
            <table className="table" aria-label="recent secondary">
              <thead>
                <tr>
                  <th>time</th>
                  <th>project</th>
                  <th>plan_key</th>
                  <th>role</th>
                  <th>model</th>
                  <th>verdict</th>
                  <th>route_to</th>
                  <th>gate</th>
                  <th>has_routing</th>
                  <th>path</th>
                </tr>
              </thead>
              <tbody>
                {recentSecondary.map((row, index) => (
                  <tr key={`${toText(row.mtime)}-${toText(row.project)}-${index}`}>
                    <td>{toDateText(row.mtime)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.role)}</td>
                    <td>{toText(row.model_label)}</td>
                    <td>{toText(row.verdict)}</td>
                    <td>{toText(row.route_to)}</td>
                    <td>{toText(row.gate)}</td>
                    <td>{toText(row.has_routing)}</td>
                    <td>{toText(row.path)}</td>
                  </tr>
                ))}
                {recentSecondary.length === 0 ? (
                  <tr>
                    <td colSpan={10}>No recent_secondary entries.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>Pending Gate</h3>
            <table className="table" aria-label="pending gate">
              <thead>
                <tr>
                  <th>project</th>
                  <th>plan_key</th>
                  <th>gate</th>
                  <th>agent</th>
                  <th>time</th>
                </tr>
              </thead>
              <tbody>
                {pendingGate.map((item, index) => (
                  <tr key={`${toText(item.project)}-${toText(item.plan_key)}-${index}`}>
                    <td>{toText(item.project)}</td>
                    <td>{toText(item.plan_key)}</td>
                    <td>{toText(item.gate)}</td>
                    <td>{toText(item.agent)}</td>
                    <td>{toText(item.timestamp)}</td>
                  </tr>
                ))}
                {pendingGate.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No pending-gate entries.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>
        </>
      ) : null}
    </section>
  );
}

export const Route = createFileRoute('/live')({
  component: LivePage,
});
