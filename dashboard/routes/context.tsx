import { useEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { CheckCircle2, Plus, Search, Trash2, X } from 'lucide-react';

import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';
import { LoadingIndicator } from '../components/ui/loading-indicator';

type ContextEntry = { term: string; definition: string; avoid: string[] };
type ContextOpenQuestion = { index: number; text: string };
type ContextReviewEntry = ContextEntry & { index: number };
type ContextEditableSection = { heading: string; body: string };
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
  reviewEntries?: ContextReviewEntry[];
  editableSections?: ContextEditableSection[];
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

type SectionPair = { title: string; body: string };
type IdentityField = { key: string; value: string };

function sectionTabId(heading: string): string {
  return `section:${heading}`;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*[-*]\s+/, '').trim();
}

function parseIdentity(body: string): IdentityField[] {
  return body.split(/\r?\n/).map(stripBullet).filter(Boolean).map((line) => {
    const strong = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
    if (strong) return { key: strong[1].trim(), value: strong[2].trim() };
    const idx = line.indexOf(':');
    return idx >= 0 ? { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() } : { key: line, value: '' };
  });
}

function serializeIdentity(fields: IdentityField[]): string {
  return fields.map((field) => `- **${field.key.trim()}**: ${field.value.trim()}`).join('\n');
}

function isRenderableLine(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed) && !trimmed.startsWith('<!--') && !trimmed.endsWith('-->') && !trimmed.startsWith('-->');
}

function parsePairs(body: string): SectionPair[] {
  return body.split(/\r?\n/).filter(isRenderableLine).map(stripBullet).filter(Boolean).map((line) => ({ title: line, body: '' }));
}

function serializePairs(pairs: SectionPair[]): string {
  return pairs.map((pair) => `- ${pair.title.trim()}`).join('\n');
}

function listItems(body: string): string[] {
  return body.split(/\r?\n/).filter(isRenderableLine).map(stripBullet).filter(Boolean);
}

