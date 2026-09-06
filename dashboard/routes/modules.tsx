import { createFileRoute } from '@tanstack/react-router';
import { Boxes, CheckCircle2, CircleSlash, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { GlassPanel } from '../components/ui/glass-panel';
import { LoadingIndicator } from '../components/ui/loading-indicator';
import { MetricTile } from '../components/ui/metric-tile';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type ModulePayload = {
  ok: boolean;
  runtime_root: string;
  revision: string;
  actions_enabled: boolean;
  totals: { modules: number; enabled: number; capabilities: number };
  modules: Array<{
    id: string;
    name: string;
    kind: string;
    enabled: boolean;
    locked: boolean;
    controllable: boolean;
    source: string;
    skill_resource: { skills: string[]; registration: 'unverified' } | null;
    dependencies: string[];
    capabilities: Array<{
      id: string;
      kind: string;
      phases: string[];
      importance: string;
      scope: string;
      latest_evidence: { status?: string; exit_code?: number; ended_at?: string } | null;
    }>;
  }>;
};

function ModulesPage() {
  const query = useDashboardQuery<ModulePayload>(['modules'], '/api/modules');
  const data = query.data;
  const modules = data?.modules || [];
  const locked = modules.filter((module) => module.locked).length;
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [token, setToken] = useState('');

  const postAction = async (moduleId: string, action: 'enable' | 'disable', cascade = false, dryRun = false) => {
    if (!data) return null;
    const response = await fetch('/api/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': globalThis.crypto?.randomUUID?.() || `module-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, module_id: moduleId, cascade, dry_run: dryRun, expected_revision: data.revision, confirm: !dryRun }),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Module action failed.'), { code: payload.code });
    return payload as { actions: Array<{ moduleId: string }>; reload_required: boolean };
  };

  const control = async (moduleId: string, action: 'enable' | 'disable') => {
    setPending(moduleId); setNotice(null);
    try {
      let cascade = false; let preview;
      try { preview = await postAction(moduleId, action, false, true); }
      catch (error) {
        if ((error as { code?: string }).code !== 'DEPENDENTS_ENABLED' || !window.confirm(`${(error as Error).message}\n\nDisable dependents too?`)) throw error;
        cascade = true; preview = await postAction(moduleId, action, true, true);
      }
      const affected = preview?.actions.map((item) => item.moduleId).join(', ') || moduleId;
      if (!window.confirm(`${action === 'enable' ? 'Enable' : 'Disable'} ${affected}?${cascade ? '\nThis cascades to dependent modules.' : ''}`)) return;
      const result = await postAction(moduleId, action, cascade, false);
      setNotice({ kind: 'ok', text: `${action === 'enable' ? 'Enabled' : 'Disabled'}: ${affected}.${result?.reload_required ? ' Run /reload in Pi; package registration is not independently attested yet.' : ''}` });
      await query.refetch();
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Module action failed.' }); }
    finally { setPending(null); }
  };

  return (
    <section className="grid overview-grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card overview-hero" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Modules</h2>
        <p className="muted">PIDEX module status, capability ownership, and guarded local activation.</p>
        {data?.runtime_root ? <p className="muted">Runtime root: <code>{data.runtime_root}</code></p> : null}
        {!data?.actions_enabled ? <p className="muted">Module actions are disabled. Set <code>PIDEX_MODULE_ACTIONS_ENABLED=1</code> and restart the dashboard to opt in.</p> : null}
        {data?.actions_enabled ? <label className="muted">Operator action token (session only): <input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" /></label> : null}
        {notice ? <p role="status" style={{ color: notice.kind === 'error' ? 'var(--danger)' : 'var(--success)' }}>{notice.text}</p> : null}
      </GlassPanel>

      {query.isLoading ? (
        <LoadingIndicator label="Loading modules…" />
      ) : (
        <>
          <MetricTile title="Modules" value={String(data?.totals.modules || 0)} subtitle="discovered manifests" icon={<Boxes size={18} />} />
          <MetricTile title="Enabled" value={String(data?.totals.enabled || 0)} subtitle="active modules" icon={<CheckCircle2 size={18} />} />
          <MetricTile title="Capabilities" value={String(data?.totals.capabilities || 0)} subtitle="declared actions/checks" icon={<ShieldCheck size={18} />} />
          <MetricTile title="Locked" value={String(locked)} subtitle="core-required modules" icon={<Lock size={18} />} />

          <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h3 className="h3">Module inventory</h3>
            {modules.length === 0 ? (
              <p className="muted">No modules discovered.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table" style={{ minWidth: 1000 }}>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Kind</th>
                      <th>Status</th>
                      <th>Capabilities</th>
                      <th>Dependencies</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((module) => (
                      <tr key={module.id}>
                        <td><strong>{module.id}</strong><br /><span className="muted">{module.name}</span></td>
                        <td>{module.kind}</td>
                        <td>{module.enabled ? 'enabled' : 'disabled'} · {module.locked ? 'locked' : module.source}</td>
                        <td>{module.capabilities.length}</td>
                        <td>{module.dependencies.length ? module.dependencies.join(', ') : '—'}</td>
                        <td>{module.controllable && data?.actions_enabled ? <button className="button" type="button" disabled={pending !== null} onClick={() => control(module.id, module.enabled ? 'disable' : 'enable')}>{pending === module.id ? 'Working…' : module.enabled ? 'Disable' : 'Enable'}</button> : module.locked ? 'Locked' : 'Actions off'}{module.skill_resource ? <><br /><span className="muted">Pi registration: unverified</span></> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h3 className="h3">Capabilities</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {modules.flatMap((module) => module.capabilities.map((capability) => (
                <div key={`${module.id}:${capability.id}`} className="metric-tile">
                  <div className="metric-icon">{capability.latest_evidence?.status === 'passed' ? <CheckCircle2 size={18} /> : <CircleSlash size={18} />}</div>
                  <div>
                    <div className="metric-title">{capability.id}</div>
                    <div className="metric-value" style={{ fontSize: 16 }}>{capability.importance}</div>
                    <div className="metric-subtitle">
                      {module.id} · {capability.phases.join(', ')} · latest: {capability.latest_evidence?.status || 'none'}
                    </div>
                  </div>
                </div>
              ))) }
            </div>
          </GlassPanel>
        </>
      )}
    </section>
  );
}

export const Route = createFileRoute('/modules')({
  component: ModulesPage,
});
