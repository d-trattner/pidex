import { useEffect, useState } from 'react';

import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router';

import { readPageForKey, readProjectFromSearch, setPageForKey, withProjectParam } from '../lib/client/project-query';

type AgentTokenStat = {
  agent: string;
  calls: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_tokens: number;
};

type WeeklyPayload = {
  start: string | null;
  end: string | null;
  rows: Array<Record<string, number | string | null>>;
  has_older: boolean;
  has_newer: boolean;
  page: number;
  days: string[];
  agent_stats: string[];
};

type MonthlyPayload = {
  start: string | null;
  rows: Array<Record<string, number | string | null>>;
  months: string[];
  has_older: boolean;
  has_newer: boolean;
  page: number;
  window: number;
};

type TokenPayload = {
  agent_stats: AgentTokenStat[];
  chart_agents: string[];
  weekly: WeeklyPayload;
  monthly: MonthlyPayload;
};

function TokensPage() {
  const [payload, setPayload] = useState<TokenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const project = readProjectFromSearch(location.search);
  const weekPage = readPageForKey(location.search, 'page_week');
  const monthPage = readPageForKey(location.search, 'page_month');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch(withProjectParam(`/api/token-consumption?granularity=week&page=${weekPage}`, project)).then((res) => res.json()),
      fetch(withProjectParam(`/api/token-consumption?granularity=month&page=${monthPage}`, project)).then((res) => res.json()),
    ])
      .then(([weeklyJson, monthlyJson]) => {
        if (!mounted) return;
        const weeklyPayload = weeklyJson && typeof weeklyJson === 'object' ? (weeklyJson as TokenPayload) : null;
        const monthlyPayload = monthlyJson && typeof monthlyJson === 'object' ? (monthlyJson as TokenPayload) : null;
        if (!weeklyPayload || !monthlyPayload) {
          setPayload(null);
          return;
        }
        setPayload({
          agent_stats: weeklyPayload.agent_stats,
          chart_agents: weeklyPayload.chart_agents,
          weekly: weeklyPayload.weekly,
          monthly: monthlyPayload.monthly,
        });
      })
      .catch(() => {
        if (!mounted) return;
        setPayload(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [monthPage, project, weekPage]);

  const goPage = (key: 'page_week' | 'page_month', nextPage: number) => {
    const nextSearch = setPageForKey(location.search, key, nextPage);
    void navigate({ href: `${location.pathname}${nextSearch}` });
  };

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Tokens</h2>
        <p className="muted">Token consumption by agent and time window.</p>
      </article>

      {loading ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p className="muted">Loading data…</p>
        </article>
      ) : (
        <>
          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3>Top agents (all time)</h3>
            <div className="table-scroll">
            <table className="table" aria-label="agent token stats">
              <thead>
                <tr>
                  <th>agent</th>
                  <th>calls</th>
                  <th>total tokens</th>
                  <th>avg tokens</th>
                  <th>input</th>
                  <th>output</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.agent_stats || []).map((row) => (
                  <tr key={`${row.agent}`}>
                    <td>{row.agent}</td>
                    <td>{row.calls}</td>
                    <td>{row.total_tokens}</td>
                    <td>{row.avg_tokens}</td>
                    <td>{row.total_input_tokens}</td>
                    <td>{row.total_output_tokens}</td>
                  </tr>
                ))}
                {(payload?.agent_stats || []).length === 0 && (
                  <tr>
                    <td colSpan={6}>No token data found.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3>Weekly view</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="glass-btn" disabled={!payload?.weekly.has_newer} onClick={() => goPage('page_week', weekPage - 1)}>Newer</button>
                <button type="button" className="glass-btn" disabled={!payload?.weekly.has_older} onClick={() => goPage('page_week', weekPage + 1)}>Older</button>
              </div>
            </div>
            <p className="muted">Range: {payload?.weekly.start || '—'} to {payload?.weekly.end || '—'}</p>
            <div className="table-scroll">
              <table className="table" aria-label="token weekly">
                <thead>
                  <tr>
                    <th>day</th>
                    {payload?.weekly.agent_stats?.map((agent) => <th key={`h-${agent}`}>{agent}</th>)}
                    <th>total</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload?.weekly.rows || []).map((row) => {
                    const day = String(row.day || row.label || '');
                    const total = Number(row.total_tokens || 0);
                    return (
                      <tr key={`w-${day}`}>
                        <td>{day}</td>
                        {(payload?.weekly.agent_stats || []).map((agent) => (
                          <td key={`${day}-${agent}`}>{Number(row[agent] || 0)}</td>
                        ))}
                        <td>{total}</td>
                      </tr>
                    );
                  })}
                  {(payload?.weekly.rows || []).length === 0 && (
                    <tr>
                      <td colSpan={(payload?.weekly.agent_stats?.length || 0) + 2}>No weekly rows.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3>Monthly view</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="glass-btn" disabled={!payload?.monthly.has_newer} onClick={() => goPage('page_month', monthPage - 1)}>Newer</button>
                <button type="button" className="glass-btn" disabled={!payload?.monthly.has_older} onClick={() => goPage('page_month', monthPage + 1)}>Older</button>
              </div>
            </div>
            <p className="muted">Window start: {payload?.monthly.start || '—'} ({payload?.monthly.window || 12} months)</p>
            <div className="table-scroll">
              <table className="table" aria-label="token monthly">
                <thead>
                  <tr>
                    <th>month</th>
                    {payload?.weekly.agent_stats?.map((agent) => <th key={`mh-${agent}`}>{agent}</th>)}
                    <th>total</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload?.monthly.rows || []).map((row) => {
                    const month = String(row.month || row.label || '');
                    const total = Number(row.total_tokens || 0);
                    return (
                      <tr key={`m-${month}`}>
                        <td>{month}</td>
                        {(payload?.weekly.agent_stats || []).map((agent) => (
                          <td key={`${month}-${agent}`}>{Number(row[agent] || 0)}</td>
                        ))}
                        <td>{total}</td>
                      </tr>
                    );
                  })}
                  {(payload?.monthly.rows || []).length === 0 && (
                    <tr>
                      <td colSpan={(payload?.weekly.agent_stats?.length || 0) + 2}>No monthly rows.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

export const Route = createFileRoute('/tokens')({
  component: TokensPage,
});