function ContextPage() {
  const location = useLocation();
  const project = readProjectFromSearch(location.search);
  const [payload, setPayload] = useState<ContextPayload | null>(null);
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [reviewEntries, setReviewEntries] = useState<ContextReviewEntry[]>([]);
  const [editableSections, setEditableSections] = useState<ContextEditableSection[]>([]);
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string>('language');
  const [sectionsSheetOpen, setSectionsSheetOpen] = useState(false);

  const endpoint = useMemo(() => withProjectParam('/api/context', project), [project]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(endpoint);
      const json = await response.json();
      setPayload(json);
      setEntries(json.entries || []);
      setReviewEntries(json.reviewEntries || []);
      setEditableSections(json.editableSections || []);
      setRaw(json.raw || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load context');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [endpoint]);

  useEffect(() => {
    const open = () => setSectionsSheetOpen(true);
    window.addEventListener('pidex:context-sections-open', open);
    return () => window.removeEventListener('pidex:context-sections-open', open);
  }, []);

  useEffect(() => {
    if (!sectionsSheetOpen) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [sectionsSheetOpen]);

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
          setReviewEntries(json.reviewEntries || []);
          setEditableSections(json.editableSections || []);
          setRaw(json.raw || '');
          throw new Error('Context changed on disk. Reloaded latest version; review before saving again.');
        }
        throw new Error(json?.errors?.join('\n') || json?.error || 'Save failed');
      }
      setPayload(json);
      setEntries(json.entries || []);
      setReviewEntries(json.reviewEntries || []);
      setEditableSections(json.editableSections || []);
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

  function updateReviewEntry(index: number, patch: Partial<ContextEntry>) {
    setReviewEntries((current) => current.map((entry, idx) => idx === index ? { ...entry, ...patch } : entry));
  }

  function updateEditableSection(index: number, body: string) {
    setEditableSections((current) => current.map((section, idx) => idx === index ? { ...section, body } : section));
  }

  const clientErrors = validateEntries(entries);
  const canStructuredSave = Boolean(payload?.structuredEditable) && clientErrors.length === 0;
  const modified = payload ? JSON.stringify(entries) !== JSON.stringify(payload.entries || []) || JSON.stringify(editableSections) !== JSON.stringify(payload.editableSections || []) : false;
  const query = search.trim().toLowerCase();
  const visibleEntries = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !query || [entry.term, entry.definition, aliasesToText(entry.avoid)].some((value) => value.toLowerCase().includes(query)));
  const sectionNav = [
    { id: 'review', label: 'Needs Review', show: Boolean(payload?.exists && (reviewEntries.length || payload.openQuestions?.length)) },
    { id: 'language', label: 'Language', show: Boolean(payload?.exists) },
    ...editableSections.map((section) => ({ id: sectionTabId(section.heading), label: section.heading, show: Boolean(payload?.exists) })),
    { id: 'raw', label: 'Raw Markdown', show: Boolean(payload?.exists) },
  ].filter((item) => item.show);

  const sectionMenu = (mobile = false) => (
    <nav className="context-side-menu" aria-label="Context sections">
      {sectionNav.map((item) => (
        <button key={item.id} className={`button ${activeSection === item.id ? 'active' : ''}`} type="button" onClick={() => { setActiveSection(item.id); setSectionsSheetOpen(false); if (item.id === 'raw') void load(); }}>{item.label}</button>
      ))}
    </nav>
  );

  return (
    <section className="grid context-grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass context-page-header" style={{ gridColumn: '1 / -1' }}>
        <div className="context-page-heading">
          <h2 className="h2">Project Context</h2>
          <dl className="context-file-meta" aria-label="Context file metadata">
            {payload?.path ? <div><dt>Path</dt><dd>{payload.path}</dd></div> : null}
            {payload?.mtimeMs ? <div><dt>Last modified</dt><dd>{new Date(payload.mtimeMs).toLocaleString()}</dd></div> : null}
          </dl>
        </div>
        <p className="muted">Review and edit project domain glossary at <code>pidex/context/CONTEXT.md</code>.</p>
        {payload?.exists ? (
          <div className="context-header-actions" aria-label="Context sections and save actions">
            <button className="button" type="button" disabled={saving || !modified || !canStructuredSave} onClick={() => post({ action: 'save-context', hash: payload.hash, entries, sections: editableSections })}>Save context</button>
          </div>
        ) : null}
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

      {payload?.exists ? <aside className="glass-card glass context-sidebar">{sectionMenu(false)}</aside> : null}

      {sectionsSheetOpen ? createPortal(
        <div className="mobile-sheet-overlay mobile-sheet-enter" role="dialog" aria-modal="true" aria-label="Context sections" onClick={() => setSectionsSheetOpen(false)}>
          <aside className="glass mobile-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-head">
              <h2 className="h2">Sections</h2>
              <button type="button" className="icon-button" aria-label="Close sections" onClick={() => setSectionsSheetOpen(false)}><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="mobile-sheet-body">{sectionMenu(true)}</div>
          </aside>
        </div>,
        document.body,
      ) : null}

      {payload?.exists && activeSection === 'review' && (reviewEntries.length > 0 || Boolean(payload.openQuestions?.length)) ? (
        <article id="context-review" className="glass-card glass context-main-panel" style={{ scrollMarginTop: 150 }}>
          <div className="context-entries-toolbar">
            <h3>Needs Review</h3>
          </div>
          <p className="muted">Only genuinely uncertain agent proposals should appear here. Edit a proposal, then approve it to move it into <code>## Language</code>.</p>
          {reviewEntries.length ? (
            <div className="context-entry-table" style={{ marginTop: 12 }}>
              <div className="context-entry-header" aria-hidden="true">
                <span>Term</span>
                <span>Definition</span>
                <span>Avoid aliases</span>
                <span></span>
              </div>
              {reviewEntries.map((entry, index) => (
                <section key={`${entry.index}-${entry.term}`} className="settings-subcontainer context-entry-row">
                  <input className="themed-input context-entry-field" aria-label="Review term" placeholder="Term" value={entry.term} onChange={(event) => updateReviewEntry(index, { term: event.target.value })} />
                  <AutoResizeTextarea className="themed-textarea context-entry-field context-definition-field" aria-label="Review definition" placeholder="Definition" rows={3} value={entry.definition} onChange={(event) => updateReviewEntry(index, { definition: event.target.value })} />
                  <AutoResizeTextarea className="themed-textarea context-entry-field" aria-label="Review avoid aliases" placeholder="Avoid aliases" rows={3} value={aliasesToText(entry.avoid)} onChange={(event) => updateReviewEntry(index, { avoid: textToAliases(event.target.value) })} />
                  <div className="context-review-actions">
                    <button className="icon-button compact context-review-action" type="button" aria-label={`Delete review entry ${entry.term || index + 1}`} disabled={saving} onClick={() => post({ action: 'delete-review-entry', hash: payload.hash, reviewIndex: entry.index })}><Trash2 size={14} /></button>
                    <button className="icon-button compact context-review-action" type="button" aria-label={`Approve review entry ${entry.term || index + 1}`} disabled={saving} onClick={() => post({ action: 'approve-review-entry', hash: payload.hash, reviewIndex: entry.index, entry: { term: entry.term, definition: entry.definition, avoid: entry.avoid } })}>
                      <CheckCircle2 size={14} />
                    </button>
                  </div>
                </section>
              ))}
            </div>
          ) : null}
          {payload.openQuestions?.length ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {payload.openQuestions.map((question) => (
                <section key={`${question.index}-${question.text}`} className="settings-subcontainer context-entry-row" style={{ gridTemplateColumns: '1fr auto' }}>
                  <p style={{ margin: 0 }}>{question.text}</p>
                  <button className="button" type="button" disabled={saving} onClick={() => post({ action: 'approve-open-question', hash: payload.hash, questionIndex: question.index })}>
                    <CheckCircle2 size={14} /> Approve note
                  </button>
                </section>
              ))}
            </div>
          ) : null}
        </article>
      ) : null}

      {payload?.exists && activeSection === 'language' ? (
        <article id="context-language" className="glass-card glass context-main-panel" style={{ scrollMarginTop: 150 }}>
          <div className="context-entries-toolbar">
            <h3>Language entries</h3>
            <div className="context-entries-actions">
              <label className="context-search-label" aria-label="Search context entries">
                <Search size={14} aria-hidden="true" />
                <input className="themed-input context-search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search entries…" />
              </label>
              <button className="button" type="button" onClick={() => setEntries([...entries, { term: '', definition: '', avoid: [] }])}><Plus size={14} /> Add entry</button>
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
          <p className="muted">Structured saves preserve unknown sections outside <code>## Language</code>.</p>
        </article>
      ) : null}

      {payload?.exists && editableSections.map((section, sectionIndex) => activeSection === sectionTabId(section.heading) ? (
        <article key={section.heading} id={sectionTabId(section.heading)} className="glass-card glass context-main-panel">
          <div className="context-entries-toolbar">
            <h3>{section.heading}</h3>
            {['Relationships', 'Architecture Notes', 'Operational Constraints'].includes(section.heading) ? (
              <div className="context-entries-actions">
                <label className="context-search-label" aria-label={`Search ${section.heading}`}>
                  <Search size={14} aria-hidden="true" />
                  <input className="themed-input context-search-input" value={sectionSearch} onChange={(event) => setSectionSearch(event.target.value)} placeholder={`Search ${section.heading}…`} />
                </label>
                <button className="button" type="button" onClick={() => updateEditableSection(sectionIndex, serializePairs([...parsePairs(section.body), { title: '', body: '' }]))}><Plus size={14} /> Add entry</button>
              </div>
            ) : null}
          </div>
          {section.heading === 'Project Identity' ? (
            <div className="context-identity-grid" style={{ marginTop: 12 }}>
              {parseIdentity(section.body).map((field, index, fields) => (
                <section key={`${field.key}-${index}`} className="settings-subcontainer context-identity-row context-list-row">
                  <input className="themed-input" aria-label="Identity field" value={field.key} onChange={(event) => {
                    const next = fields.map((item, idx) => idx === index ? { ...item, key: event.target.value } : item);
                    updateEditableSection(sectionIndex, serializeIdentity(next));
                  }} />
                  <input className="themed-input" aria-label="Identity value" value={field.value} onChange={(event) => {
                    const next = fields.map((item, idx) => idx === index ? { ...item, value: event.target.value } : item);
                    updateEditableSection(sectionIndex, serializeIdentity(next));
                  }} />
                </section>
              ))}
            </div>
          ) : ['Relationships', 'Architecture Notes', 'Operational Constraints'].includes(section.heading) ? (
            <div className="context-entry-table" style={{ marginTop: 12 }}>
              <div className="context-entry-header context-pair-header" aria-hidden="true">
                <span>Entry</span>
                <span></span>
              </div>
              {parsePairs(section.body).map((pair, index, pairs) => ({ pair, index, pairs })).filter(({ pair }) => !sectionSearch.trim() || pair.title.toLowerCase().includes(sectionSearch.trim().toLowerCase())).map(({ pair, index, pairs }) => (
                <section key={`${pair.title}-${index}`} className="settings-subcontainer context-pair-row context-list-row">
                  <AutoResizeTextarea className="themed-textarea context-entry-field" aria-label={`${section.heading} item`} rows={2} value={pair.title} onChange={(event) => {
                    const next = pairs.map((item, idx) => idx === index ? { ...item, title: event.target.value } : item);
                    updateEditableSection(sectionIndex, serializePairs(next));
                  }} />
                  <button className="icon-button compact context-entry-remove" type="button" aria-label={`Remove ${section.heading} item ${index + 1}`} onClick={() => updateEditableSection(sectionIndex, serializePairs(pairs.filter((_, idx) => idx !== index)))}><Trash2 size={14} /></button>
                </section>
              ))}
            </div>
          ) : section.heading === 'Example Dialogue' ? (
            <AutoResizeTextarea className="themed-textarea" rows={10} value={section.body} onChange={(event) => updateEditableSection(sectionIndex, event.target.value)} style={{ marginTop: 12 }} />
          ) : section.heading === 'Evidence Sources' || section.heading === 'Flagged Ambiguities' ? (
            <div className="context-rendered-table" style={{ marginTop: 12 }}>
              {listItems(section.body).length ? (
                <table>
                  <thead><tr><th>{section.heading === 'Evidence Sources' ? 'Source' : 'Ambiguity'}</th><th>Details</th></tr></thead>
                  <tbody>{listItems(section.body).map((item, index) => {
                    const idx = item.indexOf(':');
                    const title = idx >= 0 ? item.slice(0, idx).trim() : item;
                    const details = idx >= 0 ? item.slice(idx + 1).trim() : '';
                    return <tr key={index}><td>{title}</td><td>{details}</td></tr>;
                  })}</tbody>
                </table>
              ) : <p className="muted">No entries yet.</p>}
            </div>
          ) : (
            <div className="context-rendered-list" style={{ marginTop: 12 }}>
              {listItems(section.body).length ? <ul>{listItems(section.body).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">No entries yet.</p>}
            </div>
          )}
        </article>
      ) : null)}

      {payload?.exists && activeSection === 'raw' ? (
        <article id="context-raw" className="glass-card glass context-main-panel" style={{ scrollMarginTop: 150 }}>
          <div className="context-entries-toolbar"><h3>Raw Markdown</h3></div>
          <div style={{ marginTop: 12 }}>
            <AutoResizeTextarea className="themed-textarea" rows={18} value={raw} onChange={(event) => setRaw(event.target.value)} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
            <button className="button" type="button" disabled={saving} onClick={() => post({ action: 'save-raw', hash: payload.hash, raw })}>Save raw Markdown</button>
          </div>
        </article>
      ) : null}
    </section>
  );
}

export const Route = createFileRoute('/context')({
  component: ContextPage,
});
