import { useEffect, useState } from 'react';

import { createFileRoute } from '@tanstack/react-router';

type LimitRecord = {
  provider: string;
  window?: string | null;
  limit_name?: string | null;
  used_percent?: number | null;
  usage?: number | null;
  resets_at?: string | null;
  plan?: string | null;
  status?: string | null;
  limit_reached?: boolean | null;
  cost?: number | null;
};

type LimitsPayload = {
  profiles: string[];
  active_profile: string;
  limits?: LimitRecord[];
  records?: LimitRecord[];
};

function LimitsPage() {
  const [payload, setPayload] = useState<LimitsPayload | null>(null);
  const [busyProfile, setBusyProfile] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setError('');
    setLoading(true);
    try {
      const payloadRaw = await (await fetch('/api/provider-limits')).json();
      if (!payloadRaw || typeof payloadRaw !== 'object') {
        setPayload(null);
        return;
      }
      const next = payloadRaw as LimitsPayload;
      setPayload(next);
    } catch {
      setError('Limits could not be loaded.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const applyProfile = async (profile: string) => {
    if (!profile) return;
    setBusyProfile(profile);
    setError('');
    try {
      const resp = await fetch('/api/provider-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(String(body?.error || 'Profile could not be applied.'));
      } else {
        await refresh();
      }
    } catch {
      setError('Profile could not be applied.');
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
                    className="glass-btn"
                    onClick={() => applyProfile(profile)}
                    disabled={Boolean(busyProfile) || active}
                    aria-pressed={active}
                  >
                    {busyProfile === profile ? 'Activating…' : active ? `${profile} active` : `Activate ${profile}`}
                  </button>
                );
              })}
            </div>
            {error ? <p style={{ color: '#f8a' }}>{error}</p> : null}
          </article>

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
                    <th>usage</th>
                    <th>cost</th>
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
                      <td>{record.usage == null ? '—' : record.usage}</td>
                      <td>{record.cost == null ? '—' : record.cost}</td>
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
