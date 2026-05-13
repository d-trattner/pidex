import { useMemo, useState } from 'react';

import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type ForecastStatus = 'forecast-hit-before-reset' | 'forecast-safe-until-reset' | 'insufficient-data' | 'unknown-limit';

type LimitRecord = {
  provider: string;
  window?: string | null;
  limit_name?: string | null;
  metered_feature?: string | null;
  used_percent?: number | null;
  usage?: number | null;
  resets_at?: string | null;
  captured_at?: string | null;
  plan?: string | null;
  status?: string | null;
  limit_reached?: boolean | null;
  allowed?: boolean | null;
  cost?: number | null;
  error?: string | null;
  burn_percent_per_hour?: number | null;
  projected_exhaustion_at?: string | null;
  projected_before_reset?: boolean | null;
  forecast_confidence?: string | null;
  forecast_points?: number | null;
  forecast_span_hours?: number | null;
  hours_to_exhaustion?: number | null;
  hours_until_reset?: number | null;
  forecast_status?: ForecastStatus;
};

type LimitsPayload = {
  profiles: string[];
  active_profile: string;
  limits?: LimitRecord[];
  records?: LimitRecord[];
  history?: LimitRecord[];
};

type ChartPoint = {
  ts: number;
  label: string;
  used_percent: number;
};

const PROVIDERS = [
  { key: 'codex', title: 'Codex' },
  { key: 'codex-spark', title: 'Codex Spark' },
];

const WINDOWS = [
  { key: 'five_hour', label: '5-hour quota' },
  { key: 'seven_day', label: '7-day quota' },
];

