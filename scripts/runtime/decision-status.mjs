// Presentation only. Never grants dispatch, accepts a baseline or repairs history.
export const DECISION_STATUS_SCHEMA = 'pidex-decision-status-v1';
const fact = (state, label, detail) => ({ state, label, detail });
// Match the existing baseline identity, including its namespace prefix.
const token = value => typeof value === 'string' && /^baseline:[a-f0-9]{64}$/.test(value) ? value : null;
const commit = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value) ? value : null;
const code = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,80}$/.test(value);
function recommendation(status, observer, reasons, ready) {
  if (status === 'invalid' || reasons.includes('BASELINE_CORRUPT') || reasons.includes('STORE_LOCKED') || reasons.includes('PATH_UNSAFE')) return { id: 'inspect_blocker', text: 'Blocker anhand der Gründe klären. Keine Locks löschen oder Belege ersetzen.' };
  if (reasons.some(r => ['SOURCE_UNAVAILABLE', 'OBSERVATION_LIMIT', 'CONFIG_INVALID', 'CONFIG_UNCOVERED'].includes(r))) return { id: 'inspect_coverage', text: 'Fehlende Quell-/Konfigurationsabdeckung oder Zugriffsgrenzen read-only klären. Ohne vollständige Beobachtung keine Freigabe ableiten.' };
  if (reasons.includes('SOURCE_DRIFT') || status === 'restart_required') return { id: 'inspect_source_then_restart', text: 'Quelländerungen prüfen; anschließend einen frischen, bestätigten Prozess starten. Reload allein ist kein Nachweis.' };
  if (reasons.includes('CONFIG_DRIFT') || status === 'configuration_changed') return { id: 'inspect_configuration', text: 'Konfigurationsabweichung prüfen. Alte Freigabe nicht auf neue Konfiguration übertragen.' };
  if (reasons.includes('SCOPE_NOT_ACCEPTED') || status === 'scope_not_accepted') return { id: 'inspect_scope', text: 'Freigabe für genau diese Plattform, Versionen und diesen Modus prüfen; keine andere Abnahme übernehmen.' };
  if (ready) return { id: 'continue_bound_scope', text: 'Im bestätigten Prozess und angezeigten Scope weiterarbeiten. Projektabschluss und Installation bleiben separate Nachweise.' };
  if (status === 'unregistered' || status === 'experimental') return { id: 'inspect_unbound_candidate', text: 'Kandidaten und vorhandene Nachweise sichten. Eine erlaubte Legacy-Ausführung ist keine Abnahme; Baseline nur bewusst auswählen und binden.' };
  if (observer !== 'pi') return { id: 'inspect_pi_session', text: 'Für den geladenen Pi-Stand /pdstatus in der betreffenden Session aufrufen. Dieser Beobachter bestätigt keine fremde Session.' };
  return { id: 'confirm_process', text: 'Lade-/Bindungsnachweis prüfen und bei Bedarf kontrolliert neu starten. Fehlende Evidenz bleibt unbestätigt.' };
}
function scopeText(scope) {
  if (!scope || !['platform', 'arch', 'node_version', 'pi_version', 'mode'].every(k => typeof scope[k] === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(scope[k]))) return null;
  return `${scope.platform}/${scope.arch}; Node ${scope.node_version}; Pi ${scope.pi_version}; ${scope.mode}`;
}
function observation(runtime) {
  const available = runtime && typeof runtime === 'object' && runtime.schema_version === 1 && typeof runtime.status === 'string';
  const raw = available ? runtime : {};
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.map(r => r?.code) : [];
  const knownStatus = ['ready', 'invalid', 'unconfirmed', 'experimental', 'unregistered', 'restart_required', 'configuration_changed', 'scope_not_accepted'].includes(raw.status);
  const status = available && knownStatus ? raw.status : 'unavailable';
  const bound = raw.binding === 'baseline' && Boolean(token(raw.bound_baseline_id));
  const covered = raw.source?.coverage === 'complete' && raw.config?.coverage === 'complete';
  return { raw, reasons, status, bound, covered, scopeLabel: scopeText(raw.observed_scope) };
}
function assurances({ raw, reasons, status, bound, covered, scopeLabel }, observer) {
  // Acceptance may be known while load confirmation is missing. Do not derive it
  // merely from selected_baseline_id, clean Git, an agent verdict or can_dispatch.
  const accepted = bound && covered && scopeLabel !== null && ['ready', 'unconfirmed'].includes(status) && reasons.every(r => r === 'LOAD_UNCONFIRMED');
  const controlled = observer === 'pi' && bound && raw.load_assurance === 'controlled_start' && !reasons.includes('LOAD_UNCONFIRMED') && status !== 'invalid';
  const ready = status === 'ready' && accepted && controlled && reasons.length === 0 && raw.can_dispatch === true;
  return { accepted, controlled, ready };
}
function sourceFact(raw, covered) {
  const dirty = ['bootstrap', 'runtime'].some(k => raw.source?.[k]?.dirty?.tracked || raw.source?.[k]?.dirty?.untracked);
  return fact(covered ? dirty ? 'modified' : 'observed' : 'unconfirmed', covered ? dirty ? 'Lokal verändert' : 'Beobachtet' : 'Unbestätigt', 'Checkout und Konfigurationsabdeckung sind keine Installation oder Abnahme.');
}
function validationFact(accepted, bound) {
  return fact(accepted ? 'accepted_scope' : bound ? 'unconfirmed' : 'not_bound', accepted ? 'Scope freigegeben' : bound ? 'Nicht bestätigt' : 'Keine Prozessbindung', 'Nur die zur aktuellen Quelle/Konfiguration passende gebundene Scope-Freigabe zählt; Auswahl allein reicht nicht.');
}
function loadFact(controlled, observer, raw) {
  const observed = observer === 'pi' && raw.load_assurance === 'observed_at_load';
  return fact(controlled ? 'controlled_start' : observed ? 'observed_at_load' : 'unconfirmed', controlled ? 'Kontrollierter Start' : observed ? 'Beim Laden beobachtet' : 'Nicht bestätigt', 'Ein Startbeleg bleibt bei Drift sichtbar, bestätigt aber nicht die aktuelle Betriebsbereitschaft.');
}
function readinessFact(ready, status, bound) {
  const state = ready ? 'ready_bound_scope' : status === 'unavailable' ? 'unavailable' : bound && status !== 'ready' ? 'blocked_or_unconfirmed' : 'unconfirmed';
  return fact(state, ready ? 'Bereit im gebundenen Scope' : 'Nicht bestätigt', 'Nur ein passender, bestätigt geladener Pi-Prozess kann hier bereit sein. Kein plattformübergreifendes Betriebsversprechen.');
}
export function projectDecisionStatus(runtime, { observer = 'cli', observedAt = new Date().toISOString() } = {}) {
  if (!['pi', 'cli', 'dashboard'].includes(observer)) throw new TypeError('DECISION_OBSERVER_INVALID');
  const observed = observation(runtime);
  const { raw, reasons, status, bound, covered, scopeLabel } = observed;
  const publicReasons = [...new Set(reasons.filter(code))].slice(0, 16);
  const { accepted, controlled, ready } = assurances(observed, observer);
  const next = status === 'unavailable'
    ? { id: 'retry_read_only_status', text: 'Status konnte nicht ermittelt werden. Read-only-Abfrage erneut versuchen; keinen Erfolg oder Neustart daraus ableiten.' }
    : recommendation(status, observer, publicReasons, ready);
  return {
    schema: DECISION_STATUS_SCHEMA, observed_at: observedAt, observer, runtime_status: status,
    observer_note: observer === 'pi' ? 'Beobachtung dieses Pi-Prozesses; Scope ausdrücklich begrenzt.' : 'Beobachtung der konfigurierten Runtime auf diesem Host, nicht einer Pi-Session oder des ausgewählten Projekts.',
    source_commit: commit(raw.source?.runtime?.commit), loaded_source_commit: controlled ? commit(raw.load_observed_source_commit) : null, selected_baseline_id: token(raw.selected_baseline_id), bound_baseline_id: token(raw.bound_baseline_id), scope: scopeLabel,
    source: sourceFact(raw, covered),
    validation: validationFact(accepted, bound),
    load: loadFact(controlled, observer, raw),
    installation: fact('unconfirmed', 'Nicht nachgewiesen', 'Dieser Vertrag hat keinen Installations-/Deploymentbeleg. Ein Checkout oder laufender Prozess ersetzt ihn nicht.'),
    readiness: readinessFact(ready, status, bound),
    task_completion: fact('not_assessed', 'Separat prüfen', 'Dieser Runtime-Status bestätigt keinen Projektabschluss. Dafür gelten Pipeline-/Review-/Closeout-Belege.'),
    dispatch_policy_hint: !bound && raw.can_dispatch === true ? 'legacy_permitted_not_accepted' : raw.can_dispatch === false ? 'blocked' : 'no_new_permission',
    reasons: status === 'unavailable' ? ['STATUS_UNAVAILABLE'] : publicReasons,
    next_action: { ...next, automatic: false },
  };
}
export function isDecisionStatus(value) {
  const text = v => typeof v === 'string' && v.length <= 1600;
  const nullableText = v => v === null || text(v);
  const fields = ['source', 'validation', 'load', 'installation', 'readiness', 'task_completion'];
  return Boolean(value && value.schema === DECISION_STATUS_SCHEMA && ['pi', 'cli', 'dashboard'].includes(value.observer)
    && text(value.observed_at) && Number.isFinite(Date.parse(value.observed_at)) && text(value.runtime_status) && text(value.observer_note)
    && ['source_commit', 'loaded_source_commit', 'selected_baseline_id', 'bound_baseline_id', 'scope'].every(k => nullableText(value[k]))
    && fields.every(k => value[k] && ['state', 'label', 'detail'].every(p => text(value[k][p])))
    && text(value.dispatch_policy_hint) && Array.isArray(value.reasons) && value.reasons.length <= 16 && value.reasons.every(code)
    && value.next_action?.automatic === false && text(value.next_action.id) && text(value.next_action.text)
    && (value.readiness.state !== 'ready_bound_scope' || value.observer === 'pi'));
}
export function formatDecisionStatus(decision) {
  const facts = [['Quelle', 'source'], ['Geprüft', 'validation'], ['Geladen', 'load'], ['Installiert', 'installation'], ['Betriebsbereit', 'readiness'], ['Projekt fertig', 'task_completion']];
  return [
    `PIDEX: ${decision.runtime_status}`, `Beobachter: ${decision.observer} · ${decision.observed_at}`, decision.observer_note,
    ...facts.map(([label, key]) => `${label}: ${decision[key].label}`),
    `Quell-Commit: ${decision.source_commit ?? 'unbekannt'}`,
    `Bestätigter Lade-Commit: ${decision.loaded_source_commit ?? 'nicht nachgewiesen'}`,
    `Baseline: ${decision.bound_baseline_id ?? 'nicht gebunden'} (ausgewählt: ${decision.selected_baseline_id ?? 'keine'})`,
    `Scope: ${decision.scope ?? 'nicht beobachtet'}`,
    ...(decision.dispatch_policy_hint === 'legacy_permitted_not_accepted' ? ['Legacy-Dispatch erlaubt ≠ freigegebener Betrieb.'] : []),
    `Gründe: ${decision.reasons.join(', ') || 'keine gemeldeten'}`, `Nächster Schritt: ${decision.next_action.text}`,
  ].join('\n');
}
