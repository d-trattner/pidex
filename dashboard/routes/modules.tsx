import { createFileRoute } from '@tanstack/react-router';
import { Boxes, CheckCircle2, CircleSlash, Lock, ShieldCheck } from 'lucide-react';

import { GlassPanel } from '../components/ui/glass-panel';
import { LoadingIndicator } from '../components/ui/loading-indicator';
import { MetricTile } from '../components/ui/metric-tile';
import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type ModulePayload = {
  ok: boolean;
  runtime_root: string;
  totals: { modules: number; enabled: number; capabilities: number };
  modules: Array<{
    id: string;
    name: string;
    kind: string;
    enabled: boolean;
    locked: boolean;
    source: string;
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

  return (
    <section className="grid overview-grid" style={{ marginTop: 12 }}>
      <GlassPanel className="glass-card overview-hero" style={{ gridColumn: '1 / -1' }}>
        <h2 className="h2">Modules</h2>
        <p className="muted">Read-only PIDEX module status, capability ownership, and latest runner evidence.</p>
        {data?.runtime_root ? <p className="muted">Runtime root: <code>{data.runtime_root}</code></p> : null}
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
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Kind</th>
                      <th>Status</th>
                      <th>Capabilities</th>
                      <th>Dependencies</th>
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
