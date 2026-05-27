#!/usr/bin/env node
// Record finalized project-scoped OpPreflight events after /pidex interview/grilling completes.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = path.join(ROOT, 'state');
const TASK_CLASSES = new Set(['feature', 'bugfix', 'ui', 'cleanup', 'qa', 'release', 'unknown']);
const GRILL_SKILLS = new Set(['grill-with-docs', 'grill-me', 'none']);

function slug(value) { return String(value || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'unknown'; }
function normalizePlan(value) { const raw = String(value || 'unknown-plan').trim() || 'unknown-plan'; let m = raw.match(/^(?:plan-)?(\d{1,3})$/i); if (m) return `plan-${m[1].padStart(3, '0')}`; m = raw.match(/^(?:plan-)?(\d{1,3})[-_]/i); if (m) return `plan-${m[1].padStart(3, '0')}`; return raw; }
function bool(value, fallback = false) { if (value == null || value === '') return fallback; return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()); }
function list(value) { return String(value || '').split(',').map((s) => s.trim()).filter(Boolean); }
function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback; }
function parse(argv) {
  const out = { command: argv[0] || 'record', project: process.cwd(), plan: 'unknown-plan', pipelineId: '', taskClass: 'unknown', grillSkill: 'none', epicReady: 'false', existingProject: '', contextRead: '', contextTouched: '', acceptanceCount: '0', outOfScopeCount: '0', reason: 'Preflight/interview complete before opening agent', confidence: 'medium', dryRun: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return out;
}
function usage() {
  return `Usage: node scripts/quality/preflight.mjs record --project <path> --plan <plan> --pipeline-id <id> [options]\n\nOptions:\n  --task-class <feature|bugfix|ui|cleanup|qa|release|unknown>\n  --grill-skill <grill-with-docs|grill-me|none>\n  --epic-ready <true|false>\n  --existing-project <true|false>\n  --context-read <comma-separated paths>\n  --context-touched <comma-separated paths>\n  --acceptance-count <n>\n  --out-of-scope-count <n>\n  --reason <text>\n  --dry-run`;
}
function record(args) {
  const project = path.resolve(args.project || process.cwd());
  const plan = normalizePlan(args.plan);
  const taskClass = TASK_CLASSES.has(args.taskClass) ? args.taskClass : 'unknown';
  const grillSkill = GRILL_SKILLS.has(args.grillSkill) ? args.grillSkill : 'none';
  const existing = args.existingProject === '' ? (existsSync(path.join(project, '.git')) || existsSync(path.join(project, 'package.json')) || existsSync(path.join(project, 'pidex', 'context'))) : bool(args.existingProject);
  const pipelineId = slug(args.pipelineId || `${slug(path.basename(project) || project)}-${slug(plan)}`);
  const rec = {
    timestamp: new Date().toISOString(),
    project_path: project,
    project_slug: path.basename(project) || slug(project),
    pipeline_id: pipelineId,
    plan_key: plan,
    actor: 'orchestrator',
    source: 'preflight-finalized',
    operator_type: 'OpPreflight',
    confidence: args.confidence || 'medium',
    reason: args.reason || 'Preflight/interview complete before opening agent',
    logical_decision: { task_class: taskClass, existing_project: existing, epic_statement_ready: bool(args.epicReady), grill_skill_used: grillSkill },
    physical_action: { context_paths_read: list(args.contextRead), context_paths_touched: list(args.contextTouched), acceptance_criteria_count: num(args.acceptanceCount), out_of_scope_count: num(args.outOfScopeCount) }
  };
  if (args.dryRun) return { record: rec, path: null };
  const dir = path.join(STATE, 'orchestrator-events', slug(project));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${pipelineId}.jsonl`);
  writeFileSync(file, `${JSON.stringify(rec)}\n`, { encoding: 'utf8', flag: 'a' });
  return { record: rec, path: file };
}

const args = parse(process.argv.slice(2));
if (args.command === '-h' || args.command === '--help' || args.help) { console.log(usage()); process.exit(0); }
if (args.command !== 'record') { console.error(usage()); process.exit(2); }
try {
  const result = record(args);
  console.log(JSON.stringify({ ok: true, path: result.path, plan_key: result.record.plan_key, pipeline_id: result.record.pipeline_id, record: args.dryRun ? result.record : undefined }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
