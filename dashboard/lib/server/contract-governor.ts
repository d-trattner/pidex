import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PIDEX_ROOT } from './paths.ts';
// Shared runtime authority: PIDEX_STATE_DIR > RUNNING_PI_STATE_DIR > <root>/state.
// @ts-expect-error JavaScript runtime module intentionally owns cross-surface state-root policy.
import { resolveStateRoot } from '../../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';
type AnyRecord = Record<string, any>;

const LEGACY_INCONCLUSIVE_ID = 'contract-correction-588aef3563e77972';
const AUTOMATION_KEYS = new Set(['enabled', 'background', 'mode', 'hot_mode', 'auto_apply', 'agent_enabled', 'model', 'escalation_model', 'effort', 'max_cost_usd_per_run', 'monitoring_window_reports']);
const CONFIG_KEYS = new Set(['$schema', 'version', 'capability', 'max_proposals_per_run']);

async function exists(file: string) { try { await fs.stat(file); return true; } catch { return false; } }
async function readRequiredJson(file: string, code: string): Promise<AnyRecord> { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { throw new Error(`${code}: ${path.basename(file)}`); } }
async function readOptionalJson(file: string, fallback: AnyRecord, code: string): Promise<AnyRecord> { return await exists(file) ? readRequiredJson(file, code) : fallback; }
async function walk(dir: string): Promise<string[]> { const out: string[] = []; async function rec(current: string) { for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) { const target = path.join(current, entry.name); if (entry.isDirectory()) await rec(target); else out.push(target); } } await rec(dir); return out.sort(); }
async function readJsonl(file: string): Promise<AnyRecord[]> { if (!await exists(file)) return []; const text = await fs.readFile(file, 'utf8'); return text.split(/\r?\n/).filter(Boolean).map((line, index) => { try { return JSON.parse(line); } catch { throw new Error(`GOVERNOR_LEDGER_INVALID: line ${index + 1}`); } }); }
function pendingConfig(input: AnyRecord) { const unknown = Object.keys(input).filter((key) => !CONFIG_KEYS.has(key)); if (unknown.length) throw new Error(`GOVERNOR_CONFIG_INVALID: unknown fields ${unknown.join(',')}`); if (input.version !== 2 || input.capability !== 'manual-pending-only') throw new Error('GOVERNOR_CONFIG_INVALID: expected version 2 manual-pending-only'); const max = Number(input.max_proposals_per_run ?? 5); if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('GOVERNOR_CONFIG_INVALID: max_proposals_per_run must be 1..20'); return { version: 2, capability: 'manual-pending-only', max_proposals_per_run: max }; }
function collapse(rows: AnyRecord[]) { const map = new Map<string, AnyRecord>(); for (const row of rows) { const id = row.id || row.proposal_id; if (!id) continue; map.set(id, { ...(map.get(id) || {}), ...row, source_status: row.status }); } return [...map.values()]; }
function assess(row: AnyRecord) { const exactLegacy = row.id === LEGACY_INCONCLUSIVE_ID && row.operator_type === 'OpQualityReview' && row.contract_id === 'operator.OpQualityReview.terminal-pdq' && row.source === 'contract-governor-evaluate'; const lacksBaseline = row.status === 'validated' && !row.validation_metrics?.matching_findings_before; return exactLegacy && lacksBaseline ? { ...row, assessment: 'inconclusive', assessment_reason: 'Legacy deterministic/manual correction has no immutable baseline or post-apply report window.' } : row; }
function errorPayload(error: unknown) { const message = error instanceof Error ? error.message : String(error); const code = /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1] || 'GOVERNOR_STATE_INVALID'; return { ok: false, status: 'unavailable', capability: 'manual-pending-only', error_code: code, error: 'governor-state-unavailable', runs: [], corrections: [], latest_corrections: [], pending: [], approved: [] }; }
function safeRun(row: AnyRecord) {
  return {
    ok: row.ok === true,
    run_id: typeof row.run_id === 'string' ? row.run_id : null,
    timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
    capability: row.capability === 'pending-only' ? row.capability : null,
    status: typeof row.status === 'string' ? row.status : null,
    plan_key: typeof row.plan_key === 'string' ? row.plan_key : null,
    proposals_pending: Number.isInteger(row.proposals_pending) && row.proposals_pending >= 0 ? row.proposals_pending : 0,
    duplicates: Number.isInteger(row.duplicates) && row.duplicates >= 0 ? row.duplicates : 0,
    duration_ms: Number.isFinite(row.duration_ms) && row.duration_ms >= 0 ? row.duration_ms : 0,
    project: typeof row.project === 'string' && row.project.startsWith('project:') ? row.project : null,
    report_ref: typeof row.report_ref === 'string' && row.report_ref.startsWith('report:') ? row.report_ref : null,
    error_code: typeof row.error_code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(row.error_code) ? row.error_code : null,
  };
}

const RESPONSE_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
export function rejectContractGovernorWrite() { return new Response(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'method-not-allowed' }), { status: 405, headers: RESPONSE_HEADERS }); }
export async function contractGovernorReadResponse(root = PIDEX_ROOT, env = process.env) { const status = await getContractGovernorStatus(root, env); return new Response(JSON.stringify(status), { status: status.ok ? 200 : 503, headers: RESPONSE_HEADERS }); }

export async function getContractGovernorStatus(root = PIDEX_ROOT, env = process.env) {
  try {
    const defaults = await readRequiredJson(path.join(root, 'config/contract-governor.json'), 'GOVERNOR_CONFIG_INVALID');
    const localPath = path.join(root, 'config/contract-governor.local.json');
    const local = await readOptionalJson(localPath, {}, 'GOVERNOR_CONFIG_INVALID');
    if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults) || !local || typeof local !== 'object' || Array.isArray(local)) throw new Error('GOVERNOR_CONFIG_INVALID: config files must contain objects');
    const legacyKeys = [...new Set([...Object.keys(defaults), ...Object.keys(local)].filter((key) => AUTOMATION_KEYS.has(key)))];
    if (legacyKeys.length) throw new Error(`GOVERNOR_AUTOMATION_UNSUPPORTED: ${legacyKeys.join(',')}`);
    const effective = pendingConfig({ ...defaults, ...local });
    const state = resolveStateRoot({ root, env });
    const runFiles = (await walk(path.join(state, 'quality/contract-governor'))).filter((file) => file.endsWith('run.json'));
    const runs = (await Promise.all(runFiles.map(async (file): Promise<AnyRecord> => safeRun(await readRequiredJson(file, 'GOVERNOR_RUN_STATE_INVALID'))))).filter((row) => row.run_id || row.status).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, 20);
    const corrections = await readJsonl(path.join(state, 'quality/contract-corrections.jsonl'));
    const latest = collapse(corrections).map(assess).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return { ok: true, status: 'pending', capability: 'manual-pending-only', default_config: defaults, local_config_exists: await exists(localPath), legacy_local_config_keys: [], effective_config: effective, runs, corrections: corrections.slice(-100).reverse(), latest_corrections: latest, pending: latest.filter((row) => row.status === 'pending').slice(0, 50), approved: latest.filter((row) => ['approved', 'applied', 'monitoring', 'validated', 'needs_review', 'superseded'].includes(row.status) || row.applied_at || row.monitoring_status).slice(0, 50) };
  } catch (error) { return errorPayload(error); }
}
