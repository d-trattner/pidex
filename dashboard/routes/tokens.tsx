import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router';

import { LoadingIndicator } from '../components/ui/loading-indicator';
import { readPageForKey, readProjectFromSearch, setPageForKey, withProjectParam } from '../lib/client/project-query';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

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

function formatNumber(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function formatDate(value: unknown): string {
  if (!value) return '—';
  const dt = new Date(String(value));
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function formatMonth(value: unknown): string {
  if (!value) return '—';
  const dt = new Date(`${String(value)}-01T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function TokensPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const project = readProjectFromSearch(location.search);
  const weekPage = readPageForKey(location.search, 'page_week');
  const monthPage = readPageForKey(location.search, 'page_month');
  const weeklyQuery = useDashboardQuery<TokenPayload>(['tokens', 'week', project, weekPage], withProjectParam(`/api/token-consumption?granularity=week&page=${weekPage}`, project));
  const monthlyQuery = useDashboardQuery<TokenPayload>(['tokens', 'month', project, monthPage], withProjectParam(`/api/token-consumption?granularity=month&page=${monthPage}`, project));
  const payload = weeklyQuery.data && monthlyQuery.data
    ? {
        agent_stats: weeklyQuery.data.agent_stats,
        chart_agents: weeklyQuery.data.chart_agents,
        weekly: weeklyQuery.data.weekly,
        monthly: monthlyQuery.data.monthly,
      }
    : null;
  const loading = weeklyQuery.isLoading || monthlyQuery.isLoading;

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
        <LoadingIndicator label="Loading token usage…" />
      ) : (
        <>
          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3>Top agents (all time)</h3>
            <div className="table-scroll">
            <table className="table" aria-label="agent token stats">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Calls</th>
                  <th>Total Tokens</th>
                  <th>Avg Tokens</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.agent_stats || []).map((row) => (
                  <tr key={`${row.agent}`}>
                    <td>{row.agent}</td>
                    <td>{formatNumber(row.calls)}</td>
                    <td>{formatNumber(row.total_tokens)}</td>
                    <td>{formatNumber(row.avg_tokens)}</td>
                    <td>{formatNumber(row.total_input_tokens)}</td>
                    <td>{formatNumber(row.total_output_tokens)}</td>
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
            <div className="container-titlebar">
              <h3>Weekly view</h3>
              <div className="container-titlebar-actions">
                <button type="button" className="glass-btn" disabled={!payload?.weekly.has_newer} onClick={() => goPage('page_week', weekPage - 1)}>Newer</button>
                <button type="button" className="glass-btn" disabled={!payload?.weekly.has_older} onClick={() => goPage('page_week', weekPage + 1)}>Older</button>
              </div>
            </div>
            <p className="muted">Range: {payload?.weekly.start || '—'} to {payload?.weekly.end || '—'}</p>
            <div className="table-scroll">
              <table className="table" aria-label="token weekly">
                <thead>
                  <tr>
                    <th>Day</th>
                    {payload?.weekly.agent_stats?.map((agent) => <th key={`h-${agent}`}>{agent}</th>)}
                    <th>Total Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload?.weekly.rows || []).map((row) => {
                    const day = String(row.day || row.label || '');
                    const total = Number(row.total_tokens || 0);
                    return (
                      <tr key={`w-${day}`}>
                        <td>{formatDate(day)}</td>
                        {(payload?.weekly.agent_stats || []).map((agent) => (
                          <td key={`${day}-${agent}`}>{formatNumber(row[agent] || 0)}</td>
                        ))}
                        <td>{formatNumber(total)}</td>
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
            <div className="container-titlebar">
              <h3>Monthly view</h3>
              <div className="container-titlebar-actions">
                <button type="button" className="glass-btn" disabled={!payload?.monthly.has_newer} onClick={() => goPage('page_month', monthPage - 1)}>Newer</button>
                <button type="button" className="glass-btn" disabled={!payload?.monthly.has_older} onClick={() => goPage('page_month', monthPage + 1)}>Older</button>
              </div>
            </div>
            <p className="muted">Window start: {payload?.monthly.start || '—'} ({payload?.monthly.window || 12} months)</p>
            <div className="table-scroll">
              <table className="table" aria-label="token monthly">
                <thead>
                  <tr>
                    <th>Month</th>
                    {payload?.weekly.agent_stats?.map((agent) => <th key={`mh-${agent}`}>{agent}</th>)}
                    <th>Total Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload?.monthly.rows || []).map((row) => {
                    const month = String(row.month || row.label || '');
                    const total = Number(row.total_tokens || 0);
                    return (
                      <tr key={`m-${month}`}>
                        <td>{formatMonth(month)}</td>
                        {(payload?.weekly.agent_stats || []).map((agent) => (
                          <td key={`${month}-${agent}`}>{formatNumber(row[agent] || 0)}</td>
                        ))}
                        <td>{formatNumber(total)}</td>
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
