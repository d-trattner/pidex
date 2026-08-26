import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { PIDEX_ROOT } from './paths.ts';
// Shared runtime authority: PIDEX_STATE_DIR > RUNNING_PI_STATE_DIR > <root>/state.
// @ts-expect-error JavaScript runtime module intentionally owns cross-surface state-root policy.
import { resolveStateRoot } from '../../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';
// @ts-expect-error JavaScript lifecycle projection owns canonical rule provenance.
import { openRuleLifecycleStore, readDashboardImpactEvidence, readDashboardRuleProvenance } from '../../../scripts/quality/rule-lifecycle-store.mjs';
// @ts-expect-error JavaScript publication projection owns allowlisted publication status.
import { listLifecycleControlStatus, listRulePublicationStatus, readRulePublicationStatusDetail } from '../../../scripts/quality/rule-publication-status.mjs';
// @ts-expect-error JavaScript lifecycle control boundary owns authenticated reversible intents.
import { applyRuleLifecycleControl } from '../../../scripts/quality/rule-lifecycle-action.mjs';
import { authorizeProviderLimitsRequest } from './provider-limits-auth.ts';
type AnyRecord = Record<string, any>;

const LEGACY_INCONCLUSIVE_ID = 'contract-correction-588aef3563e77972';
const RULE_PROVENANCE_UNAVAILABLE = Object.freeze({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] });
const IMPACT_EVIDENCE_UNAVAILABLE = Object.freeze({ status: 'unavailable', reason_code: 'evidence-unavailable', tiers: { global: [], project: [] } });
const PUBLICATION_STATUS_UNAVAILABLE = Object.freeze({ status: 'unavailable', publications: [] });
const LIFECYCLE_CONTROL_UNAVAILABLE = Object.freeze({ status: 'unavailable', publications: [] });
const LIFECYCLE_INTENTS = new Set(['stop-local', 'refinement-handoff', 'stop-cross-host', 'reactivate-monitor', 'reactivate-pin', 'unpin']);
const LIFECYCLE_INTENT_KEYS = Object.freeze(['action', 'rule_id', 'request_nonce']);
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
function errorPayload(error: unknown) { const message = error instanceof Error ? error.message : String(error); const code = /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1] || 'GOVERNOR_STATE_INVALID'; return { ok: false, status: 'unavailable', capability: 'manual-pending-only', error_code: code, error: 'governor-state-unavailable', rule_provenance: RULE_PROVENANCE_UNAVAILABLE, impact_evidence: IMPACT_EVIDENCE_UNAVAILABLE, publication_status: PUBLICATION_STATUS_UNAVAILABLE, lifecycle_control: LIFECYCLE_CONTROL_UNAVAILABLE, runs: [], corrections: [], latest_corrections: [], pending: [], approved: [] }; }
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
const DIGEST = /^[a-f0-9]{64}$/;
const RULE_ID = /^(?:pidex-global|project:[a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const REQUEST_NONCE = /^[A-Za-z0-9._:-]{1,128}$/;
const REQUEST_MAX_BYTES = 4096;
function json(payload: AnyRecord, status = 200) { return new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS }); }
function operatorDenied(status = 403) { return json({ error: 'Operator access required' }, status === 401 ? 401 : 403); }
function publicationUnavailable(status: 400 | 404 | 503) { return json({ error: 'Publication status unavailable' }, status); }
function refinementInvalid(status: 400 | 409) { return json({ error: 'Invalid or stale refinement request' }, status); }
function lifecycleInvalid() { return json({ error: 'Invalid lifecycle request' }, 400); }
function lifecycleStale() { return json({ error: 'Lifecycle state changed' }, 409); }
function lifecycleUnavailable() { return json({ error: 'Lifecycle action unavailable' }, 503); }
function validRefinementRequest(value: unknown): value is { action: 'request_refinement'; rule_id: string; receipt_digest: string; request_nonce: string } { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const record = value as AnyRecord; return Object.keys(record).length === 4 && ['action', 'rule_id', 'receipt_digest', 'request_nonce'].every((key) => Object.hasOwn(record, key)) && record.action === 'request_refinement' && typeof record.rule_id === 'string' && RULE_ID.test(record.rule_id) && typeof record.receipt_digest === 'string' && DIGEST.test(record.receipt_digest) && typeof record.request_nonce === 'string' && REQUEST_NONCE.test(record.request_nonce); }
function validLifecycleIntent(value: unknown): value is { action: string; rule_id: string; request_nonce: string } { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const record = value as AnyRecord; return Object.keys(record).length === 3 && LIFECYCLE_INTENT_KEYS.every((key) => Object.hasOwn(record, key)) && typeof record.action === 'string' && LIFECYCLE_INTENTS.has(record.action) && typeof record.rule_id === 'string' && RULE_ID.test(record.rule_id) && typeof record.request_nonce === 'string' && REQUEST_NONCE.test(record.request_nonce); }
function controlAuth() { return Object.freeze({ authenticated: true, authorized: true, csrf_valid: true }); }
function lifecycleTokenValid(request: Request) { const expected = process.env.PIDEX_PROVIDER_LIMITS_TOKEN || process.env.PROVIDER_LIMITS_TOKEN; if (!expected) return false; const header = request.headers.get('authorization') || ''; if (header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() === expected; return (request.headers.get('x-provider-limits-token') || request.headers.get('x-pidex-provider-limits-token') || '').trim() === expected; }
function controlActorDigest() { return createHash('sha256').update(String(process.env.PIDEX_PROVIDER_LIMITS_TOKEN || process.env.PROVIDER_LIMITS_TOKEN || 'local-operator')).digest('hex'); }
function controlNonceDigest(value: string) { return createHash('sha256').update(value).digest('hex'); }
function publicationStore(stateRoot: string) { return openRuleLifecycleStore({ stateRoot }); }
export function rejectContractGovernorWrite() { return json({ error: 'Method not allowed' }, 405); }
export async function contractGovernorReadResponse(root = PIDEX_ROOT, env = process.env) { const status = await getContractGovernorStatus(root, env); return json(status, status.ok ? 200 : 503); }
export async function contractGovernorApiGet(request?: Request, { root = PIDEX_ROOT, env = process.env }: { root?: string; env?: NodeJS.ProcessEnv } = {}) {
  if (!request) return contractGovernorReadResponse(root, env);
  const auth = authorizeProviderLimitsRequest(request, { method: 'GET' });
  if (!auth.allowed) return operatorDenied(auth.status);
  const url = new URL(request.url); const digests = url.searchParams.getAll('transaction_digest');
  if (!url.search) return contractGovernorReadResponse(root, env);
  if (digests.length !== 1 || url.searchParams.size !== 1 || !DIGEST.test(digests[0])) return publicationUnavailable(400);
  let store; try { store = publicationStore(resolveStateRoot({ root, env })); const detail = readRulePublicationStatusDetail({ store, transaction_digest: digests[0] }); return detail.status === 'available' && detail.publication ? json(detail) : publicationUnavailable(404); } catch { return publicationUnavailable(503); } finally { store?.close(); }
}
export async function contractGovernorApiPost(request?: Request, { root = PIDEX_ROOT, env = process.env }: { root?: string; env?: NodeJS.ProcessEnv } = {}) {
  if (!request || request.method !== 'POST') return refinementInvalid(400);
  const auth = authorizeProviderLimitsRequest(request, { method: 'POST' });
  if (!auth.allowed) return operatorDenied(auth.status);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return refinementInvalid(400);
  let body: unknown; try { const text = await request.text(); if (Buffer.byteLength(text, 'utf8') > REQUEST_MAX_BYTES) return refinementInvalid(400); body = JSON.parse(text); } catch { return lifecycleInvalid(); }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as AnyRecord;
    const keys = Object.keys(record);
    const intentShaped = keys.length === 3 && LIFECYCLE_INTENT_KEYS.every((key) => Object.hasOwn(record, key));
    const refinementShaped = keys.length === 4 && ['action', 'rule_id', 'receipt_digest', 'request_nonce'].every((key) => Object.hasOwn(record, key));
    if (intentShaped) {
      if (!validLifecycleIntent(body)) return lifecycleInvalid();
      // Security F-296-01: lifecycle mutations require the configured operator token even on loopback/same-origin. No headerless or tokenless client may drive controls.
      if (!lifecycleTokenValid(request)) return operatorDenied();
      const intent = body as { action: string; rule_id: string; request_nonce: string };
      let store; try {
        store = publicationStore(resolveStateRoot({ root, env }));
        // H-1 (Plan048 review): store-owned locked control authority resolves exactly one enrolled rule to current facts, target writer enrollment, canonical rule bytes, expected base, and protection/local-stop/epoch facts. Callers never supply authority material.
        const authority = store.readLifecycleControlAuthority?.({ rule_id: intent.rule_id });
        const target = authority ? { repository: authority.target.repository, scope_id: authority.target.scope_id } : store.resolveLifecycleControlTarget({ rule_id: intent.rule_id });
        if (!target) return lifecycleUnavailable();
        const outcome = applyRuleLifecycleControl({ store, control: intent.action, auth: controlAuth(), actor: controlActorDigest(), nonce: controlNonceDigest(intent.request_nonce), repository: target.repository, scope_id: target.scope_id, rule_id: intent.rule_id, now: new Date().toISOString(), current: authority?.current, target: authority?.target, rule_bytes: authority?.rule_bytes, expected_base: authority?.expected_base });
        if (outcome.status === 'stopped_local' || outcome.status === 'handoff' || outcome.status === 'prepared') return json({ status: 'accepted', correlation_id: outcome.correlation_id }, 202);
        if (outcome.status === 'conflict') return lifecycleStale();
        if (outcome.reason === 'control_invalid' || outcome.reason === 'input_invalid') return lifecycleInvalid();
        if (outcome.reason === 'stop_unavailable' || outcome.reason === 'lifecycle_action_unavailable') return lifecycleUnavailable();
        return lifecycleStale();
      } catch { return lifecycleUnavailable(); } finally { store?.close(); }
    }
    if (record.action === 'request_refinement' || refinementShaped) {
      if (!validRefinementRequest(body)) return refinementInvalid(400);
      let store; try {
        store = publicationStore(resolveStateRoot({ root, env }));
        const matches = listRulePublicationStatus({ store }).publications.filter((publication: AnyRecord) => publication.receipt_digest === (body as { receipt_digest: string }).receipt_digest);
        if (matches.length !== 1 || matches[0].rule_id !== (body as { rule_id: string }).rule_id) return refinementInvalid(409);
        const result = store.createManualRefinementRequest({ rule_id: (body as { rule_id: string }).rule_id, receipt_digest: (body as { receipt_digest: string }).receipt_digest, request_nonce: (body as { request_nonce: string }).request_nonce, now: new Date().toISOString() });
        if (result.status !== 'open') return refinementInvalid(409);
        return json({ status: 'accepted', request_id: result.request_id, rule_id: result.rule_id, scope_id: result.scope_id, tier: (body as { rule_id: string }).rule_id.startsWith('pidex-global:') ? 'global' : 'project', expires_at: result.expires_at }, 202);
      } catch (error) { return /^RULE_MANUAL_REFINEMENT_/.test(error instanceof Error ? error.message : '') ? refinementInvalid(409) : publicationUnavailable(503); } finally { store?.close(); }
    }
    return refinementInvalid(400);
  }
  return refinementInvalid(400);
}

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
    const rule_provenance = readDashboardRuleProvenance({ stateRoot: state });
    const impact_evidence = readDashboardImpactEvidence({ stateRoot: state });
    let publication_status = PUBLICATION_STATUS_UNAVAILABLE;
    let lifecycle_control = LIFECYCLE_CONTROL_UNAVAILABLE;
    try { const store = openRuleLifecycleStore({ stateRoot: state }); try { publication_status = listRulePublicationStatus({ store }); lifecycle_control = listLifecycleControlStatus({ store }); } finally { store.close(); } } catch {}
    return { ok: true, status: 'pending', capability: 'manual-pending-only', rule_provenance, impact_evidence, publication_status, lifecycle_control, default_config: defaults, local_config_exists: await exists(localPath), legacy_local_config_keys: [], effective_config: effective, runs, corrections: corrections.slice(-100).reverse(), latest_corrections: latest, pending: latest.filter((row) => row.status === 'pending').slice(0, 50), approved: latest.filter((row) => ['approved', 'applied', 'monitoring', 'validated', 'needs_review', 'superseded'].includes(row.status) || row.applied_at || row.monitoring_status).slice(0, 50) };
  } catch (error) { return errorPayload(error); }
}
