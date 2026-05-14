import { useEffect, useState } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createPortal } from 'react-dom';
import remarkGfm from 'remark-gfm';

import { GlassPanel } from '../components/ui/glass-panel';
import { LoadingIndicator } from '../components/ui/loading-indicator';
import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type RunRow = {
  timestamp: unknown;
  project: unknown;
  plan_key: unknown;
  agent: unknown;
  provider: unknown;
  model: unknown;
  verdict: unknown;
  route_to: unknown;
  gate: unknown;
  duration_ms: unknown;
  input_tokens: unknown;
  output_tokens: unknown;
  cost_usd: unknown;
  context_file: unknown;
};

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
  context_file: unknown;
};

type ContextModal = { title: string; markdown: string; path?: string } | null;

function formatText(value: unknown): string {
  if (value == null || typeof value === 'object') return '—';
  const text = String(value).trim();
  return text.length > 0 ? text : '—';
}

function formatDate(value: unknown): string {
  const text = formatText(value);
  if (text === '—') return text;
  const dt = new Date(text);
  return Number.isNaN(dt.getTime()) ? text : dt.toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatNumber(value: unknown): string {
  if (typeof value === 'object' || typeof value === 'symbol') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function formatDuration(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return '—';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatCost(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 5 }).format(n);
}

function ContextButton({ row, onOpen }: { row: Pick<RunRow, 'project' | 'context_file' | 'agent'>; onOpen: (row: Pick<RunRow, 'project' | 'context_file' | 'agent'>) => void }) {
  const hasContext = formatText(row.context_file) !== '—' && formatText(row.project) !== '—';
  return (
    <button className="icon-button context-search-button" type="button" aria-label="Open context document" disabled={!hasContext} onClick={() => onOpen(row)}>
      <Search size={16} aria-hidden="true" />
    </button>
  );
}

function ContextDocumentModal({ modal, error, onClose }: { modal: ContextModal; error: string; onClose: () => void }) {
  if (!modal) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" className="modal-backdrop" onClick={onClose}>
      <article className="context-modal glass-card glass" onClick={(event) => event.stopPropagation()}>
        <div className="context-modal__header">
          <div className="context-modal__titleblock">
            <h3>{modal.title}</h3>
            {modal.path ? <p className="muted">{modal.path}</p> : null}
          </div>
          <button className="icon-button" type="button" aria-label="Close context modal" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="context-modal__body">
          {error ? <p style={{ color: '#f8a' }}>{error}</p> : <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{modal.markdown}</ReactMarkdown></div>}
        </div>
      </article>
    </div>,
    document.body,
  );
}

function RunsPlaceholder() {
  const [contextModal, setContextModal] = useState<ContextModal>(null);
  const [modalError, setModalError] = useState('');
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const query = useDashboardQuery<RunRow[]>(['runs', project], withProjectParam('/api/runs?limit=20', project));
  const pipelinesQuery = useDashboardQuery<PipelineRow[]>(['pipelines', project], withProjectParam('/api/pipelines', project));
  const runs = Array.isArray(query.data) ? query.data : [];
  const pipelines = Array.isArray(pipelinesQuery.data) ? pipelinesQuery.data : [];

  useEffect(() => {
    if (!contextModal) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [contextModal]);

  const openContext = async (row: Pick<RunRow, 'project' | 'context_file' | 'agent'>) => {
    setModalError('');
    setContextModal({ title: 'Loading context…', markdown: '' });
    try {
      const params = new URLSearchParams({ project: formatText(row.project), context_file: formatText(row.context_file) });
      const response = await fetch(`/api/document?${params.toString()}`);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = await response.json() as { markdown?: string; path?: string };
      setContextModal({ title: `${formatText(row.agent)} context`, markdown: data.markdown || 'No content.', path: data.path });
    } catch {
      setContextModal({ title: 'Context unavailable', markdown: '' });
      setModalError('Could not load this context document.');
    }
  };

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Runs</h2>
        <p className="muted">Latest agent and pipeline runs.</p>
      </GlassPanel>
      {query.isLoading ? <LoadingIndicator label="Loading runs…" /> : null}
      {pipelinesQuery.isLoading ? <LoadingIndicator label="Loading pipelines…" /> : null}

      <div className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h3>Latest agent runs</h3>
        <div className="table-scroll">
        <table className="table" aria-label="runs table">
          <thead>
            <tr>
              <th aria-label="Context"></th>
              <th>Started</th>
              <th>Project</th>
              <th>Plan</th>
              <th>Agent</th>
              <th>Provider</th>
              <th>Model</th>
              <th>Verdict</th>
              <th>Duration</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((row) => (
              <tr key={`${formatText(row.timestamp)}-${formatText(row.project)}-${formatText(row.plan_key)}-${formatText(row.agent)}`}>
                <td><ContextButton row={row} onOpen={openContext} /></td>
                <td>{formatDate(row.timestamp)}</td>
                <td>{formatText(row.project)}</td>
                <td>{formatText(row.plan_key)}</td>
                <td>{formatText(row.agent)}</td>
                <td>{formatText(row.provider)}</td>
                <td>{formatText(row.model)}</td>
                <td>{formatText(row.verdict)}</td>
                <td>{formatDuration(row.duration_ms)}</td>
                <td>{formatNumber(row.input_tokens)}</td>
                <td>{formatNumber(row.output_tokens)}</td>
                <td>{formatCost(row.cost_usd)}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td colSpan={12}>No runs loaded yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h3>Completed pipeline runs</h3>
        <div className="table-scroll">
          <table className="table" aria-label="pipelines table">
            <thead>
              <tr>
                <th aria-label="Context"></th>
                <th>Completed</th>
                <th>Project</th>
                <th>Plan</th>
                <th>Agent Runs</th>
                <th>Agents</th>
                <th>Wall Time</th>
                <th>Agent Time</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
                <th>Cost</th>
                <th>Gates</th>
                <th>Failures</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((row, index) => (
                <tr key={`${formatText(row.completed_at)}-${formatText(row.project)}-${formatText(row.plan_key)}-${index}`}>
                  <td><ContextButton row={{ project: row.project, context_file: row.context_file, agent: row.plan_key }} onOpen={openContext} /></td>
                  <td>{formatDate(row.completed_at)}</td>
                  <td>{formatText(row.project)}</td>
                  <td>{formatText(row.plan_key)}</td>
                  <td>{formatNumber(row.agent_runs)}</td>
                  <td>{formatNumber(row.distinct_agents)}</td>
                  <td>{formatDuration(row.wall_runtime_ms)}</td>
                  <td>{formatDuration(row.total_runtime_ms)}</td>
                  <td>{formatNumber(row.input_tokens)}</td>
                  <td>{formatNumber(row.output_tokens)}</td>
                  <td>{formatCost(row.cost_usd)}</td>
                  <td>{formatNumber(row.gates)}</td>
                  <td>{formatNumber(row.failures)}</td>
                </tr>
              ))}
              {pipelines.length === 0 && !pipelinesQuery.isLoading ? (
                <tr><td colSpan={13}>No pipeline entries found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <ContextDocumentModal modal={contextModal} error={modalError} onClose={() => setContextModal(null)} />
    </section>
  );
}

export const Route = createFileRoute('/runs')({
  component: RunsPlaceholder,
});
