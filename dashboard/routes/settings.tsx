import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, Coins, Gauge, RefreshCcw, Settings as SettingsIcon, ToggleLeft, ToggleRight, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useDashboardQuery } from '../lib/client/use-dashboard-query';

type LimitsPayload = {
  active_profile?: string;
  profiles?: string[];
  limits?: Array<{ provider?: string; window?: string; used_percent?: number | null; captured_at?: string | null }>;
  records?: Array<{ provider?: string; window?: string; used_percent?: number | null; captured_at?: string | null }>;
};

type ProviderModel = { provider: string; model: string; id: string; label: string; authenticated?: boolean; auth_reason?: string };
type ParallelProviderModel = { laneId?: string; provider: string; model: string; effort?: string; enabled?: boolean; lastStatus?: string | null; warningActive?: boolean; warningType?: string | null; lastMessage?: string | null; lastAttemptAt?: string | null; lastSuccessAt?: string | null; lastFailureAt?: string | null };
type ParallelAgent = { agent: string; enabled: boolean; trigger?: string | null; mode?: string; timeoutSeconds?: number; notifyOnUnavailable?: boolean; providerModels: ParallelProviderModel[] };
type ParallelPayload = { ok: boolean; enabled: boolean; agents: ParallelAgent[]; warnings: unknown[]; updatedAt?: string | null };
type ModelsPayload = { ok: boolean; models: ProviderModel[]; source?: string };
type BalanceSnapshot = { kind: 'balance_update' | 'balance_top_up'; balance_usd: number; captured_at: string };
type BalanceProvider = { provider: string; label: string; latest_balance_usd: number | null; estimated_current_balance_usd: number | null; confidence: string; learned_intervals: number; days_remaining: number | null; snapshots: BalanceSnapshot[] };
type BalancesPayload = { ok: boolean; providers: BalanceProvider[]; config?: { providers?: Array<{ provider: string; label?: string }> } };
type ContractGovernorConfig = { enabled?: boolean; mode?: string; hot_mode?: boolean; auto_apply?: string; agent_enabled?: boolean; model?: string | null; escalation_model?: string | null; effort?: string; timeout_seconds?: number; max_cost_usd_per_run?: number; max_proposals_per_run?: number; monitoring_window_reports?: number };
type ContractGovernorPayload = { ok: boolean; effective_config: ContractGovernorConfig; local_config_exists: boolean; runs: Array<Record<string, any>>; pending: Array<Record<string, any>>; approved: Array<Record<string, any>> };

function newestCapture(rows: Array<{ captured_at?: string | null }>): string {
  const newest = rows
    .map((row) => row.captured_at ? new Date(row.captured_at).getTime() : 0)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];
  return newest ? new Date(newest).toLocaleString() : '—';
}

function toConfig(enabled: boolean, agents: ParallelAgent[]) {
  return {
    schema_version: 1,
    enabled,
    default_mode: 'opportunistic',
    dedupe_hours: 6,
    max_provider_models_per_agent: 2,
    agents: Object.fromEntries(agents.map((agent) => [agent.agent, {
      enabled: agent.enabled,
      trigger: agent.trigger || (agent.agent === 'pidex-critic' ? 'after-plan' : 'after-implementation'),
      mode: agent.mode || 'opportunistic',
      timeout_seconds: Number(agent.timeoutSeconds || 600),
      notify_on_unavailable: agent.notifyOnUnavailable ?? true,
      provider_models: agent.providerModels.slice(0, 2).filter((pm) => pm.provider && pm.model).map((pm) => ({ provider: pm.provider, model: pm.model, effort: pm.effort || 'medium', enabled: true })),
    }]))
  };
}

