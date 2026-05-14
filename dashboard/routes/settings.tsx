import { createFileRoute } from '@tanstack/react-router';
import { Gauge, RefreshCcw, Settings as SettingsIcon } from 'lucide-react';

import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type LimitsPayload = {
  active_profile?: string;
  profiles?: string[];
  limits?: Array<{ provider?: string; window?: string; used_percent?: number | null; captured_at?: string | null }>;
  records?: Array<{ provider?: string; window?: string; used_percent?: number | null; captured_at?: string | null }>;
};

function newestCapture(rows: Array<{ captured_at?: string | null }>): string {
  const newest = rows
    .map((row) => row.captured_at ? new Date(row.captured_at).getTime() : 0)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];
  return newest ? new Date(newest).toLocaleString() : '—';
}

function SettingsPage() {
  const limitsQuery = useDashboardQuery<LimitsPayload>(['provider-limits', 'settings'], '/api/provider-limits');
  const payload = limitsQuery.data;
  const records = payload?.limits?.length ? payload.limits : payload?.records || [];

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Settings</h2>
        <p className="muted">Operational dashboard configuration and provider profile state.</p>
      </article>

      <article className="glass-card glass">
        <div className="metric-tile-head">
          <span className="metric-icon" aria-hidden="true"><SettingsIcon size={18} /></span>
          <h3>Active Profile</h3>
        </div>
        <div className="metric-value" style={{ fontSize: '1.25rem' }}>{payload?.active_profile || '—'}</div>
        <p className="muted">Profile switching remains available on Usage.</p>
      </article>

      <article className="glass-card glass">
        <div className="metric-tile-head">
          <span className="metric-icon" aria-hidden="true"><Gauge size={18} /></span>
          <h3>Profiles</h3>
        </div>
        <div className="metric-value">{payload?.profiles?.length ?? '—'}</div>
        <p className="muted">Configured PIDEX routing profiles.</p>
      </article>

      <article className="glass-card glass">
        <div className="metric-tile-head">
          <span className="metric-icon" aria-hidden="true"><RefreshCcw size={18} /></span>
          <h3>Limit Refresh</h3>
        </div>
        <div className="metric-value" style={{ fontSize: '1.1rem' }}>{newestCapture(records)}</div>
        <p className="muted">Provider limits auto-refresh when stale.</p>
      </article>
    </section>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});
