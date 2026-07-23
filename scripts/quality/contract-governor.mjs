#!/usr/bin/env node
// Manual pending-only contract-governor runner. No apply, delegate, or validation authority.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { detectContractCorrections } from './contract-correction-detector.mjs';
import { loadContracts } from './operator-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTOMATION_KEYS = new Set(['enabled', 'background', 'mode', 'hot_mode', 'auto_apply', 'agent_enabled', 'model', 'escalation_model', 'effort', 'max_cost_usd_per_run', 'monitoring_window_reports']);
const AUTOMATION_ENV = ['PIDEX_CONTRACT_GOVERNOR', 'PIDEX_CONTRACT_GOVERNOR_HOT_MODE', 'PIDEX_CONTRACT_GOVERNOR_AUTO_APPLY', 'PIDEX_CONTRACT_GOVERNOR_AGENT'];
function parse(argv) { const out = { command: argv[0] || 'run', root: ROOT, project: process.cwd(), plan: 'unknown-plan', report: '', dryRun: false }; for (let i = 1; i < argv.length; i++) { const value = argv[i]; if (value === '--dry-run') out.dryRun = true; else if (value === '-h' || value === '--help') out.help = true; else if (value.startsWith('--')) out[value.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; else throw new Error(`unknown argument ${value}`); } return out; }
function readJson(file, fallback = null) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } }
function readJsonl(file) { try { return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse); } catch { return []; } }
function writeJson(file, value) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function appendJsonl(file, row) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', flag: 'a' }); }
function walk(dir) { let out = []; if (!existsSync(dir)) return out; for (const item of readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) out = out.concat(walk(file)); else out.push(file); } return out; }
function envEnables(value) { return value != null && !['', '0', 'false', 'no', 'off'].includes(String(value).toLowerCase()); }
function config(root) {
  const defaults = readJson(path.join(root, 'config/contract-governor.json'), {}); const localPath = path.join(root, 'config/contract-governor.local.json'); const local = readJson(localPath, {});
  const legacyKeys = [...new Set([...Object.keys(defaults || {}), ...Object.keys(local || {})].filter((key) => AUTOMATION_KEYS.has(key)))];
  const enabledEnv = AUTOMATION_ENV.filter((key) => envEnables(process.env[key]));
  if (legacyKeys.length || enabledEnv.length) { const error = new Error(`GOVERNOR_AUTOMATION_UNSUPPORTED: ${[...legacyKeys, ...enabledEnv].join(',')}`); error.code = 'GOVERNOR_AUTOMATION_UNSUPPORTED'; throw error; }
  const merged = { ...defaults, ...local };
  const unknownKeys = Object.keys(merged).filter((key) => !['$schema', 'version', 'capability', 'timeout_seconds', 'max_proposals_per_run'].includes(key));
  if (unknownKeys.length) throw new Error(`GOVERNOR_CONFIG_INVALID: unknown fields ${unknownKeys.join(',')}`);
  if (merged.version !== 2 || merged.capability !== 'manual-pending-only') throw new Error('GOVERNOR_CONFIG_INVALID: expected version 2 manual-pending-only');
  const max = Number(merged.max_proposals_per_run ?? 5); const timeout = Number(merged.timeout_seconds ?? 60);
  if (!Number.isInteger(max) || max < 1 || max > 20 || !Number.isInteger(timeout) || timeout < 10 || timeout > 600) throw new Error('GOVERNOR_CONFIG_INVALID: invalid bounds');
  return { version: 2, capability: 'manual-pending-only', max_proposals_per_run: max, timeout_seconds: timeout };
}

