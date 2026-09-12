import { useQuery } from '@tanstack/react-query';
import { isDecisionStatus, type DecisionStatus } from '../../scripts/runtime/decision-status.mjs';
import { GlassPanel } from './ui/glass-panel';

export function RuntimeDecisionPanel() {
  const query = useQuery({
    queryKey: ['runtime-decision-status', 'dashboard-observer'],
    queryFn: async ({ signal }): Promise<DecisionStatus> => {
      const response = await fetch('/api/summary?view=decision-status', { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Status unavailable');
      const result = await response.json();
      if (!isDecisionStatus(result) || result.observer !== 'dashboard') throw new Error('Unsupported status contract');
      return result;
    },
    // Source hashing is bounded but not a five-second KPI polling operation.
    enabled: false, retry: false, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const data = !query.isError && !query.isFetching ? query.data : undefined;
  return (
    <GlassPanel className="glass-card" style={{ gridColumn: '1 / -1' }}>
      <h2 className="h2">PIDEX: Was ist jetzt möglich?</h2>
      <p className="muted">Runtime auf dem Dashboard-Host, nicht das ausgewählte Projekt und nicht deine Pi-Session. Keine automatische Statusabfrage oder Aktion.</p>
      <button type="button" className="button" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Status lesen</button>
      <div aria-live="polite" aria-busy={query.isFetching}>
        {query.isFetching ? <p>Read-only-Beobachtung läuft…</p> : null}
        {query.isError ? <p role="alert">Status nicht verfügbar. Vorherige Daten gelten nicht als aktueller Nachweis. Erneut lesen, keine Freigabe daraus ableiten.</p> : null}
        {!data && !query.isFetching && !query.isError ? <p className="muted">Noch nicht abgefragt. Ein erfolgreicher Agentenlauf oder Commit bedeutet nicht „betriebsbereit“.</p> : null}
        {data ? <>
          <p className="muted">Beobachtung: {data.observed_at} · keine Live-Anzeige</p>
          <p>{data.observer_note}</p>
          <dl>
            {([
              ['Quelle', data.source], ['Geprüft', data.validation], ['Geladen', data.load],
              ['Installiert', data.installation], ['Betriebsbereit', data.readiness], ['Projekt fertig', data.task_completion],
            ] as const).map(([label, value]) => <div key={label} style={{ marginTop: 12 }}>
              <dt><strong>{label}: {value.label}</strong></dt><dd style={{ marginLeft: 0 }}>{value.detail}</dd>
            </div>)}
          </dl>
          <p className="muted" style={{ overflowWrap: 'anywhere' }}>Quell-Commit: {data.source_commit ?? 'unbekannt'}<br />Bestätigter Lade-Commit: {data.loaded_source_commit ?? 'nicht nachgewiesen'}<br />Baseline ausgewählt: {data.selected_baseline_id ?? 'keine'} · gebunden: {data.bound_baseline_id ?? 'keine'}<br />Scope: {data.scope ?? 'nicht beobachtet'}</p>
          {data.dispatch_policy_hint === 'legacy_permitted_not_accepted' ? <p>Legacy-Dispatch erlaubt ≠ freigegebener Betrieb.</p> : null}
          <p>Gründe: {data.reasons.join(', ') || 'keine gemeldeten'}</p>
          <p><strong>Nächster Schritt:</strong> {data.next_action.text}</p>
          <p className="muted">Keine automatische Annahme, Installation, Fortsetzung oder Prozessbeendigung. Für den tatsächlichen Pi-Ladezustand dort /pdstatus verwenden.</p>
        </> : null}
      </div>
    </GlassPanel>
  );
}
