import { useEffect, useState } from 'react';

import { createFileRoute } from '@tanstack/react-router';
import { GlassPanel } from '../../components/ui/glass-panel';
import { MetricTile } from '../../components/ui/metric-tile';

type JsonRecord = Record<string, unknown>;

type LivePayload = {
  generated_at?: unknown;
  status_counts?: JsonRecord;
  running_agents?: unknown;
  running_pipelines?: unknown;
  unresolved_inferred?: unknown;
  pending_gate?: unknown;
  open_pipelines?: unknown;
  latest_by_agent?: unknown;
  latest_runs?: unknown;
  recent?: unknown;
  recent_secondary?: unknown;
};

type PipelineRecord = {
  project?: unknown;
  count?: unknown;
};

type PendingGateRecord = {
  project?: unknown;
  plan_key?: unknown;
  gate?: unknown;
  agent?: unknown;
  timestamp?: unknown;
};

type RunRecord = {
  timestamp?: unknown;
  project?: unknown;
  plan_key?: unknown;
  agent?: unknown;
  route_to?: unknown;
  verdict?: unknown;
  gate?: unknown;
};

type LatestByAgentRecord = {
  agent?: unknown;
  latest?: unknown;
  project?: unknown;
  count?: unknown;
};

type SecondaryRecord = JsonRecord;

const toArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toText = (value: unknown): string => {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '—';
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const tileValue = (value: unknown): string | number => {
  const numeric = toNumber(value);
  return numeric == null ? '—' : numeric;
};

const toDateText = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return toText(value);
  return parsed.toLocaleString();
};

const toDateMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const summarizeByAgent = (runs: RunRecord[]): LatestByAgentRecord[] => {
  const grouped = new Map<string, LatestByAgentRecord>();

  for (const [index, row] of runs.entries()) {
    const key = toText(row.agent);
    const mapKey = key === '—' ? `agent-${index + 1}` : key;
    const previous = grouped.get(mapKey);
    const nextCount = (toNumber(previous?.count) ?? 0) + 1;
    const previousTs = toDateMillis(previous?.latest);
    const rowTs = toDateMillis(row.timestamp);
    const shouldReplaceLatest =
      previous == null ||
      (previousTs == null && rowTs != null) ||
      (previousTs != null && rowTs != null && rowTs > previousTs);

    grouped.set(mapKey, {
      agent: previous?.agent ?? row.agent,
      latest: shouldReplaceLatest ? row.timestamp : previous?.latest,
      project: shouldReplaceLatest ? row.project : previous?.project ?? row.project,
      count: nextCount,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftTs = toDateMillis(left.latest);
    const rightTs = toDateMillis(right.latest);
    if (leftTs == null || rightTs == null) return 0;
    return rightTs - leftTs;
  });
};

function LivePage() {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const abort = new AbortController();

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/live', { signal: abort.signal });
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const data = await response.json();
        if (!mounted) return;

        if (data && typeof data === 'object') {
          setPayload(data as LivePayload);
        } else {
          setPayload(null);
          setError('Ungültiges Live-Payload-Format.');
        }
      } catch (caught) {
        if (!mounted || (caught instanceof DOMException && caught.name === 'AbortError')) {
          return;
        }
        setPayload(null);
        setError('Live-Daten konnten nicht geladen werden.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
      abort.abort();
    };
  }, []);

  const statusCounts =
    payload?.status_counts && !Array.isArray(payload.status_counts) ? (payload.status_counts as JsonRecord) : {};

  const openPipelines =
    toArray<PipelineRecord>(payload?.open_pipelines).length > 0
      ? toArray<PipelineRecord>(payload?.open_pipelines)
      : toArray<PipelineRecord>(payload?.running_pipelines);

  const pendingGate = toArray<PendingGateRecord>(payload?.pending_gate);
  const latestRuns =
    toArray<RunRecord>(payload?.latest_runs).length > 0
      ? toArray<RunRecord>(payload?.latest_runs)
      : toArray<RunRecord>(payload?.recent);
  const latestByAgent =
    toArray<LatestByAgentRecord>(payload?.latest_by_agent).length > 0
      ? toArray<LatestByAgentRecord>(payload?.latest_by_agent)
      : summarizeByAgent(latestRuns);

  const recentSecondary = toArray<SecondaryRecord>(payload?.recent_secondary);

  const runningPipelinesCount =
    toNumber(payload?.running_pipelines) ?? (openPipelines.length > 0 ? openPipelines.length : null);

  const summaryRows: Array<{ key: string; label: string; value: string | number }> = [
    { key: 'running_pipelines', label: 'running_pipelines', value: tileValue(runningPipelinesCount) },
    { key: 'unresolved_inferred', label: 'unresolved_inferred', value: tileValue(payload?.unresolved_inferred) },
    { key: 'pending_gate', label: 'pending_gate', value: tileValue(toNumber(payload?.pending_gate) ?? pendingGate.length) },
  ];

  const runningAgents = toNumber(payload?.running_agents);
  if (runningAgents != null) {
    summaryRows.push({ key: 'running_agents', label: 'running_agents', value: runningAgents });
  }

  for (const [key, value] of Object.entries(statusCounts)) {
    if (summaryRows.some((row) => row.key === key)) continue;
    summaryRows.push({ key, label: `status: ${key}`, value: tileValue(value) });
  }

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Live</h2>
        <p className="muted">Laufzeitübersicht für aktive Pipelines, Gates und Sekundärereignisse.</p>
        <p className="muted">Letzte Aktualisierung: {toDateText(payload?.generated_at)}</p>
      </GlassPanel>

      {loading ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p className="muted">Lade Live-Daten…</p>
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
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {summaryRows.map((tile) => (
                <MetricTile key={tile.key} title={tile.label} value={tile.value} />
              ))}
              {summaryRows.length === 0 ? <p className="muted">Keine Summary-Daten im Payload.</p> : null}
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>open_pipelines</h3>
            <table className="table" aria-label="open pipelines">
              <thead>
                <tr>
                  <th>project</th>
                  <th>count</th>
                </tr>
              </thead>
              <tbody>
                {openPipelines.map((row) => (
                  <tr key={`${toText(row.project)}-${toText(row.count)}`}>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.count)}</td>
                  </tr>
                ))}
                {openPipelines.length === 0 ? (
                  <tr>
                    <td colSpan={2}>Keine offenen Pipelines.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>latest_by_agent</h3>
            <table className="table" aria-label="latest by agent">
              <thead>
                <tr>
                  <th>agent</th>
                  <th>project</th>
                  <th>latest</th>
                  <th>count</th>
                </tr>
              </thead>
              <tbody>
                {latestByAgent.map((row) => (
                  <tr key={`${toText(row.agent)}-${toText(row.latest)}`}>
                    <td>{toText(row.agent)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toDateText(row.latest)}</td>
                    <td>{toText(row.count)}</td>
                  </tr>
                ))}
                {latestByAgent.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Keine Agentenaktivität gefunden.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>latest_runs</h3>
            <table className="table" aria-label="latest runs">
              <thead>
                <tr>
                  <th>time</th>
                  <th>project</th>
                  <th>plan</th>
                  <th>agent</th>
                  <th>route_to</th>
                  <th>verdict</th>
                  <th>gate</th>
                </tr>
              </thead>
              <tbody>
                {latestRuns.map((row, index) => (
                  <tr key={`${toText(row.timestamp)}-${toText(row.project)}-${index}`}>
                    <td>{toDateText(row.timestamp)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.agent)}</td>
                    <td>{toText(row.route_to)}</td>
                    <td>{toText(row.verdict)}</td>
                    <td>{toText(row.gate)}</td>
                  </tr>
                ))}
                {latestRuns.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Keine Runs gefunden.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>recent_secondary</h3>
            <table className="table" aria-label="recent secondary entries">
              <thead>
                <tr>
                  <th>time</th>
                  <th>project</th>
                  <th>plan</th>
                  <th>agent</th>
                  <th>route_to</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {recentSecondary.map((row, index) => (
                  <tr key={`${toText(row.timestamp)}-${toText(row.project)}-${index}`}>
                    <td>{toDateText(row.timestamp)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.agent)}</td>
                    <td>{toText(row.route_to)}</td>
                    <td>{toText(row.status ?? row.verdict ?? row.reason)}</td>
                  </tr>
                ))}
                {recentSecondary.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Keine recent_secondary-Einträge.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3>pending_gate (Fallback-Ansicht)</h3>
            <table className="table" aria-label="pending gate">
              <thead>
                <tr>
                  <th>project</th>
                  <th>plan</th>
                  <th>gate</th>
                  <th>agent</th>
                  <th>time</th>
                </tr>
              </thead>
              <tbody>
                {pendingGate.map((row, index) => (
                  <tr key={`${toText(row.project)}-${toText(row.plan_key)}-${index}`}>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.gate)}</td>
                    <td>{toText(row.agent)}</td>
                    <td>{toDateText(row.timestamp)}</td>
                  </tr>
                ))}
                {pendingGate.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Keine pending_gate-Einträge.</td>
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

export const Route = createFileRoute('/_dashboard/live')({
  component: LivePage,
});