import { useEffect, useMemo, useState } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { Activity, BarChart3, Clock, FileText, GitBranch, Route as RouteIcon, Search, Table2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createPortal } from 'react-dom';
import remarkGfm from 'remark-gfm';

import { GlassPanel } from '../components/ui/glass-panel';
import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { LoadingIndicator } from '../components/ui/loading-indicator';
import { MetricTile } from '../components/ui/metric-tile';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

const COLORS = ['#8bd3ff', '#b8f7d4', '#ffd27d', '#d9b8ff', '#ff9fbd', '#8ee7ef'];

type JsonRecord = Record<string, unknown>;

type LiveSummary = {
  running_pipelines?: unknown;
  active_projects?: unknown;
  unresolved_inferred?: unknown;
  pending_gate?: unknown;
  running_agents?: unknown;
  open_pipelines?: unknown;
};

type LivePayload = {
  generated_at?: unknown;
  summary?: LiveSummary;
  active_projects?: unknown;
  unresolved_inferred?: unknown;
  running_pipelines?: unknown;
  pending_gate?: unknown;
  open_pipelines?: unknown;
  timeline_runs?: unknown;
  latest_by_agent?: unknown;
  recent_secondary?: unknown;
  status_counts?: JsonRecord;
  running_agents?: unknown;
};

type PipelineRow = {
  project?: unknown;
  plan_key?: unknown;
  pipeline_id?: unknown;
  status?: unknown;
  started_at?: unknown;
  last_at?: unknown;
  event_type?: unknown;
  message?: unknown;
  agent_runs?: unknown;
  distinct_agents?: unknown;
  failures?: unknown;
  last_agent?: unknown;
  context_file?: unknown;
  is_running?: unknown;
};

type PendingGateRow = {
  project?: unknown;
  plan_key?: unknown;
  gate?: unknown;
  agent?: unknown;
  timestamp?: unknown;
};

