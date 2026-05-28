#!/usr/bin/env node
// Record structured operator decision evidence for PDQ trace classification.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = path.join(ROOT, 'state');

export const DECISION_TYPES = new Set([
  'skip_step',
  'override_route',
  'accept_risk',
  'defer_step',
  'manual_evidence',
  'expectation_correction',
  'backfill_evidence',
  'release_decision',
  'quality_refresh_decision',
]);

export const DECISION_REASONS = new Set([
  'not-applicable',
  'already-covered',
  'continuation-existing-plan',
  'docs-only',
  'no-ui-change',
  'manual-review-done-outside-pidex',
  'provider-quota-limited',
  'operator-approved-risk',
  'emergency-hotfix',
  'deferred',
  'duplicate-signal',
  'expectation-wrong',
  'auto-pdq-disabled',
  'optional-hooks-disabled',
  'terminal-event-backfill',
  'report-logic-regeneration-pending',
]);

const TARGET_OPERATORS = new Set([
  'OpPreflight',
  'OpContextPack',
  'OpSpawn',
  'OpRoute',
  'OpGate',
  'OpReview',
  'OpUserCorrection',
  'OpRuleAction',
  'OpQualityReview',
  'OpReleaseDecision',
  'OpDecision',
]);

function slug(value) { return String(value || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'unknown'; }
function normalizePlan(value) { const raw = String(value || 'unknown-plan').trim() || 'unknown-plan'; let m = raw.match(/^(?:plan-)?(\d{1,3})$/i); if (m) return `plan-${m[1].padStart(3, '0')}`; m = raw.match(/^(?:plan-)?(\d{1,3})[-_]/i); if (m) return `plan-${m[1].padStart(3, '0')}`; return raw; }
function bool(value, fallback = false) { if (value == null || value === '') return fallback; return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()); }
function obj(raw, name) { if (!raw) return undefined; const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${name} must be a JSON object`); return parsed; }

function parse(argv) {
  const out = { command: argv[0] || 'record', project: process.cwd(), plan: 'unknown-plan', pipelineId: '', decision: '', targetOperator: '', targetStep: '', reason: '', approvedBy: 'operator', riskAccepted: 'false', followUpRequired: 'false', evidencePath: '', confidence: 'medium', actor: 'orchestrator', dryRun: false, extraJson: '' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a.startsWith('--')) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return out;
}

function usage() {
  return `Usage: node scripts/quality/operator-decisions.mjs record --project <path> --pipeline-id <id> --plan <plan> --decision <type> --target-operator <Op...> --reason <reason> [options]\n\nDecision types:\n  ${[...DECISION_TYPES].join(', ')}\n\nReasons:\n  ${[...DECISION_REASONS].join(', ')}\n\nOptions:\n  --target-step <name>\n  --approved-by <operator|user|orchestrator>\n  --risk-accepted <true|false>\n  --follow-up-required <true|false>\n  --evidence-path <path>\n  --confidence <low|medium|high|insufficient-data>\n  --extra-json '{"key":"value"}'\n  --dry-run`;
}

export function buildDecisionRecord(args) {
  const project = path.resolve(args.project || process.cwd());
  const plan = normalizePlan(args.plan);
  const pipelineId = slug(args.pipelineId || `${slug(path.basename(project) || project)}-${slug(plan)}`);
  const decisionType = String(args.decision || args.decisionType || '').trim();
  const reason = String(args.reason || '').trim();
  const targetOperator = String(args.targetOperator || '').trim();
  const extra = obj(args.extraJson, 'extra-json') || {};
  const rec = {
    timestamp: new Date().toISOString(),
    project_path: project,
    project_slug: path.basename(project) || slug(project),
    pipeline_id: pipelineId,
    plan_key: plan,
    operator_type: 'OpDecision',
    actor: args.actor || 'orchestrator',
    source: 'operator-decision-cli',
    decision_type: decisionType,
    target_operator: targetOperator,
    target_step: String(args.targetStep || targetOperator || '').trim(),
    reason,
    approved_by: String(args.approvedBy || 'operator').trim(),
    risk_accepted: bool(args.riskAccepted),
    follow_up_required: bool(args.followUpRequired),
    confidence: args.confidence || 'medium',
    logical_decision: {
      decision_type: decisionType,
      target_operator: targetOperator,
      target_step: String(args.targetStep || targetOperator || '').trim(),
      reason,
      approved_by: String(args.approvedBy || 'operator').trim(),
    },
    physical_action: {
      risk_accepted: bool(args.riskAccepted),
      follow_up_required: bool(args.followUpRequired),
      evidence_path: args.evidencePath || undefined,
    },
    ...extra,
  };
  if (!args.evidencePath) delete rec.physical_action.evidence_path;
  return rec;
}

export function validateDecision(record) {
  const errors = [];
  for (const k of ['timestamp', 'project_path', 'pipeline_id', 'plan_key', 'operator_type', 'actor']) if (!record[k]) errors.push(`missing required field: ${k}`);
  if (record.operator_type !== 'OpDecision') errors.push('operator_type must be OpDecision');
  if (!DECISION_TYPES.has(record.decision_type)) errors.push(`decision_type must be one of ${[...DECISION_TYPES].join(', ')}`);
  if (!record.reason || !DECISION_REASONS.has(record.reason)) errors.push(`reason must be one of ${[...DECISION_REASONS].join(', ')}`);
  if (!TARGET_OPERATORS.has(record.target_operator)) errors.push(`target_operator must be one of ${[...TARGET_OPERATORS].join(', ')}`);
  if (!record.approved_by) errors.push('approved_by is required');
  if (record.decision_type === 'expectation_correction' && !record.evidence_path && !record.physical_action?.evidence_path && !record.proposed_expectation) errors.push('expectation_correction requires --evidence-path or --extra-json with proposed_expectation');
  return errors;
}

export function recordDecision(args) {
  const record = buildDecisionRecord(args);
  const errors = validateDecision(record);
  if (errors.length) return { ok: false, errors, record };
  if (args.dryRun) return { ok: true, path: null, record };
  const dir = path.join(STATE, 'orchestrator-events', slug(record.project_path));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.pipeline_id}.jsonl`);
  writeFileSync(file, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
  return { ok: true, path: file, record };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parse(process.argv.slice(2));
  if (args.command === '-h' || args.command === '--help' || args.help) { console.log(usage()); process.exit(0); }
  if (args.command !== 'record') { console.error(usage()); process.exit(2); }
  try {
    const result = recordDecision(args);
    if (!result.ok) {
      console.error('Invalid operator decision:');
      for (const err of result.errors) console.error(`- ${err}`);
      process.exit(2);
    }
    console.log(JSON.stringify({ ok: true, path: result.path, plan_key: result.record.plan_key, pipeline_id: result.record.pipeline_id, record: args.dryRun ? result.record : undefined }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
