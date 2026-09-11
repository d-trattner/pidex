// Descriptive PDQ matching only. These identities never grant lifecycle authority.
import { validDecisionFor } from './operator-contracts.mjs';

function text(value) { return typeof value === 'string' && value.trim() ? value : null; }
function planOf(row) {
  const value = String(row.plan_key || row.plan || '');
  return /^(?:plan-)?\d+$/.test(value) ? `plan-${value.replace(/^plan-/, '').padStart(3, '0')}` : value;
}
function executionOf(row) {
  for (const field of ['run_dir', 'project_run_id', 'run_id']) {
    if (text(row[field])) return [field, row[field]];
  }
  return null;
}
function scopeOf(row) {
  const project = text(row.project_path || row.project);
  const execution = executionOf(row);
  if (!project || !execution || !planOf(row) || !text(row.agent)) return null;
  return JSON.stringify([project, planOf(row), row.agent, row.project_mode || null, execution]);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).filter(key => !key.startsWith('_')).sort().map(key => [key, canonical(value[key])]));
}
function distinct(rows) { return [...new Map(rows.map(row => [JSON.stringify(canonical(row)), row])).values()]; }

/** Collapse byte-equivalent records; conflicting metric identity can prove nothing. */
export function executionMetrics(metrics) {
  const groups = new Map(); const unknown = [];
  for (const row of metrics) {
    const key = scopeOf(row);
    if (!key) { unknown.push(row); continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...unknown, ...[...groups.values()].map(rows => {
    const unique = distinct(rows);
    return unique.length === 1 ? unique[0] : { ...unique[0], _ambiguous_execution: true };
  })];
}

/** Match one expected operator to one execution. Never fall back to role/time proximity. */
export function matchExecutionEvidence(row, operator, events, target) {
  const key = scopeOf(row);
  if (!key) return { reason: 'missing execution identity or project scope' };
  if (row._ambiguous_execution) return { reason: 'ambiguous metric execution identity' };
  const scoped = events.filter(event => scopeOf(event) === key);
  const candidates = distinct(scoped.filter(event => event.operator_type === operator));
  if (candidates.length > 1) return { reason: 'ambiguous operator evidence for execution' };
  const event = candidates[0];
  const targetMatches = operator === 'OpGate'
    ? String(event?.gate || '').toLowerCase() === String(target).toLowerCase()
    : operator !== 'OpRoute' || (event?.route_to || event?.logical_decision?.route_to) === target;
  if (event && targetMatches) return { event };
  const decisions = distinct(scoped.filter(event => event.operator_type === 'OpDecision' && event.target_operator === operator));
  if (decisions.length > 1) return { reason: 'ambiguous operator decision for execution' };
  // Unlike plan-wide contracts, a run decision must name its exact target.
  const exact = decisions.filter(decision => decision.target_step && String(decision.target_step).toLowerCase() === String(target || row.agent).toLowerCase());
  const decision = validDecisionFor(exact, { plan: planOf(row), operator_type: operator, target_step: target || row.agent });
  return decision ? { decision } : { reason: 'missing or mismatched execution evidence' };
}