export function acquireGovernorLock(root) {
  const lockDir = path.join(path.resolve(root), 'state/quality/contract-governor/.lock'); const token = randomUUID(); const tokenName = `owner-${token}`;
  try { mkdirSync(path.dirname(lockDir), { recursive: true }); mkdirSync(lockDir); writeFileSync(path.join(lockDir, tokenName), '', { flag: 'wx' }); writeJson(path.join(lockDir, 'meta.json'), { token, pid: process.pid, acquired_at: new Date().toISOString() }); }
  catch { return null; }
  return { token, lockDir, release() { try { const meta = readJson(path.join(lockDir, 'meta.json')); const entries = readdirSync(lockDir).sort(); if (meta?.token !== token || entries.length !== 2 || entries[0] !== 'meta.json' || entries[1] !== tokenName) return false; unlinkSync(path.join(lockDir, tokenName)); const reread = readJson(path.join(lockDir, 'meta.json')); if (reread?.token !== token || readdirSync(lockDir).some((name) => name !== 'meta.json')) return false; unlinkSync(path.join(lockDir, 'meta.json')); rmdirSync(lockDir); return true; } catch { return false; } } };
}
function allDecisions(root, project) { const projectPath = path.resolve(project); return walk(path.join(root, 'state/orchestrator-events')).filter((file) => file.endsWith('.jsonl')).flatMap(readJsonl).filter((row) => row.operator_type === 'OpDecision' && path.resolve(String(row.project_path || projectPath)) === projectPath); }
function latestReport(root, project) { const projectPath = path.resolve(project); return walk(path.join(root, 'state/quality')).filter((file) => file.endsWith('.json') && path.basename(file) !== 'review-state.json').map((file) => ({ file, report: readJson(file) })).filter((item) => item.report?.summary && path.resolve(String(item.report.project_path || '')) === projectPath).sort((a, b) => (Date.parse(b.report.generated_at || '') || 0) - (Date.parse(a.report.generated_at || '') || 0))[0] || null; }
function runId() { return `${Date.now()}-${randomUUID().slice(0, 12)}`; }
function writeRun(root, row) { const dir = path.join(root, 'state/quality/contract-governor', row.run_id); writeJson(path.join(dir, 'run.json'), row); mkdirSync(path.join(root, 'agents.output/quality/contract-governor'), { recursive: true }); writeFileSync(path.join(root, 'agents.output/quality/contract-governor', `${row.run_id}.md`), `# Contract Governor Pending-only Run\n\n- status: ${row.status}\n- proposals: ${row.proposals_pending || 0}\n- duplicates: ${row.duplicates || 0}\n`, 'utf8'); return row; }
function pendingExists(rows, id) { const latest = [...rows].reverse().find((row) => row.id === id); return latest?.status === 'pending'; }
function execute(args, cfg) {
  const root = path.resolve(args.root); const project = path.resolve(args.project); const id = runId(); const started = Date.now();
  let rep; let proposals;
  try {
    rep = args.report ? { file: path.resolve(args.report), report: readJson(path.resolve(args.report)) } : latestReport(root, project);
    if (!rep?.report?.summary) throw new Error('GOVERNOR_REPORT_INVALID: report missing summary');
    proposals = detectContractCorrections({ report: rep.report, reportFile: rep.file, opDecisions: allDecisions(root, project), maxProposals: cfg.max_proposals_per_run, contracts: loadContracts(root) });
  } catch (error) {
    if (args.dryRun) throw error;
    return writeRun(root, { ok: false, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: 'invalid_input', project_path: project, report: args.report ? path.resolve(args.report) : null, proposals_pending: 0, duplicates: 0, duration_ms: Date.now() - started, error_code: 'GOVERNOR_INPUT_INVALID', error: error instanceof Error ? error.message : String(error) });
  }
  if (args.dryRun) return { ok: true, capability: 'pending-only', status: proposals.length ? 'completed_pending' : 'completed_no_proposals', project_path: project, report: rep.file, proposals_pending: proposals.length, proposals };
  const lock = acquireGovernorLock(root);
  if (!lock) return writeRun(root, { ok: true, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: 'locked', project_path: project, report: rep.file, proposals_pending: 0, duplicates: 0, duration_ms: Date.now() - started });
  let row;
  try {
    const ledger = path.join(root, 'state/quality/contract-corrections.jsonl'); const existing = readJsonl(ledger); let duplicates = 0;
    for (const proposal of proposals) { if (pendingExists(existing, proposal.id)) { duplicates++; continue; } const pending = { timestamp: new Date().toISOString(), id: proposal.id, status: 'pending', capability: 'pending-only', operator_type: proposal.operator_type, contract_id: proposal.contract_id, reason: proposal.reason, contract_patch: proposal.proposed_patch, evidence: proposal.evidence }; appendJsonl(ledger, pending); existing.push(pending); }
    row = { ok: true, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: proposals.length ? 'completed_pending' : 'completed_no_proposals', project_path: project, plan_key: args.plan, report: rep.file, proposals_pending: proposals.length, duplicates, duration_ms: Date.now() - started, proposals };
  } catch (error) { row = { ok: false, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: 'failed', project_path: project, report: rep.file, proposals_pending: 0, duplicates: 0, duration_ms: Date.now() - started, error_code: 'GOVERNOR_RUN_FAILED', error: error instanceof Error ? error.message : String(error) }; }
  if (!lock.release()) { row.ok = false; row.status = 'failed'; row.error_code = 'GOVERNOR_LOCK_RELEASE_UNCERTAIN'; }
  return writeRun(root, row);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parse(process.argv.slice(2));
  if (args.help) { console.log('Usage: contract-governor.mjs run --project <path> --report <report.json> [--dry-run]'); process.exit(0); }
  if (args.command !== 'run') { console.error(`GOVERNOR_COMMAND_UNSUPPORTED: ${args.command}`); process.exit(2); }
  try { const result = execute(args, config(path.resolve(args.root))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok === false ? 1 : 0; } catch (error) { const message = error instanceof Error ? error.message : String(error); console.error(message); process.exit(message.startsWith('GOVERNOR_AUTOMATION_UNSUPPORTED') ? 2 : 1); }
}