type AgentRunRow = {
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

type ContextModal = { title: string; markdown: string; path?: string } | null;

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

const formatDateTime = (value: unknown): string => {
  if (value == null) return '—';
  const parsed = new Date(typeof value === 'number' ? value : String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed);
};

const formatRuntime = (value: unknown): string => {
  const ms = toNumber(value);
  if (ms == null) return '—';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
};

const formatClockTime = (value: unknown): string => {
  if (value == null) return '—';
  const parsed = new Date(typeof value === 'number' ? value : String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed);
};

const titleCase = (value: string): string => value
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const pipelineKey = (row: Pick<AgentRunRow, 'project' | 'plan_key'>): string => `${toText(row.project)} · ${toText(row.plan_key)}`;

const toOpenPipelines = (payload: LivePayload): PipelineRow[] => toArray<PipelineRow>(payload.open_pipelines);
const toAgentTimeline = (payload: LivePayload): AgentRunRow[] => toArray<AgentRunRow>(payload.timeline_runs);
const toLatestByAgent = (payload: LivePayload): AgentRunRow[] => toArray<AgentRunRow>(payload.latest_by_agent);
const toRecentSecondary = (payload: LivePayload): SecondaryRow[] => toArray<SecondaryRow>(payload.recent_secondary);

function parseKeyValueBlock(text: string): Array<[string, string]> {
  return text
    .split('\n')
    .map((line): [string, string] | null => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
    .filter((row): row is [string, string] => Boolean(row));
}

function splitFrontmatter(markdown: string): { frontmatter: Array<[string, string]>; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: [], body: markdown };
  return { frontmatter: parseKeyValueBlock(match[1]), body: markdown.slice(match[0].length) };
}

function splitRoutingBlock(markdown: string): { body: string; routing: Array<[string, string]> } {
  const match = markdown.match(/<!--\s*ROUTING\s*([\s\S]*?)-->/i);
  if (!match) return { body: markdown, routing: [] };
  const routing = parseKeyValueBlock(match[1].trim());
  const start = match.index || 0;
  const body = `${markdown.slice(0, start).trimEnd()}\n\n${markdown.slice(start + match[0].length).trimStart()}`.trim();
  return { body, routing };
}

function InfoCard({ title, rows, className = '' }: { title: string; rows: Array<[string, string]>; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className={`frontmatter-card ${className}`.trim()} aria-label={title}>
      <h4>{title}</h4>
      {rows.map(([key, value]) => (
        <div key={key} className="frontmatter-row">
          <span>{titleCase(key)}</span>
          <strong>{value || '—'}</strong>
        </div>
      ))}
    </section>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const { frontmatter, body: withoutFrontmatter } = splitFrontmatter(markdown);
  const { body, routing } = splitRoutingBlock(withoutFrontmatter);
  return (
    <div className="markdown-body">
      <InfoCard title="Frontmatter" rows={frontmatter} />
      <InfoCard title="Routing" rows={routing} className="routing-card" />
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}

function PipelineTimeline({ rows, onOpenContext }: { rows: AgentRunRow[]; onOpenContext: (row: AgentRunRow) => void }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const chart = useMemo(() => {
    const valid = rows
      .map((row) => ({ row, time: new Date(String(row.timestamp)).getTime(), key: pipelineKey(row) }))
      .filter((item) => Number.isFinite(item.time))
      .sort((a, b) => a.time - b.time);
    const keys = Array.from(new Set(valid.map((item) => item.key)));
    const min = valid[0]?.time ?? Date.now();
    const max = valid[valid.length - 1]?.time ?? min + 1;
    return { valid, keys, min, max: max === min ? min + 1 : max };
  }, [rows]);

  const width = 1000;
  const laneHeight = 99;
  const top = 80;
  const left = 180;
  const right = 30;
  const height = Math.max(180, top + chart.keys.length * laneHeight + 56);
  const x = (time: number) => left + ((time - chart.min) / (chart.max - chart.min)) * (width - left - right);
  const y = (key: string) => top + chart.keys.indexOf(key) * laneHeight + 34;
  const quarterHourMs = 15 * 60 * 1000;
  const ticks = Array.from({ length: Math.max(0, Math.floor(Math.ceil(chart.max / quarterHourMs) - Math.ceil(chart.min / quarterHourMs)) + 1) }, (_, index) => (Math.ceil(chart.min / quarterHourMs) + index) * quarterHourMs)
    .filter((tick) => tick >= chart.min && tick <= chart.max);
  const axisTicks = ticks.length > 0 ? ticks : [chart.min, chart.max];

  return (
    <div className="pipeline-timeline-wrap">
      <svg width={width} height={height} role="img" aria-label="Pipeline timeline" onMouseLeave={() => setTooltip(null)}>
        {axisTicks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={top - 46} y2={height - 30} stroke="rgba(255,255,255,.08)" />
            <text x={x(tick)} y={height - 10} fill="rgba(255,255,255,.56)" fontSize="12" textAnchor="middle">{formatClockTime(tick).replace(/:\d{2}$/, '')}</text>
          </g>
        ))}
        {chart.keys.map((key, index) => {
          const laneY = y(key);
          const lane = chart.valid.filter((item) => item.key === key);
          const points = lane.map((item) => `${x(item.time)},${laneY}`).join(' ');
          const color = COLORS[index % COLORS.length];
          return (
            <g key={key}>
              <line x1={left} x2={width - right} y1={laneY} y2={laneY} stroke="rgba(255,255,255,.12)" />
              <text x={12} y={laneY + 5} fill="rgba(255,255,255,.72)" fontSize="13">{key}</text>
              {points ? <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" /> : null}
              {lane.map((item, pointIndex) => {
                const cx = x(item.time);
                const lines = [
                  toText(item.row.agent),
                  `Verdict: ${toText(item.row.verdict)}`,
                  `Route to: ${toText(item.row.route_to)}`,
                  `Runtime: ${formatRuntime(item.row.duration_ms)}`,
                  `Time: ${formatDateTime(item.row.timestamp)}`,
                ];
                return (
                  <g key={`${key}-${pointIndex}`}>
                    <circle
                      cx={cx}
                      cy={laneY}
                      r="8"
                      className="timeline-point"
                      fill={color}
                      stroke="rgba(8,12,24,.92)"
                      strokeWidth="2"
                      onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, lines })}
                      onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, lines })}
                      onClick={() => onOpenContext(item.row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenContext(item.row);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`${lines.join(', ')}. Press Enter to open context.`}
                    />
                    <text
                      x={cx + 4}
                      y={laneY - 14}
                      fill="rgba(255,255,255,.78)"
                      fontSize="11"
                      transform={`rotate(-90 ${cx + 4} ${laneY - 14})`}
                      textAnchor="start"
                    >
                      {toText(item.row.agent).replace('pidex-', '')}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {tooltip ? (
        <div className="timeline-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.lines.map((line, index) => (
            <div key={line} className={index === 0 ? 'timeline-tooltip__title' : ''}>{line}</div>
          ))}
        </div>
      ) : null}
      {chart.valid.length === 0 ? <p className="muted">No running-pipeline agent timeline data available yet.</p> : null}
    </div>
  );
}

function ContextButton({ row, onOpen }: { row: Pick<AgentRunRow, 'project' | 'context_file' | 'agent'>; onOpen: (row: Pick<AgentRunRow, 'project' | 'context_file' | 'agent'>) => void }) {
  const hasContext = Boolean(toText(row.context_file) !== '—' && toText(row.project) !== '—');
  return (
    <button className="icon-button context-search-button" type="button" aria-label="Open context document" disabled={!hasContext} onClick={() => onOpen(row)}>
      <Search size={16} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

function LivePage() {
  const [contextModal, setContextModal] = useState<ContextModal>(null);
  const [modalError, setModalError] = useState('');
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const liveQuery = useDashboardQuery<LivePayload>(['live', project], withProjectParam('/api/live', project));
  const payload = liveQuery.data ?? null;
  const loading = liveQuery.isLoading;
  const error = liveQuery.isError ? 'Live data could not be loaded.' : '';

  useEffect(() => {
    if (!contextModal) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [contextModal]);

  const openContext = async (row: Pick<AgentRunRow, 'project' | 'context_file' | 'agent'>) => {
    setModalError('');
    setContextModal({ title: 'Loading context…', markdown: '' });
    try {
      const params = new URLSearchParams({ project: toText(row.project), context_file: toText(row.context_file) });
      const response = await fetch(`/api/document?${params.toString()}`);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = await response.json() as { markdown?: string; path?: string };
      setContextModal({
        title: `${toText(row.agent)} context`,
        markdown: data.markdown || 'No content.',
        path: data.path,
      });
    } catch {
      setContextModal({ title: 'Context unavailable', markdown: '' });
      setModalError('Could not load this context document.');
    }
  };

  const openPipelines = toOpenPipelines(payload || {});
  const runningPipelinesForTimeline = openPipelines
    .filter((row) => toText(row.status).toLowerCase() === 'running' || row.is_running === true);
  const runningPipelineKeys = new Set(
    runningPipelinesForTimeline.map((row) => `${toText(row.project)}::${toText(row.plan_key)}`),
  );
  const runningPipelineStarts = new Map(
    runningPipelinesForTimeline
      .map((row): [string, number] | null => {
        const startedAt = new Date(String(row.started_at || '')).getTime();
        if (!Number.isFinite(startedAt)) return null;
        return [`${toText(row.project)}::${toText(row.plan_key)}`, startedAt];
      })
      .filter((row): row is [string, number] => Boolean(row)),
  );
  const timelineRuns = toAgentTimeline(payload || {}).filter((row) => {
    const key = `${toText(row.project)}::${toText(row.plan_key)}`;
    if (!runningPipelineKeys.has(key)) return false;
    const startedAt = runningPipelineStarts.get(key);
    if (!startedAt) return true;
    const timestamp = new Date(String(row.timestamp || '')).getTime();
    return Number.isFinite(timestamp) && timestamp >= startedAt - 60_000;
  });
  const latestByAgent = toLatestByAgent(payload || {});
  const recentSecondary = toRecentSecondary(payload || {});
  const pendingGate = toArray<PendingGateRow>(payload?.pending_gate);

  const summary = payload?.summary || {};
  const statusCounts = payload?.status_counts || {};
  const runningPipelines = toNumber(summary.running_pipelines ?? payload?.running_pipelines) ?? openPipelines.length;
  const activeProjects = toNumber(summary.active_projects ?? payload?.active_projects) ?? new Set(openPipelines.map((row) => toText(row.project))).size;
  const unresolvedValue = toNumber(summary.unresolved_inferred ?? payload?.unresolved_inferred) ?? 0;
  const pendingGateValue = pendingGate.length > 0 ? 'yes' : 'no';

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2 icon-heading"><Activity size={24} aria-hidden="true" /> Live</h2>
        <p className="muted">Active PIDEX pipelines, agent handoffs, and recent routing events.</p>
        <p className="muted">Last updated: {formatDateTime(payload?.generated_at)}</p>
      </GlassPanel>

      {loading ? <LoadingIndicator label="Loading live data…" /> : null}

      {error ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}><p style={{ color: '#f8a' }}>{error}</p></article>
      ) : null}

      {!loading && !error ? (
        <>
          <article className="glass-card glass enhanced-glass" style={{ gridColumn: '1 / -1' }}>
            <div className="live-hero-metrics">
              <MetricTile title="Running Pipelines" value={runningPipelines} />
              <MetricTile title="Active Projects" value={activeProjects} />
            </div>
          </article>

          <article className="glass-card glass enhanced-glass enhanced-glass--feature" style={{ gridColumn: '1 / -1' }}>
            <h3 className="icon-heading"><GitBranch size={18} aria-hidden="true" /> Pipeline Timeline</h3>
            <p className="muted">Only currently running pipelines are shown. Agents are connected per project/plan. Hover a point to see verdict, route, and runtime.</p>
            <PipelineTimeline rows={timelineRuns} onOpenContext={openContext} />
          </article>

          <article className="glass-card glass enhanced-glass" style={{ gridColumn: '1 / -1' }}>
            <h3 className="icon-heading"><BarChart3 size={18} aria-hidden="true" /> Operational Signals</h3>
            <div className="operational-signals-grid">
              <MetricTile title="Open Pipelines" value={toNumber(summary.open_pipelines) ?? openPipelines.length} />
              <MetricTile title="Unresolved Inferred" value={unresolvedValue} />
              <MetricTile title="Pending Gate" value={pendingGateValue} />
              <MetricTile title="Running Agents" value={toText(payload?.running_agents ?? summary.running_agents)} />
              {Object.entries(statusCounts).map(([key, value]) => (
                <MetricTile key={key} title={`${titleCase(key)} Runs`} value={toText(value)} />
              ))}
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3 className="icon-heading"><RouteIcon size={18} aria-hidden="true" /> Open Pipelines</h3>
            <div className="table-scroll">
            <table className="table" aria-label="open pipelines">
              <thead>
                <tr>
                  <th aria-label="Context"></th>
                  <th>Project</th>
                  <th>Plan</th>
                  <th>Pipeline</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Last Event</th>
                  <th>Current Stage</th>
                  <th>Agent Runs</th>
                  <th>Agents</th>
                  <th>Failures</th>
                  <th>Current Agent</th>
                </tr>
              </thead>
              <tbody>
                {openPipelines.map((row, index) => (
                  <tr key={`${toText(row.project)}-${toText(row.plan_key)}-${index}`}>
                    <td><ContextButton row={{ project: row.project, context_file: row.context_file, agent: row.last_agent }} onOpen={openContext} /></td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.pipeline_id)}</td>
                    <td>{toText(row.status)}</td>
                    <td>{formatDateTime(row.started_at)}</td>
                    <td>{formatDateTime(row.last_at)}</td>
                    <td>{titleCase(toText(row.event_type))}</td>
                    <td>{toText(row.agent_runs)}</td>
                    <td>{toText(row.distinct_agents)}</td>
                    <td>{toText(row.failures)}</td>
                    <td>{toText(row.last_agent)}</td>
                  </tr>
                ))}
                {openPipelines.length === 0 ? <tr><td colSpan={12}>No open pipelines found.</td></tr> : null}
              </tbody>
            </table>
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3 className="icon-heading"><Clock size={18} aria-hidden="true" /> Latest Agent Runs</h3>
            <p className="muted">One latest entry per agent. “Latest Runs” was removed because it duplicated this view.</p>
            <div className="table-scroll">
            <table className="table" aria-label="latest agent runs">
              <thead>
                <tr>
                  <th aria-label="Context"></th>
                  <th>Time</th>
                  <th>Agent</th>
                  <th>Project</th>
                  <th>Plan</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Verdict</th>
                  <th>Route To</th>
                  <th>Gate</th>
                  <th>Runtime</th>
                </tr>
              </thead>
              <tbody>
                {latestByAgent.map((row, index) => (
                  <tr key={`${toText(row.agent)}-${toText(row.timestamp)}-${index}`}>
                    <td><ContextButton row={row} onOpen={openContext} /></td>
                    <td>{formatDateTime(row.timestamp)}</td>
                    <td>{toText(row.agent)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{toText(row.provider)}</td>
                    <td>{toText(row.model)}</td>
                    <td>{toText(row.verdict)}</td>
                    <td>{toText(row.route_to)}</td>
                    <td>{toText(row.gate)}</td>
                    <td>{formatRuntime(row.duration_ms)}</td>
                  </tr>
                ))}
                {latestByAgent.length === 0 ? <tr><td colSpan={11}>No agent entries found.</td></tr> : null}
              </tbody>
            </table>
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3 className="icon-heading"><FileText size={18} aria-hidden="true" /> Recent Secondary Reviews</h3>
            <div className="table-scroll">
            <table className="table" aria-label="recent secondary reviews">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Project</th>
                  <th>Plan</th>
                  <th>Role</th>
                  <th>Model</th>
                  <th>Verdict</th>
                  <th>Route To</th>
                  <th>Gate</th>
                  <th>Routing Present</th>
                  <th>Artifact</th>
                </tr>
              </thead>
              <tbody>
                {recentSecondary.map((row, index) => (
                  <tr key={`${toText(row.mtime)}-${toText(row.project)}-${index}`}>
                    <td>{formatDateTime(row.mtime)}</td>
                    <td>{toText(row.project)}</td>
                    <td>{toText(row.plan_key)}</td>
                    <td>{titleCase(toText(row.role))}</td>
                    <td>{toText(row.model_label)}</td>
                    <td>{toText(row.verdict)}</td>
                    <td>{toText(row.route_to)}</td>
                    <td>{toText(row.gate)}</td>
                    <td>{toText(row.has_routing)}</td>
                    <td>{toText(row.path)}</td>
                  </tr>
                ))}
                {recentSecondary.length === 0 ? <tr><td colSpan={10}>No recent secondary reviews.</td></tr> : null}
              </tbody>
            </table>
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3 className="icon-heading"><Table2 size={18} aria-hidden="true" /> Pending Gates</h3>
            <div className="table-scroll">
            <table className="table" aria-label="pending gates">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Plan</th>
                  <th>Gate</th>
                  <th>Agent</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {pendingGate.map((item, index) => (
                  <tr key={`${toText(item.project)}-${toText(item.plan_key)}-${index}`}>
                    <td>{toText(item.project)}</td>
                    <td>{toText(item.plan_key)}</td>
                    <td>{toText(item.gate)}</td>
                    <td>{toText(item.agent)}</td>
                    <td>{formatDateTime(item.timestamp)}</td>
                  </tr>
                ))}
                {pendingGate.length === 0 ? <tr><td colSpan={5}>No pending gates.</td></tr> : null}
              </tbody>
            </table>
            </div>
          </article>
        </>
      ) : null}

      {contextModal ? createPortal(
        <div role="dialog" aria-modal="true" className="modal-backdrop" onClick={() => setContextModal(null)}>
          <article className="context-modal glass-card glass" onClick={(event) => event.stopPropagation()}>
            <div className="context-modal__header">
              <div className="context-modal__titleblock">
                <h3>{contextModal.title}</h3>
                {contextModal.path ? <p className="muted">{contextModal.path}</p> : null}
              </div>
              <button className="icon-button" type="button" aria-label="Close context modal" onClick={() => setContextModal(null)}><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="context-modal__body">
              {modalError ? <p style={{ color: '#f8a' }}>{modalError}</p> : <MarkdownPreview markdown={contextModal.markdown} />}
            </div>
          </article>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

export const Route = createFileRoute('/live')({
  component: LivePage,
});
