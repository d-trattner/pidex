import { useEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { CheckCircle2, Plus, Search, Trash2 } from 'lucide-react';

import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { LoadingIndicator } from '../components/ui/loading-indicator';

type ContextEntry = { term: string; definition: string; avoid: string[] };
type ContextOpenQuestion = { index: number; text: string };
type ContextPayload = {
  ok?: boolean;
  project?: string | null;
  project_root?: string | null;
  project_required?: boolean;
  exists?: boolean;
  path?: string;
  raw?: string;
  entries?: ContextEntry[];
  openQuestions?: ContextOpenQuestion[];
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

function AutoResizeTextarea({ value, onChange, className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };

  useEffect(() => { resize(); }, [value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={rows}
      value={value}
      className={className}
      onChange={(event) => {
        onChange?.(event);
        requestAnimationFrame(resize);
      }}
    />
  );
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
  const [search, setSearch] = useState('');

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
  const query = search.trim().toLowerCase();
  const visibleEntries = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !query || [entry.term, entry.definition, aliasesToText(entry.avoid)].some((value) => value.toLowerCase().includes(query)));

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass context-page-header" style={{ gridColumn: '1 / -1' }}>
        <div className="context-page-heading">
          <h2 className="h2">Project Context</h2>
          <dl className="context-file-meta" aria-label="Context file metadata">
            {payload?.path ? <div><dt>Path</dt><dd>{payload.path}</dd></div> : null}
            {payload?.mtimeMs ? <div><dt>Last modified</dt><dd>{new Date(payload.mtimeMs).toLocaleString()}</dd></div> : null}
          </dl>
        </div>
        <p className="muted">Review and edit project domain glossary at <code>pidex/context/CONTEXT.md</code>.</p>
        {!project ? <p className="settings-warning active">Select a project before editing context.</p> : null}
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

      {payload?.exists && payload.openQuestions?.length ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <div className="context-entries-toolbar">
            <h3>Needs Review</h3>
          </div>
          <p className="muted">Only uncertain agent proposals should appear here. Confirmed terms may go directly into <code>## Language</code>; approving a note records it under <code>## Approved Context Notes</code>.</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {payload.openQuestions.map((question) => (
              <section key={`${question.index}-${question.text}`} className="settings-subcontainer context-entry-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <p style={{ margin: 0 }}>{question.text}</p>
                <button className="button" type="button" disabled={saving} onClick={() => post({ action: 'approve-open-question', hash: payload.hash, questionIndex: question.index })}>
                  <CheckCircle2 size={14} /> Approve
                </button>
              </section>
            ))}
          </div>
        </article>
      ) : null}

      {payload?.exists ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <div className="context-entries-toolbar">
            <h3>Language entries</h3>
            <div className="context-entries-actions">
              <label className="context-search-label" aria-label="Search context entries">
                <Search size={14} aria-hidden="true" />
                <input className="themed-input context-search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search entries…" />
              </label>
              <button className="button" type="button" onClick={() => setEntries([...entries, { term: '', definition: '', avoid: [] }])}><Plus size={14} /> Add entry</button>
              <button className="button" type="button" disabled={saving || !modified || !canStructuredSave} onClick={() => post({ action: 'save-entries', hash: payload.hash, entries })}>Save context</button>
            </div>
          </div>
          {!payload.structuredEditable ? <p className="settings-warning active">Structured editor disabled until Language syntax is fixed in raw Markdown.</p> : null}
          {clientErrors.length ? <pre className="settings-warning active" style={{ whiteSpace: 'pre-wrap' }}>{clientErrors.join('\n')}</pre> : null}
          <div className="context-entry-table" style={{ marginTop: 12 }}>
            <div className="context-entry-header" aria-hidden="true">
              <span>Term</span>
              <span>Definition</span>
              <span>Avoid aliases</span>
              <span></span>
            </div>
            {visibleEntries.map(({ entry, index }) => (
              <section key={index} className="settings-subcontainer context-entry-row">
                <input className="themed-input context-entry-field" aria-label="Term" placeholder="Term" value={entry.term} onChange={(event) => updateEntry(index, { term: event.target.value })} disabled={!payload.structuredEditable} />
                <AutoResizeTextarea className="themed-textarea context-entry-field context-definition-field" aria-label="Definition" placeholder="Definition" rows={3} value={entry.definition} onChange={(event) => updateEntry(index, { definition: event.target.value })} disabled={!payload.structuredEditable} />
                <AutoResizeTextarea className="themed-textarea context-entry-field" aria-label="Avoid aliases" placeholder="Avoid aliases" rows={3} value={aliasesToText(entry.avoid)} onChange={(event) => updateEntry(index, { avoid: textToAliases(event.target.value) })} disabled={!payload.structuredEditable} />
                <button className="icon-button compact context-entry-remove" type="button" aria-label={`Remove ${entry.term || `entry ${index + 1}`}`} onClick={() => setEntries(entries.filter((_, idx) => idx !== index))}><Trash2 size={14} /></button>
              </section>
            ))}
          </div>
          {entries.length === 0 ? <p className="muted">No glossary entries yet. Add one when a project-specific term is resolved.</p> : null}
          {entries.length > 0 && visibleEntries.length === 0 ? <p className="muted">No entries match “{search}”.</p> : null}
          <p className="muted">Structured saves preserve Relationships, Example dialogue, Flagged ambiguities, and unknown sections outside <code>## Language</code>.</p>
        </article>
      ) : null}


      {payload?.exists ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <button className="button" type="button" onClick={() => setRawOpen((value) => !value)}>{rawOpen ? 'Hide raw Markdown' : 'Show raw Markdown fallback'}</button>
          {rawOpen ? (
            <div style={{ marginTop: 12 }}>
              <AutoResizeTextarea className="themed-textarea" rows={18} value={raw} onChange={(event) => setRaw(event.target.value)} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
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