function ToggleCard({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const Icon = active ? ToggleRight : ToggleLeft;
  return (
    <button className={`toggle-card${active ? ' active' : ''}`} type="button" onClick={onClick} aria-pressed={active}>
      <Icon size={24} />
      <span>{label}</span>
    </button>
  );
}

function InfoPill({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`settings-info-pill${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ParallelAgentsCard() {
  const parallelQuery = useDashboardQuery<ParallelPayload>(['parallel-agents'], '/api/parallel-agents');
  const modelsQuery = useDashboardQuery<ModelsPayload>(['parallel-agent-models'], '/api/parallel-agents/models');
  const [enabled, setEnabled] = useState(false);
  const [agents, setAgents] = useState<ParallelAgent[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (parallelQuery.data) {
      setEnabled(Boolean(parallelQuery.data.enabled));
      setAgents(parallelQuery.data.agents || []);
      hydratedRef.current = true;
    }
  }, [parallelQuery.data]);

  const warnings = parallelQuery.data?.warnings?.length || 0;
  const laneCount = agents.reduce((sum, agent) => sum + agent.providerModels.length, 0);
  const modelOptions = modelsQuery.data?.models || [];

  const modelIds = useMemo(() => modelOptions.map((model) => model.id), [modelOptions]);
  const authenticatedModelIds = useMemo(() => new Set(modelOptions.filter((model) => model.authenticated).map((model) => model.id)), [modelOptions]);
  const configValid = useMemo(() => {
    if (!hydratedRef.current) return false;
    if (!enabled) return true;
    return agents.every((agent) => {
      if (!agent.enabled) return true;
      const lanes = agent.providerModels;
      if (lanes.length < 1 || lanes.length > 2) return false;
      return lanes.every((pm) => {
        const id = pm.provider && pm.model ? `${pm.provider}/${pm.model}` : '';
        return Boolean(id) && (authenticatedModelIds.size === 0 || authenticatedModelIds.has(id));
      });
    });
  }, [agents, authenticatedModelIds, enabled]);

  const updateAgent = (agentName: string, patch: Partial<ParallelAgent>) => setAgents((current) => current.map((agent) => agent.agent === agentName ? { ...agent, ...patch } : agent));
  const updateModel = (agentName: string, index: number, patch: Partial<ParallelProviderModel>) => setAgents((current) => current.map((agent) => {
    if (agent.agent !== agentName) return agent;
    const next = [...agent.providerModels];
    next[index] = { ...next[index], ...patch };
    return { ...agent, providerModels: next };
  }));

  const save = async (showSuccess = true) => {
    if (!configValid) {
      setMessage('Select authenticated provider/model pairs before auto-save.');
      return;
    }
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/parallel-agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save-config', config: toConfig(enabled, agents) }) });
      if (!response.ok) throw new Error(await response.text());
      if (showSuccess) {
        setMessage('Parallel agent config saved.');
        await parallelQuery.refetch();
      } else {
        setMessage('');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (!configValid) {
      setMessage('Select authenticated provider/model pairs before auto-save.');
      return;
    }
    setMessage('Auto-save pending…');
    saveTimerRef.current = window.setTimeout(() => { void save(false); }, 700);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [enabled, agents, configValid]);

  const clearWarning = async (laneId?: string) => {
    if (!laneId) return;
    await fetch('/api/parallel-agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear', laneId }) });
    await parallelQuery.refetch();
  };

  return (
    <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
      <div className="metric-tile-head">
        <span className="metric-icon" aria-hidden="true"><Users size={18} /></span>
        <h3>Parallel Agents</h3>
      </div>

      <div className="parallel-agents-grid">
        <div className="glass-card parallel-status-card" style={{ padding: 14 }}>
          <h4>Parallel Agents Status</h4>
          <ToggleCard active={enabled} label={enabled ? 'Parallel agents enabled' : 'Parallel agents disabled'} onClick={() => setEnabled(!enabled)} />
          <div className="settings-info-grid">
            <InfoPill label="Agents" value={agents.length} />
            <InfoPill label="Provider/model lanes" value={laneCount} />
            <InfoPill label="Warnings" value={warnings} tone={warnings > 0 ? 'warn' : 'ok'} />
            <InfoPill label="Models" value={modelOptions.length || '—'} />
            <InfoPill label="Source" value={modelsQuery.data?.source || 'loading'} />
            <InfoPill label="Authenticated" value={modelOptions.filter((model) => model.authenticated).length} tone="ok" />
          </div>
          {warnings > 0 ? <div className="settings-warning active"><AlertTriangle size={14} /> Active warning present</div> : <div className="settings-warning">No active warnings.</div>}
        </div>

        {enabled ? agents.map((agent) => (
          <div key={agent.agent} className="glass-card parallel-agent-card" style={{ padding: 14 }}>
            <h4>{agent.agent}</h4>
            <ToggleCard active={agent.enabled} label={agent.enabled ? `${agent.agent} enabled` : `${agent.agent} disabled`} onClick={() => updateAgent(agent.agent, { enabled: !agent.enabled })} />

            {agent.enabled ? <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {agent.providerModels.map((pm, index) => {
                const id = pm.provider && pm.model ? `${pm.provider}/${pm.model}` : '';
                return (
                  <div key={index} className="settings-subcontainer">
                    <div className="settings-subcontainer-header">
                      <h5>Provider/model {index + 1}</h5>
                      <button className="icon-button compact" type="button" aria-label="Remove provider/model" onClick={() => updateAgent(agent.agent, { providerModels: agent.providerModels.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
                    </div>
                    <label className="muted">Provider/model
                      <select className="themed-select" value={id} onChange={(event) => {
                        const [provider, ...rest] = event.target.value.split('/');
                        updateModel(agent.agent, index, { provider, model: rest.join('/') });
                      }}>
                        <option value="">Select model…</option>
                        {modelOptions.map((model) => <option key={model.id} value={model.id} disabled={!model.authenticated}>{model.label}{model.authenticated ? '' : ' (not authenticated)'}</option>)}
                        {id && !modelIds.includes(id) ? <option value={id}>{id} (current)</option> : null}
                      </select>
                    </label>
                    <label className="muted">Effort
                      <select className="themed-select" value={pm.effort || 'medium'} onChange={(event) => updateModel(agent.agent, index, { effort: event.target.value })}>
                        <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option>
                      </select>
                    </label>
                    <p className="muted">Status: {pm.lastStatus || '—'} {pm.warningActive ? `· ${pm.warningType}` : ''}</p>
                    {pm.lastMessage ? <p className="muted">{pm.lastMessage}</p> : null}
                    {pm.warningActive ? <div style={{ display: 'flex', gap: 8 }}>
                      <button className="button ghost" type="button" onClick={() => clearWarning(pm.laneId)}>Clear warning</button>
                    </div> : null}
                  </div>
                );
              })}
              <button className="button ghost" type="button" disabled={agent.providerModels.length >= 2} onClick={() => updateAgent(agent.agent, { providerModels: [...agent.providerModels, { provider: '', model: '', effort: 'medium', enabled: true }] })}>Add provider/model</button>
            </div> : <p className="muted" style={{ marginTop: 10 }}>Configuration hidden while this parallel agent is disabled.</p>}
          </div>
        )) : null}
      </div>
      {(saving || message) ? <div className="settings-save-status">
        <span className="muted">{saving ? 'Auto-saving…' : message}</span>
      </div> : null}
    </article>
  );
}

function QualityGovernanceCard() {
  const query = useDashboardQuery<ContractGovernorPayload>(['contract-governor'], '/api/quality/contract-governor');
  const [config, setConfig] = useState<ContractGovernorConfig>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const hydratedRef = useRef(false);
  useEffect(() => { if (query.data?.effective_config) { setConfig(query.data.effective_config); hydratedRef.current = true; } }, [query.data?.effective_config]);
  const patch = (next: Partial<ContractGovernorConfig>) => setConfig((current) => ({ ...current, ...next }));
  const save = async () => {
    if (config.hot_mode && !window.confirm('Enable Contract Governor hot mode? This is development-only and can automatically change local PDQ expectations for low-risk corrections.')) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/quality/contract-governor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config }) });
      if (!response.ok) throw new Error(await response.text());
      setMessage('Quality governance config saved.');
      await query.refetch();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed'); }
    finally { setSaving(false); }
  };
  const latest = query.data?.runs?.[0];
  return (
    <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
      <div className="metric-tile-head"><span className="metric-icon" aria-hidden="true"><Gauge size={18} /></span><h3>Quality Governance</h3></div>
      <p className="muted">Contract governor can change local PDQ expectations. Public defaults stay off. Hot mode is development-only and enables low-risk local auto-apply.</p>
      <div className="parallel-agents-grid" style={{ marginTop: 12 }}>
        <div className="glass-card parallel-status-card" style={{ padding: 14 }}>
          <h4>Contract Governor</h4>
          <ToggleCard active={Boolean(config.enabled)} label={config.enabled ? 'Governor enabled' : 'Governor disabled'} onClick={() => patch({ enabled: !config.enabled })} />
          <ToggleCard active={Boolean(config.hot_mode)} label={config.hot_mode ? 'Hot mode ON' : 'Hot mode off'} onClick={() => patch({ hot_mode: !config.hot_mode, auto_apply: !config.hot_mode ? 'low-risk' : 'off' })} />
          <div className="settings-info-grid">
            <InfoPill label="Local config" value={query.data?.local_config_exists ? 'yes' : 'no'} />
            <InfoPill label="Pending" value={query.data?.pending?.length || 0} tone={(query.data?.pending?.length || 0) > 0 ? 'warn' : 'ok'} />
            <InfoPill label="Approved/applied" value={query.data?.approved?.length || 0} />
            <InfoPill label="Last run" value={latest?.timestamp ? new Date(latest.timestamp).toLocaleString() : '—'} />
          </div>
        </div>
        <div className="glass-card parallel-agent-card" style={{ padding: 14 }}>
          <h4>Local settings</h4>
          <label className="muted">Mode<select className="themed-select" value={config.mode || 'deterministic-only'} onChange={(e) => patch({ mode: e.target.value })}><option value="deterministic-only">deterministic-only</option><option value="agent-review">agent-review</option><option value="agent-review-auto-apply">agent-review-auto-apply</option></select></label>
          <label className="muted">Auto apply<select className="themed-select" value={config.hot_mode ? (config.auto_apply || 'off') : 'off'} disabled={!config.hot_mode} onChange={(e) => patch({ auto_apply: e.target.value })}><option value="off">off</option><option value="low-risk">low-risk</option></select></label>
          <label className="muted">Model<input className="themed-input" value={config.model || ''} onChange={(e) => patch({ model: e.target.value || null })} placeholder="openai-codex/gpt-5.3-codex-spark" /></label>
          <label className="muted">Max cost/run<input className="themed-input" type="number" min="0" step="0.01" value={config.max_cost_usd_per_run ?? 0} onChange={(e) => patch({ max_cost_usd_per_run: Number(e.target.value) })} /></label>
          <label className="muted">Max proposals/run<input className="themed-input" type="number" min="1" max="20" value={config.max_proposals_per_run ?? 5} onChange={(e) => patch({ max_proposals_per_run: Number(e.target.value) })} /></label>
          <button className="button" type="button" disabled={saving || !hydratedRef.current} onClick={save}>{saving ? 'Saving…' : 'Save governance config'}</button>
          {message ? <p className="muted">{message}</p> : null}
        </div>
      </div>
      {config.hot_mode ? <div className="settings-warning active" style={{ marginTop: 12 }}><AlertTriangle size={14} /> Hot mode active: low-risk local contract corrections may auto-apply.</div> : null}
    </article>
  );
}

function AgentBalanceCard() {
  const balancesQuery = useDashboardQuery<BalancesPayload>(['agent-balances'], '/api/agent-balances');
  const modelsQuery = useDashboardQuery<ModelsPayload>(['parallel-agent-models', 'balances'], '/api/parallel-agents/models');
  const [newProvider, setNewProvider] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [providerBalances, setProviderBalances] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const providerOptions = useMemo(() => {
    const providers = new Map<string, string>();
    for (const model of modelsQuery.data?.models || []) {
      if (model.provider) providers.set(model.provider, model.provider);
    }
    for (const item of balancesQuery.data?.providers || []) providers.set(item.provider, item.label || item.provider);
    return [...providers.entries()].map(([value, text]) => ({ value, text }));
  }, [balancesQuery.data?.providers, modelsQuery.data?.models]);
  const trackedProviders = new Set((balancesQuery.data?.providers || []).map((item) => item.provider));
  const addableProviders = providerOptions.filter((option) => !trackedProviders.has(option.value));

  const record = async (kind: 'balance_update' | 'balance_top_up', targetProvider: string, targetLabel: string, valueText: string) => {
    const value = Number(valueText);
    if (!Number.isFinite(value) || value < 0) {
      setMessage('Enter a non-negative current balance.');
      return;
    }
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/agent-balances', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'record-snapshot', provider: targetProvider, label: targetLabel, kind, balance_usd: value }) });
      if (!response.ok) throw new Error(await response.text());
      setProviderBalances((current) => ({ ...current, [targetProvider]: '' }));
      setMessage(`${targetLabel || targetProvider} ${kind === 'balance_top_up' ? 'top-up balance' : 'balance update'} recorded.`);
      await balancesQuery.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const addProvider = async () => {
    const providerName = newProvider.trim();
    if (!providerName) {
      setMessage('Select a provider to add.');
      return;
    }
    const labelText = newLabel.trim() || providerName;
    await record('balance_update', providerName, labelText, '0');
    setNewProvider('');
    setNewLabel('');
  };

  const removeProvider = async (name: string) => {
    if (!window.confirm(`Remove balance tracker for ${name}?`)) return;
    await fetch('/api/agent-balances', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete-provider', provider: name }) });
    await balancesQuery.refetch();
  };

  return (
    <article className="glass-card glass" style={{ gridColumn: '1 / -1' }}>
      <div className="metric-tile-head">
        <span className="metric-icon" aria-hidden="true"><Coins size={18} /></span>
        <h3>Agent Balance</h3>
      </div>
      <p className="muted">Estimate-only balance tracking for Pi-supported providers without usage APIs. Providers used by parallel agents appear as individual cards. One input always means the current remaining provider balance.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'end' }}>
        <label className="muted" style={{ minWidth: 220 }}>Add provider
          <select className="themed-select" value={newProvider} onChange={(event) => {
            setNewProvider(event.target.value);
            setNewLabel(event.target.options[event.target.selectedIndex]?.text || event.target.value);
          }}>
            <option value="">Select provider…</option>
            {addableProviders.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
          </select>
        </label>
        <label className="muted" style={{ minWidth: 180 }}>Label
          <input className="themed-input" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Provider label" />
        </label>
        <button className="button ghost" type="button" disabled={saving || !newProvider} onClick={addProvider}>Add provider</button>
      </div>
      {message ? <p className="muted" style={{ marginTop: 8 }}>{message}</p> : null}
      <div className="parallel-agents-grid" style={{ marginTop: 12 }}>
        {(balancesQuery.data?.providers || []).map((item) => (
          <div key={item.provider} className="glass-card parallel-agent-card" style={{ padding: 14 }}>
            <div className="settings-subcontainer-header">
              <h4>{item.label}</h4>
              <button className="icon-button compact" type="button" aria-label="Remove balance tracker" onClick={() => removeProvider(item.provider)}><Trash2 size={14} /></button>
            </div>
            <div className="settings-info-grid">
              <InfoPill label="Current est." value={item.estimated_current_balance_usd == null ? 'learning' : `$${item.estimated_current_balance_usd.toFixed(2)}`} />
              <InfoPill label="Latest seen" value={item.latest_balance_usd == null ? '—' : `$${item.latest_balance_usd.toFixed(2)}`} />
              <InfoPill label="Confidence" value={item.confidence} />
              <InfoPill label="Snapshots" value={item.snapshots?.length || 0} />
              <InfoPill label="Days left" value={item.days_remaining == null ? '—' : item.days_remaining} />
            </div>
            <div className="settings-subcontainer" style={{ marginTop: 10 }}>
              <h5>Record {item.label} balance</h5>
              <label className="muted">Current remaining balance (USD)
                <input className="themed-input" value={providerBalances[item.provider] || ''} onChange={(event) => setProviderBalances((current) => ({ ...current, [item.provider]: event.target.value }))} placeholder={item.latest_balance_usd == null ? '21.34' : String(item.latest_balance_usd)} inputMode="decimal" />
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <button className="button" type="button" disabled={saving} onClick={() => record('balance_update', item.provider, item.label, providerBalances[item.provider] || '')}>Balance update</button>
                <button className="button ghost" type="button" disabled={saving} onClick={() => record('balance_top_up', item.provider, item.label, providerBalances[item.provider] || '')}>Balance top up</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
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

      <ParallelAgentsCard />
      <QualityGovernanceCard />
      <AgentBalanceCard />
    </section>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});
