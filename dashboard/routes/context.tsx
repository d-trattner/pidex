import { useEffect, useMemo, useState } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { BookOpenCheck, Plus, Trash2 } from 'lucide-react';

import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { LoadingIndicator } from '../components/ui/loading-indicator';

type ContextEntry = { term: string; definition: string; avoid: string[] };
type ContextPayload = {
  ok?: boolean;
  project?: string | null;
  project_root?: string | null;
  project_required?: boolean;
  exists?: boolean;
  path?: string;
  raw?: string;
  entries?: ContextEntry[];
  structuredEditable?: boolean;
  hash?: string;
  mtimeMs?: number | null;
  errors?: string[];
  stale_write?: boolean;
};

function aliasesToText(avoid: string[]): string {
  return (avoid || []).join(', ');
}

function textToAliases(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function validateEntries(entries: ContextEntry[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  entries.forEach((entry, index) => {
    const term = entry.term.trim();
    if (!term) errors.push(`Entry ${index + 1}: term is required`);
    if (!entry.definition.trim()) errors.push(`Entry ${term || index + 1}: definition is required`);
    const key = term.toLowerCase();
    if (key) {
      const previous = seen.get(key);
      if (previous) errors.push(`Duplicate term: ${term} conflicts with ${previous}`);
      else seen.set(key, term);
    }
  });
  return errors;
}

function ContextPage() {
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const [payload, setPayload] = useState<ContextPayload | null>(null);
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [rawOpen, setRawOpen] = useState(false);

  const endpoint = useMemo(() => withProjectParam('/api/context', project), [project]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(endpoint);
      const json = await response.json();
      setPayload(json);
      setEntries(json.entries || []);
      setRaw(json.raw || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load context');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [endpoint]);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409 && json?.stale_write) {
          setPayload(json);
          setEntries(json.entries || []);
          setRaw(json.raw || '');
          throw new Error('Context changed on disk. Reloaded latest version; review before saving again.');
        }
        throw new Error(json?.errors?.join('\n') || json?.error || 'Save failed');
      }
      setPayload(json);
      setEntries(json.entries || []);
      setRaw(json.raw || '');
      setMessage('Context saved. Commit candidate: pidex/context/CONTEXT.md');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function updateEntry(index: number, patch: Partial<ContextEntry>) {
    setEntries((current) => current.map((entry, idx) => idx === index ? { ...entry, ...patch } : entry));
  }

  const clientErrors = validateEntries(entries);
  const canStructuredSave = Boolean(payload?.structuredEditable) && clientErrors.length === 0;
  const modified = payload ? JSON.stringify(entries) !== JSON.stringify(payload.entries || []) : false;

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <div className="metric-tile-head">
          <span className="metric-icon" aria-hidden="true"><BookOpenCheck size={18} /></span>
          <h2 className="h2">Project Context</h2>
        </div>
        <p className="muted">Review and edit project domain glossary at <code>pidex/context/CONTEXT.md</code>.</p>
        {!project ? <p className="settings-warning active">Select a project before editing context.</p> : null}
        {payload?.path ? <p className="muted">Path: {payload.path}</p> : null}
        {payload?.mtimeMs ? <p className="muted">Last modified: {new Date(payload.mtimeMs).toLocaleString()}</p> : null}
        {loading ? <LoadingIndicator label="Loading context…" /> : null}
        {message ? <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>{message}</pre> : null}
        {payload?.errors?.length ? <pre className="settings-warning active" style={{ whiteSpace: 'pre-wrap' }}>{payload.errors.join('\n')}</pre> : null}
      </article>

      {project && payload && !payload.exists ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <h3>No CONTEXT.md yet</h3>
          <p className="muted">Create a Matt-compatible project context file under <code>pidex/context/CONTEXT.md</code>.</p>
          <button className="button" type="button" disabled={saving} onClick={() => post({ action: 'create' })}>Create context file</button>
        </article>
      ) : null}

      {payload?.exists ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3>Language entries</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="button" type="button" onClick={() => setEntries([...entries, { term: '', definition: '', avoid: [] }])}><Plus size={14} /> Add entry</button>
              <button className="button" type="button" disabled={saving || !modified || !canStructuredSave} onClick={() => post({ action: 'save-entries', hash: payload.hash, entries })}>Save context</button>
            </div>
          </div>
          {!payload.structuredEditable ? <p className="settings-warning active">Structured editor disabled until Language syntax is fixed in raw Markdown.</p> : null}
          {clientErrors.length ? <pre className="settings-warning active" style={{ whiteSpace: 'pre-wrap' }}>{clientErrors.join('\n')}</pre> : null}
          <div className="parallel-agents-grid" style={{ marginTop: 12 }}>
            {entries.map((entry, index) => (
              <section key={`${entry.term}-${index}`} className="settings-subcontainer parallel-agent-card">
                <div className="settings-subcontainer-header">
                  <h5>{entry.term || `New entry ${index + 1}`}</h5>
                  <button className="icon-button compact" type="button" aria-label="Remove entry" onClick={() => setEntries(entries.filter((_, idx) => idx !== index))}><Trash2 size={14} /></button>
                </div>
                <label className="muted">Term
                  <input className="themed-input" value={entry.term} onChange={(event) => updateEntry(index, { term: event.target.value })} disabled={!payload.structuredEditable} />
                </label>
                <label className="muted">Definition
                  <textarea className="themed-textarea" rows={3} value={entry.definition} onChange={(event) => updateEntry(index, { definition: event.target.value })} disabled={!payload.structuredEditable} />
                </label>
                <label className="muted">Avoid aliases
                  <input className="themed-input" value={aliasesToText(entry.avoid)} onChange={(event) => updateEntry(index, { avoid: textToAliases(event.target.value) })} disabled={!payload.structuredEditable} />
                </label>
              </section>
            ))}
          </div>
          {entries.length === 0 ? <p className="muted">No glossary entries yet. Add one when a project-specific term is resolved.</p> : null}
          <p className="muted">Structured saves preserve Relationships, Example dialogue, Flagged ambiguities, and unknown sections outside <code>## Language</code>.</p>
        </article>
      ) : null}

      {payload?.exists ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <button className="button" type="button" onClick={() => setRawOpen((value) => !value)}>{rawOpen ? 'Hide raw Markdown' : 'Show raw Markdown fallback'}</button>
          {rawOpen ? (
            <div style={{ marginTop: 12 }}>
              <textarea className="themed-textarea" rows={18} value={raw} onChange={(event) => setRaw(event.target.value)} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
              <button className="button" type="button" disabled={saving} onClick={() => post({ action: 'save-raw', hash: payload.hash, raw })}>Save raw Markdown</button>
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

export const Route = createFileRoute('/context')({
  component: ContextPage,
});
