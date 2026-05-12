import { useEffect, useState } from 'react';

import { createFileRoute, useLocation } from '@tanstack/react-router';
import { GlassPanel } from '../components/ui/glass-panel';
import { readProjectFromSearch, withProjectParam } from '../lib/client/project-query';

type RunRow = {
  timestamp: string;
  project: string;
  plan_key: string;
  agent: string;
  provider: string;
  model: string;
  verdict: string;
  route_to: string;
  gate: string;
};

function RunsPlaceholder() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const location = useLocation();
  const project = readProjectFromSearch(location.search);

  useEffect(() => {
    let mounted = true;
    fetch(withProjectParam('/api/runs?limit=20', project))
      .then((res) => res.json())
      .then((payload) => {
        if (!mounted) return;
        setRuns(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        setRuns([]);
      });
    return () => {
      mounted = false;
    };
  }, [project]);

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Runs</h2>
        <p className="muted">Latest agent runs (including filters: show_historical, provider, project).</p>
      </GlassPanel>
      <div className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <div className="table-scroll">
        <table className="table" aria-label="runs table">
          <thead>
            <tr>
              <th>time</th>
              <th>project</th>
              <th>plan</th>
              <th>agent</th>
              <th>provider</th>
              <th>model</th>
              <th>verdict</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((row) => (
              <tr key={`${row.timestamp}-${row.project}-${row.plan_key}-${row.agent}`}>
                <td>{row.timestamp}</td>
                <td>{row.project}</td>
                <td>{row.plan_key}</td>
                <td>{row.agent}</td>
                <td>{row.provider}</td>
                <td>{row.model}</td>
                <td>{row.verdict}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7}>No runs loaded yet (empty feed or missing DB).</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}

export const Route = createFileRoute('/runs')({
  component: RunsPlaceholder,
});