function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`;
  if (hours >= 48) {
    const days = Math.round(hours / 24);
    return `~${days} days`;
  }
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes ? `${whole}h ${minutes}m` : `${whole}h`;
}

function hoursUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (ts - Date.now()) / 3600000);
}

function forecastStatus(record: LimitRecord | undefined): ForecastStatus {
  if (!record) return 'unknown-limit';
  if (record.forecast_status) return record.forecast_status;
  if (record.used_percent == null || !record.resets_at) return 'unknown-limit';
  if (record.forecast_confidence === 'none') return 'insufficient-data';
  return record.projected_before_reset ? 'forecast-hit-before-reset' : 'forecast-safe-until-reset';
}

function forecastLabel(record: LimitRecord | undefined): string {
  switch (forecastStatus(record)) {
    case 'forecast-hit-before-reset':
      return 'limit risk';
    case 'forecast-safe-until-reset':
      return 'safe';
    case 'insufficient-data':
      return 'learning';
    case 'unknown-limit':
    default:
      return 'unknown';
  }
}

function statusColor(record: LimitRecord | undefined): string {
  const status = String(record?.status || '').toLowerCase();
  const forecast = forecastStatus(record);
  if (status === 'danger' || status === 'bad' || record?.limit_reached || forecast === 'forecast-hit-before-reset') return 'var(--bad)';
  if (status === 'warning' || status === 'warn' || (record?.used_percent ?? 0) >= 75) return 'var(--warn)';
  if (!record || record.used_percent == null || forecast === 'unknown-limit') return 'var(--muted)';
  return 'var(--good)';
}

function WindowProgress({ record, label }: { record?: LimitRecord; label: string }) {
  const used = record?.used_percent;
  const hasUsage = used != null && Number.isFinite(Number(used));
  const percent = clampPercent(used);
  const remaining = hasUsage ? Math.max(0, 100 - Number(used)) : null;
  const color = statusColor(record);
  const resetHours = hoursUntil(record?.resets_at);
  const accessible = hasUsage
    ? `${label}: ${used}% used, reset at ${record?.resets_at || 'unknown'}, forecast ${forecastLabel(record)}`
    : `${label}: usage unavailable, reset at ${record?.resets_at || 'unknown'}, forecast unknown`;

  return (
    <div className="limit-window" aria-label={accessible}>
      <div className="limit-window__head">
        <strong>{label}</strong>
        <span className="pill" style={{ color }}>{hasUsage ? `${used}%` : 'unknown'}</span>
      </div>
      <div className="limit-progress" aria-hidden="true">
        <div className="limit-progress__fill" style={{ width: `${percent}%`, background: color }} />
      </div>
      <p className="muted" style={{ margin: '8px 0 0' }}>
        Reset: <strong>{formatDateTime(record?.resets_at)}</strong>
      </p>
      <p className="muted" style={{ margin: '4px 0 0', paddingLeft: 44 }}>
        {formatDuration(resetHours)}
      </p>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        Forecast: <strong>{forecastLabel(record)}</strong>
      </p>
      {record?.projected_exhaustion_at ? (
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Projected 100%: {formatDateTime(record.projected_exhaustion_at)} · in {formatDuration(record.hours_to_exhaustion)}
        </p>
      ) : null}
      {record?.error ? <p style={{ color: 'var(--bad)', margin: '6px 0 0' }}>{record.error}</p> : null}
    </div>
  );
}

function chartData(provider: string, current: LimitRecord | undefined, history: LimitRecord[] | undefined): ChartPoint[] {
  if (!current) return [];
  const rows = (history || [])
    .filter((row) => row.provider === provider && row.window === current.window && row.resets_at === current.resets_at)
    .filter((row) => row.used_percent != null && row.captured_at)
    .map((row) => {
      const ts = new Date(String(row.captured_at)).getTime();
      return Number.isFinite(ts) ? { ts, label: formatDateTime(row.captured_at), used_percent: Number(row.used_percent) } : null;
    })
    .filter(Boolean) as ChartPoint[];

  const now = new Date(current.captured_at || new Date()).getTime();
  if (current.used_percent != null && Number.isFinite(now)) {
    rows.push({ ts: now, label: formatDateTime(current.captured_at || new Date().toISOString()), used_percent: Number(current.used_percent) });
  }

  const byTs = new Map<number, ChartPoint>();
  for (const row of rows) byTs.set(Math.floor(row.ts / 1000) * 1000, row);
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

function ProviderChart({ provider, current, history }: { provider: string; current?: LimitRecord; history?: LimitRecord[] }) {
  const data = useMemo(() => chartData(provider, current, history), [provider, current, history]);
  const projectedTs = current?.projected_exhaustion_at ? new Date(current.projected_exhaustion_at).getTime() : null;
  const hasProjectedMarker = projectedTs && Number.isFinite(projectedTs) && current?.projected_before_reset;

  if (!current) {
    return <p className="muted">No 7-day record available for chart.</p>;
  }

  if (data.length < 2) {
    return <p className="muted">Not enough current-window history for a 7-day usage chart yet.</p>;
  }

  return (
    <div className="limit-chart" role="img" aria-label={`${provider} 7-day quota usage chart`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 18, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid stroke="rgba(34, 255, 225, 0.14)" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value) => formatDateTime(new Date(Number(value)).toISOString())}
            stroke="var(--muted)"
            minTickGap={24}
          />
          <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} stroke="var(--muted)" />
          <Tooltip
            contentStyle={{ background: 'rgba(3, 8, 20, 0.96)', border: '1px solid rgba(34, 255, 225, 0.24)', color: 'var(--text)' }}
            labelFormatter={(value) => formatDateTime(new Date(Number(value)).toISOString())}
            formatter={(value) => [`${value}%`, 'used']}
          />
          <ReferenceLine y={100} stroke="var(--bad)" strokeDasharray="4 4" label="100%" />
          {hasProjectedMarker ? <ReferenceLine x={projectedTs as number} stroke="var(--pink)" strokeDasharray="4 4" label="forecast 100%" /> : null}
          <Line type="monotone" dataKey="used_percent" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProviderContainer({ provider, title, records, history }: { provider: string; title: string; records: LimitRecord[]; history?: LimitRecord[] }) {
  const providerRecords = records.filter((record) => record.provider === provider);
  const byWindow = new Map(providerRecords.map((record) => [record.window || '', record]));
  const sevenDay = byWindow.get('seven_day');

  if (providerRecords.length === 0) return null;

  return (
    <article className="glass-card glass provider-limit-card">
      <div className="provider-limit-card__head">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Provider-native 5-hour and 7-day quota windows.
          </p>
        </div>
        <span className="pill" style={{ color: statusColor(sevenDay || providerRecords[0]) }}>
          {sevenDay?.status || providerRecords[0]?.status || 'unknown'}
        </span>
      </div>

      <div className="limit-window-grid">
        {WINDOWS.map((windowInfo) => (
          <WindowProgress key={windowInfo.key} label={windowInfo.label} record={byWindow.get(windowInfo.key)} />
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <h4 style={{ margin: '0 0 8px' }}>7-day usage trend</h4>
        <ProviderChart provider={provider} current={sevenDay} history={history} />
      </div>
    </article>
  );
}

function LimitsPage() {
  const [busyProfile, setBusyProfile] = useState('');
  const [mutationError, setMutationError] = useState('');
  const queryClient = useQueryClient();
  const limitsQuery = useDashboardQuery<LimitsPayload>(['provider-limits'], '/api/provider-limits');
  const payload = limitsQuery.data ?? null;
  const loading = limitsQuery.isLoading;
  const error = mutationError || (limitsQuery.isError ? 'Limits could not be loaded.' : '');

  const applyProfile = async (profile: string) => {
    if (!profile) return;
    setBusyProfile(profile);
    setMutationError('');
    try {
      const resp = await fetch('/api/provider-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setMutationError(String(body?.error || 'Profile could not be applied.'));
      } else {
        await queryClient.invalidateQueries({ queryKey: ['provider-limits'] });
      }
    } catch {
      setMutationError('Profile could not be applied.');
    } finally {
      setBusyProfile('');
    }
  };

  const rows = payload?.limits?.length ? payload.limits : payload?.records || [];

  return (
    <section className="grid" style={{ marginTop: 12 }}>
      <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Limits</h2>
        <p className="muted">Provider limits by profile.</p>
      </article>

      {loading ? (
        <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
          <p className="muted">Loading limits…</p>
        </article>
      ) : (
        <>
          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3>Profile</h3>
            <p className="muted">Active profile: {payload?.active_profile || '—'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 8 }}>
              {(payload?.profiles || ['codex-optimized', 'codex-high']).map((profile: string) => {
                const active = profile === payload?.active_profile;
                return (
                  <button
                    type="button"
                    key={profile}
                    className={`glass-btn ${active ? 'active' : ''}`}
                    onClick={() => applyProfile(profile)}
                    disabled={Boolean(busyProfile) || active}
                    aria-pressed={active}
                  >
                    {busyProfile === profile ? 'Activating…' : profile}
                  </button>
                );
              })}
            </div>
            {error ? <p style={{ color: '#f8a' }}>{error}</p> : null}
          </article>

          {PROVIDERS.map((provider) => (
            <ProviderContainer
              key={provider.key}
              provider={provider.key}
              title={provider.title}
              records={rows}
              history={payload?.history}
            />
          ))}

          <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
            <h3>Limit Records</h3>
            <div className="table-scroll">
              <table className="table" aria-label="provider limits">
                <thead>
                  <tr>
                    <th>provider</th>
                    <th>window</th>
                    <th>limit</th>
                    <th>used %</th>
                    <th>forecast</th>
                    <th>burn %/h</th>
                    <th>status</th>
                    <th>resets</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record: LimitRecord) => (
                    <tr key={[record.provider, record.window, record.limit_name, String(record.resets_at)].join('|')}>
                      <td>{record.provider}</td>
                      <td>{record.window || record.limit_name || '—'}</td>
                      <td>{record.limit_name || '—'}</td>
                      <td>{record.used_percent == null ? '—' : `${record.used_percent}`}</td>
                      <td>{forecastLabel(record)}</td>
                      <td>{record.burn_percent_per_hour == null ? '—' : record.burn_percent_per_hour}</td>
                      <td>{record.status || '—'}</td>
                      <td>{record.resets_at || '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8}>No limits available.</td>
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

export const Route = createFileRoute('/limits')({
  component: LimitsPage,
});
