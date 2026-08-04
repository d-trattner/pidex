#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalizeReviewOutcome, validateReviewOutcome, writeTbr } from './tbr.mjs';
import { withProjectTbrLock } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Plan 059 Slice 4: single supported state-root override resolved through the shared
// helper (PIDEX_STATE_DIR > RUNNING_PI_STATE_DIR > <repo>/state) so the CLI TBR lock
// and host lifecycle serialize on the same lock file; no env-name split can diverge.
const STATE = resolveStateRoot({ root: ROOT });
const OPERATOR_TYPES = new Set(['OpPreflight','OpContextPack','OpSpawn','OpRoute','OpGate','OpReview','OpUserCorrection','OpRuleAction','OpQualityReview','OpReleaseDecision','OpDecision']);
function slug(v) { return String(v || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'unknown'; }
function normalizePlan(v) { const raw = String(v || 'unknown-plan').trim() || 'unknown-plan'; const m = raw.match(/^(?:plan-)?(\d{1,3})$/i); return m ? `plan-${m[1].padStart(3, '0')}` : raw; }
function parse(argv) { const a = { project: ROOT, plan: 'unknown-plan', actor: 'orchestrator', dryRun: false }; for (let i = 0; i < argv.length; i += 1) { const x = argv[i]; if (x === '--dry-run') a.dryRun = true; else if (x.startsWith('--')) a[x.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; } return a; }
function obj(raw, name) { if (!raw) return undefined; const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be JSON object`); return value; }
function validate(record) { const errors = []; if (!OPERATOR_TYPES.has(record.operator_type)) errors.push(`operator_type must be one of ${[...OPERATOR_TYPES].sort()}`); for (const key of ['timestamp','project_path','pipeline_id','plan_key','operator_type']) if (!record[key]) errors.push(`missing required field: ${key}`); if (record.operator_type === 'OpRoute') { if (!record.logical_decision) errors.push('OpRoute requires logical_decision'); if (!record.physical_action) errors.push('OpRoute requires physical_action'); } if (record.operator_type === 'OpRuleAction') for (const key of ['rule_path','action','approval_source','expected_impact_dimension']) if (!record[key]) errors.push(`OpRuleAction missing ${key}`); if (record.operator_type === 'OpUserCorrection' && !(record.reason || record.logical_decision?.summary)) errors.push('OpUserCorrection requires --reason or logical_json.summary'); if (record.operator_type === 'OpReleaseDecision' && !(record.reason || record.source_artifact || record.physical_action)) errors.push('OpReleaseDecision requires --reason, --source-artifact, or --physical-json'); if (record.operator_type === 'OpDecision') for (const key of ['decision_type','target_operator','reason','approved_by']) if (!record[key]) errors.push(`OpDecision missing ${key}`); return errors; }
function accepted(result) { return result !== false && result?.ok !== false && !['failed', 'conflict'].includes(result?.status); }
function reviewEvent(identity, outcome) {
  const semanticId = createHash('sha256').update([identity?.planId, identity?.runFamilyId, identity?.reviewGate, 'review_outcome'].join('\0')).digest('hex');
  return { semanticId, outcome };
}
function invoke(callback, value, event) { try { return typeof callback === 'function' && accepted(callback(value, event)); } catch { return false; } }
// Operator-event transition helper for the CLI review-outcome path (AD-8).
// The TBR index write is a shared-index writer (AD-3): the CALLER MUST HOLD the
// project-scoped TBR serialization lock (withProjectTbrLock, same stateDir/project
// as the canonical completion boundary) before invoking — production main()
// acquires it; the raw helper accepts injected writers for fault-injection tests.
// Statuses are truthful OPERATOR outcomes, never lifecycle claims: approval ->
// accepted, non-final rejection -> CHANGES_REQUESTED. The lifecycle terminal
// CLOSED_WITH_TBR is produced exclusively by completeStructuredReviewOutcome
// (canonical boundary, review2 final close); this path never claims it.
export function transitionReviewOutcome({ root, identity, outcome, write = writeTbr, appendOutcome, appendRoute, spawn }) {
  const checked = validateReviewOutcome(outcome, identity?.reviewGate);
  if (!checked.ok) return { status: 'TBR_WRITE_BLOCKED', code: checked.code };
  const written = write({ root, identity, findings: checked.value.immediateTbr });
  if (!written?.ok) return { status: 'TBR_WRITE_BLOCKED', code: written?.code || 'TBR_WRITE_FAILED' };
  const event = reviewEvent(identity, checked.value);
  if (!invoke(appendOutcome, checked.value, event)) return { status: 'TBR_WRITE_BLOCKED', code: 'TBR_OUTCOME_APPEND_FAILED' };
  if (!invoke(appendRoute, checked.value, event)) return { status: 'TBR_WRITE_BLOCKED', code: 'TBR_ROUTE_APPEND_FAILED' };
  if (!invoke(spawn, checked.value, event)) return { status: 'TBR_WRITE_BLOCKED', code: 'TBR_SPAWN_FAILED' };
  return checked.value.verdict === 'APPROVED'
    ? { status: 'accepted', items: written.items }
    : { status: 'CHANGES_REQUESTED', items: written.items };
}
export function main(argv = process.argv.slice(2)) {
  try {
    const a = parse(argv); if (!a.pipelineId || !a.operatorType) throw new Error('missing --pipeline-id or --operator-type');
    const review = a.reviewOutcomeJson ? validateReviewOutcome(obj(a.reviewOutcomeJson, 'review-outcome-json'), a.gate) : undefined;
    if (review && !review.ok) throw new Error(`Invalid review outcome: ${review.code}`);
    const project = path.resolve(a.project); const record = { timestamp: new Date().toISOString(), project_path: project, project_slug: path.basename(project), pipeline_id: slug(a.pipelineId), plan_key: normalizePlan(a.plan), operator_type: a.operatorType, actor: a.actor };
    for (const [key, value] of Object.entries({ agent: a.agent, source_artifact: a.sourceArtifact, gate: a.gate, severity: a.severity, confidence: a.confidence, reason: a.reason })) if (value) record[key] = value;
    if (a.logicalJson) record.logical_decision = obj(a.logicalJson, 'logical_decision'); if (a.physicalJson) record.physical_action = obj(a.physicalJson, 'physical_action'); if (review) record.review_outcome = review.value; if (a.extraJson) Object.assign(record, obj(a.extraJson, 'extra-json'));
    const errors = validate(record); if (errors.length) throw new Error(`Invalid operator event:\n- ${errors.join('\n- ')}`);
    if (a.dryRun) { console.log(JSON.stringify(record, null, 2)); return 0; }
    const dir = path.join(STATE, 'orchestrator-events', slug(path.basename(project))); mkdirSync(dir, { recursive: true }); const out = path.join(dir, `${record.pipeline_id}.jsonl`);
    const append = () => { writeFileSync(out, `${JSON.stringify(record)}\n`, { flag: 'a' }); return true; };
    const appendReviewOutcome = (reviewOutcome, event) => {
      const prior = existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
      const matches = prior.filter((row) => row.review_semantic_id === event.semanticId);
      if (matches.length) return matches.some((row) => JSON.stringify(canonicalizeReviewOutcome(row.review_outcome)) === JSON.stringify(canonicalizeReviewOutcome(reviewOutcome))) ? { ok: true, duplicate: true } : false;
      writeFileSync(out, `${JSON.stringify({ ...record, review_outcome: reviewOutcome, review_semantic_id: event.semanticId })}\n`, { flag: 'a' }); return true;
    };
    if (review) {
      // AD-3/AD-8: the CLI review-outcome path is a shared-index writer and must
      // serialize on the same project-scoped TBR lock the canonical completion
      // boundary uses (stateDir = operator state root, project = target project).
      // Lock-uncertain -> fail closed, nothing written, no operator event appended.
      const transition = withProjectTbrLock({ stateDir: STATE, project }, (root) => transitionReviewOutcome({ root, identity: { planId: record.plan_key, runFamilyId: a.runFamilyId || record.pipeline_id, reviewGate: a.gate }, outcome: obj(a.reviewOutcomeJson, 'review-outcome-json'), appendOutcome: appendReviewOutcome, appendRoute: () => true, spawn: () => true }));
      if (transition.status === 'TBR_WRITE_BLOCKED' || transition.ok === false) throw new Error('TBR_WRITE_BLOCKED');
    } else append();
    console.log(out); return 0;
  } catch (error) { console.error(error.message); return 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
