#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = path.join(ROOT, 'state');
function parse(argv) { const a = { project: ROOT, plan: 'unknown-plan', pipelineId: '', terminalEvent: 'pipeline_completed' }; for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) a[argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; } return a; }
function slug(value) { return String(value || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'unknown'; }
function normalizePlan(value) { const raw = String(value || 'unknown-plan').trim() || 'unknown-plan'; let m = raw.match(/^(?:plan-)?(\d{1,3})$/i); if (m) return `plan-${m[1].padStart(3, '0')}`; m = raw.match(/^(?:plan-)?(\d{1,3})[-_]/i); if (m) return `plan-${m[1].padStart(3, '0')}`; return raw; }
function runContractGovernor(project, plan, reportOut) {
  try {
    if (['0', 'false', 'no', 'off'].includes(String(process.env.PIDEX_CONTRACT_GOVERNOR || '0').toLowerCase())) return;
    if (process.env.PIDEX_CONTRACT_GOVERNOR_SOURCE === 'governor-refresh') return;
    const report = reportOut?.json;
    if (!report) return;
    const script = path.join(ROOT, 'scripts', 'quality', 'contract-governor.mjs');
    if (!existsSync(script)) return;
    const child = spawn(process.execPath, [script, 'run', '--project', path.resolve(project), '--plan', normalizePlan(plan), '--report', report], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PIDEX_CONTRACT_GOVERNOR_SOURCE: 'auto-pdq' },
    });
    child.unref();
  } catch {}
}
function appendQualityReview(project, plan, pipelineId, terminalEvent, reportOut) {
  const projectPath = path.resolve(project);
  const planKey = normalizePlan(plan);
  const pid = slug(pipelineId || `${slug(projectPath)}-${slug(planKey)}`);
  const rec = {
    timestamp: new Date().toISOString(),
    project_path: projectPath,
    project_slug: path.basename(projectPath) || slug(projectPath),
    pipeline_id: pid,
    plan_key: planKey,
    actor: 'orchestrator',
    source: 'auto-pdq',
    operator_type: 'OpQualityReview',
    plans_reviewed: Array.isArray(reportOut?.plans) ? reportOut.plans : [planKey],
    confidence: reportOut?.confidence || 'descriptive-only',
    trace_gaps: Number.isFinite(Number(reportOut?.trace_gaps)) ? Number(reportOut.trace_gaps) : null,
    logical_decision: { review_scope: 'plan', trigger: terminalEvent || 'pipeline_completed', update_review_state: Boolean(reportOut?.review_state) },
    physical_action: { json_report: reportOut?.json || null, markdown_report: reportOut?.markdown || null, review_state: reportOut?.review_state || null }
  };
  const dir = path.join(STATE, 'orchestrator-events', slug(projectPath));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${pid}.jsonl`);
  writeFileSync(file, `${JSON.stringify(rec)}\n`, { encoding: 'utf8', flag: 'a' });
  return file;
}
const a = parse(process.argv.slice(2));
if (['0', 'false', 'no', 'off'].includes(String(process.env.PIDEX_AUTO_PDQ || '1').toLowerCase())) process.exit(0);
const script = path.join(ROOT, 'scripts', 'quality', 'report.mjs');
if (!existsSync(script)) process.exit(0);
const cp = spawnSync(process.execPath, [script, '--project', a.project, '--plan', a.plan], { cwd: ROOT, encoding: 'utf8', timeout: Number(process.env.PIDEX_AUTO_PDQ_TIMEOUT_SECONDS || 120) * 1000 });
const stdout = cp.stdout.trim();
if (stdout) console.log(stdout);
if (cp.status !== 0) { if (cp.stderr.trim()) console.error(cp.stderr.trim()); process.exit(cp.status || 1); }
try {
  const parsed = stdout ? JSON.parse(stdout) : null;
  const eventFile = appendQualityReview(a.project, a.plan, a.pipelineId, a.terminalEvent, parsed);
  console.log(JSON.stringify({ op_quality_review: eventFile }));
  runContractGovernor(a.project, a.plan, parsed);
} catch (error) {
  console.error(`Failed to append OpQualityReview: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
