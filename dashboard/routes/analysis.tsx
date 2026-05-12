import { useEffect, useState } from 'react';

import { createFileRoute } from '@tanstack/react-router';

type AnalysisItem = {
  path: string;
  title: string;
  project_slug: string | null;
  plan_key: string | null;
  verdict?: string | null;
  confidence?: string | null;
  updated: string;
};

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value || '—';
  }
}

function AnalysisPage() {
  const [reports, setReports] = useState<AnalysisItem[]>([]);
  const [plans, setPlans] = useState<AnalysisItem[]>([]);
  const [docPath, setDocPath] = useState<string>('');
  const [docText, setDocText] = useState<string>('');
  const [loadingDoc, setLoadingDoc] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch('/api/analysis').then((res) => res.json()),
      fetch('/api/analysis/plans').then((res) => res.json()),
    ])
      .then(([analysisPayload, plansPayload]) => {
        if (!mounted) return;
        setReports(Array.isArray(analysisPayload) ? analysisPayload : []);
        setPlans(Array.isArray(plansPayload) ? plansPayload : []);
      })
      .catch(() => {
        if (!mounted) return;
        setReports([]);
        setPlans([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const openDocument = (path: string) => {
    setDocPath(path);
    setLoadingDoc(true);
    setDocText('');
    fetch(`/api/analysis/document?path=${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((payload) => {
        setDocText(payload && payload.markdown ? String(payload.markdown) : '');
      })
      .catch(() => {
        setDocText('Document could not be loaded.');
      })
      .finally(() => {
        setLoadingDoc(false);
      });
  };

  const Row = ({ item, kind }: { item: AnalysisItem; kind: 'reports' | 'plans'; key?: string }) => (
    <tr>
      <td>{item.project_slug || '—'}</td>
      <td>{item.plan_key || '—'}</td>
      <td>{item.title}</td>
      <td>{item.verdict || '—'}</td>
      <td>{item.confidence || '—'}</td>
      <td>{formatDate(item.updated)}</td>
      <td>
        <button
          type="button"
          style={{ border: 'none', background: 'transparent', color: '#8ad7ff', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => openDocument(item.path)}
          aria-label={`${kind} open: ${item.title}`}
        >
          open
        </button>
      </td>
    </tr>
  );

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Analysis</h2>
        <p className="muted">Pipeline reports and plan analysis from the `analysis/` folder.</p>
      </article>

      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h3>Pipeline Reports</h3>
        <div className="table-scroll">
        <table className="table" aria-label="analysis reports">
          <thead>
            <tr>
              <th>project</th>
              <th>plan</th>
              <th>title</th>
              <th>verdict</th>
              <th>confidence</th>
              <th>updated</th>
              <th>action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((item: AnalysisItem) => (
              <Row key={`${item.path}-r`} item={item} kind="reports" />
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={7}>No reports found.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </article>

      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h3>Plan Documents</h3>
        <div className="table-scroll">
        <table className="table" aria-label="analysis plans">
          <thead>
            <tr>
              <th>project</th>
              <th>plan</th>
              <th>title</th>
              <th>verdict</th>
              <th>confidence</th>
              <th>updated</th>
              <th>action</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((item: AnalysisItem) => (
              <Row key={`${item.path}-p`} item={item} kind="plans" />
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={7}>No plan documents found.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </article>

      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h3>Document Viewer</h3>
        <p className="muted">{docPath || 'Select a report or plan.'}</p>
        {loadingDoc ? <p className="muted">Loading document…</p> : null}
        {!loadingDoc && docText ? <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{docText}</pre> : null}
      </article>
    </section>
  );
}

export const Route = createFileRoute('/analysis')({
  component: AnalysisPage,
});
