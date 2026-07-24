#!/usr/bin/env node
// Manual pending-only contract-governor runner. No apply, delegate, or validation authority.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { detectContractCorrections } from './contract-correction-detector.mjs';
import { loadContracts } from './operator-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTOMATION_KEYS = new Set(['enabled', 'background', 'mode', 'hot_mode', 'auto_apply', 'agent_enabled', 'model', 'escalation_model', 'effort', 'max_cost_usd_per_run', 'monitoring_window_reports']);
const AUTOMATION_ENV = ['PIDEX_CONTRACT_GOVERNOR', 'PIDEX_CONTRACT_GOVERNOR_HOT_MODE', 'PIDEX_CONTRACT_GOVERNOR_AUTO_APPLY', 'PIDEX_CONTRACT_GOVERNOR_AGENT'];
function parse(argv) { const out = { command: argv[0] || 'run', root: ROOT, project: process.cwd(), plan: 'unknown-plan', report: '', dryRun: false }; for (let i = 1; i < argv.length; i++) { const value = argv[i]; if (value === '--dry-run') out.dryRun = true; else if (value === '-h' || value === '--help') out.help = true; else if (value.startsWith('--')) out[value.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; else throw new Error(`unknown argument ${value}`); } return out; }
function readJsonRequired(file, code) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error(`${code}: ${file}`); } }
function readJsonOptional(file, fallback, code) { if (!existsSync(file)) return fallback; return readJsonRequired(file, code); }
function readJsonlStrict(file, code) { if (!existsSync(file)) return []; try { return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); } catch { throw new Error(`${code}: ${file}`); } }
function errorCode(error, fallback) { const message = error instanceof Error ? error.message : String(error); const code = /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1]; return { code: code || fallback, message }; }
function writeJson(file, value) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function appendJsonl(file, row) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', flag: 'a' }); }
function walk(dir) { let out = []; if (!existsSync(dir)) return out; for (const item of readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) out = out.concat(walk(file)); else out.push(file); } return out; }
function envEnables(value) { return value != null && !['', '0', 'false', 'no', 'off'].includes(String(value).toLowerCase()); }
function config(root) {
  const defaults = readJsonRequired(path.join(root, 'config/contract-governor.json'), 'GOVERNOR_CONFIG_INVALID'); const localPath = path.join(root, 'config/contract-governor.local.json'); const local = readJsonOptional(localPath, {}, 'GOVERNOR_CONFIG_INVALID');
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults) || !local || typeof local !== 'object' || Array.isArray(local)) throw new Error('GOVERNOR_CONFIG_INVALID: config files must contain objects');
  const legacyKeys = [...new Set([...Object.keys(defaults || {}), ...Object.keys(local || {})].filter((key) => AUTOMATION_KEYS.has(key)))];
  const enabledEnv = AUTOMATION_ENV.filter((key) => envEnables(process.env[key]));
  if (legacyKeys.length || enabledEnv.length) { const error = new Error(`GOVERNOR_AUTOMATION_UNSUPPORTED: ${[...legacyKeys, ...enabledEnv].join(',')}`); error.code = 'GOVERNOR_AUTOMATION_UNSUPPORTED'; throw error; }
  const merged = { ...defaults, ...local };
  const unknownKeys = Object.keys(merged).filter((key) => !['$schema', 'version', 'capability', 'max_proposals_per_run'].includes(key));
  if (unknownKeys.length) throw new Error(`GOVERNOR_CONFIG_INVALID: unknown fields ${unknownKeys.join(',')}`);
  if (merged.version !== 2 || merged.capability !== 'manual-pending-only') throw new Error('GOVERNOR_CONFIG_INVALID: expected version 2 manual-pending-only');
  const max = Number(merged.max_proposals_per_run ?? 5);
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('GOVERNOR_CONFIG_INVALID: max_proposals_per_run must be 1..20');
  return { version: 2, capability: 'manual-pending-only', max_proposals_per_run: max };
}

export function acquireGovernorLock(root, options = {}) {
  const lockDir = path.join(path.resolve(root), 'state/quality/contract-governor/.lock'); const token = randomUUID(); const tokenName = `owner-${token}`; const claimName = `release-${token}.json`;
  try { mkdirSync(path.dirname(lockDir), { recursive: true }); mkdirSync(lockDir); writeFileSync(path.join(lockDir, tokenName), token, { flag: 'wx' }); writeJson(path.join(lockDir, 'meta.json'), { token, pid: process.pid, acquired_at: new Date().toISOString() }); }
  catch { return null; }
  const hook = (step) => { if (typeof options.onReleaseStep === 'function') options.onReleaseStep(step, { lockDir, token, tokenName, claimName }); };
  const exact = (names) => JSON.stringify(readdirSync(lockDir).sort()) === JSON.stringify([...names].sort());
  const owns = (name) => readFileSync(path.join(lockDir, name), 'utf8').trim() === token;
  return { token, lockDir, release() { try {
    if (!exact(['meta.json', tokenName]) || readJsonRequired(path.join(lockDir, 'meta.json'), 'GOVERNOR_LOCK_INVALID')?.token !== token || !owns(tokenName)) return false;
    hook('before-claim');
    renameSync(path.join(lockDir, 'meta.json'), path.join(lockDir, claimName));
    hook('after-claim');
    if (!exact([claimName, tokenName]) || readJsonRequired(path.join(lockDir, claimName), 'GOVERNOR_LOCK_INVALID')?.token !== token || !owns(tokenName)) return false;
    hook('before-owner-unlink');
    if (!exact([claimName, tokenName]) || !owns(tokenName)) return false;
    unlinkSync(path.join(lockDir, tokenName));
    hook('after-owner-unlink');
    if (!exact([claimName]) || readJsonRequired(path.join(lockDir, claimName), 'GOVERNOR_LOCK_INVALID')?.token !== token) return false;
    unlinkSync(path.join(lockDir, claimName)); rmdirSync(lockDir); return true;
  } catch { return false; } } };
}
function allDecisions(root, project) { const projectPath = path.resolve(project); return walk(path.join(root, 'state/orchestrator-events')).filter((file) => file.endsWith('.jsonl')).flatMap((file) => readJsonlStrict(file, 'GOVERNOR_EVENT_INVALID')).filter((row) => row.operator_type === 'OpDecision' && path.resolve(String(row.project_path || projectPath)) === projectPath); }
function latestReport(root, project) { const projectPath = path.resolve(project); return walk(path.join(root, 'state/quality')).filter((file) => file.endsWith('.json') && path.basename(file) !== 'review-state.json').map((file) => ({ file, report: readJsonRequired(file, 'GOVERNOR_REPORT_INVALID') })).filter((item) => item.report?.summary && path.resolve(String(item.report.project_path || '')) === projectPath).sort((a, b) => (Date.parse(b.report.generated_at || '') || 0) - (Date.parse(a.report.generated_at || '') || 0))[0] || null; }
function runId() { return `${Date.now()}-${randomUUID().slice(0, 12)}`; }
function writeRun(root, row) { const dir = path.join(root, 'state/quality/contract-governor', row.run_id); writeJson(path.join(dir, 'run.json'), row); mkdirSync(path.join(root, 'agents.output/quality/contract-governor'), { recursive: true }); writeFileSync(path.join(root, 'agents.output/quality/contract-governor', `${row.run_id}.md`), `# Contract Governor Pending-only Run\n\n- status: ${row.status}\n- proposals: ${row.proposals_pending || 0}\n- duplicates: ${row.duplicates || 0}\n`, 'utf8'); return row; }
function pendingExists(rows, id) { const latest = [...rows].reverse().find((row) => row.id === id); return latest?.status === 'pending'; }
function execute(args, cfg) {
  const root = path.resolve(args.root); const project = path.resolve(args.project); const id = runId(); const started = Date.now();
  let rep; let proposals;
  try {
    rep = args.report ? { file: path.resolve(args.report), report: readJsonRequired(path.resolve(args.report), 'GOVERNOR_REPORT_INVALID') } : latestReport(root, project);
    if (!rep?.report?.summary) throw new Error('GOVERNOR_REPORT_INVALID: report missing summary');
    proposals = detectContractCorrections({ report: rep.report, reportFile: rep.file, opDecisions: allDecisions(root, project), maxProposals: cfg.max_proposals_per_run, contracts: loadContracts(root) });
  } catch (error) {
    if (args.dryRun) throw error;
    const failure = errorCode(error, 'GOVERNOR_INPUT_INVALID');
    return writeRun(root, { ok: false, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: 'invalid_input', project_path: project, report: args.report ? path.resolve(args.report) : null, proposals_pending: 0, duplicates: 0, duration_ms: Date.now() - started, error_code: failure.code, error: failure.message });
  }
  if (args.dryRun) return { ok: true, capability: 'pending-only', status: proposals.length ? 'completed_pending' : 'completed_no_proposals', project_path: project, report: rep.file, proposals_pending: proposals.length, proposals };
  const lock = acquireGovernorLock(root);
  if (!lock) return writeRun(root, { ok: true, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: 'locked', project_path: project, report: rep.file, proposals_pending: 0, duplicates: 0, duration_ms: Date.now() - started });
  let row;
  try {
    const ledger = path.join(root, 'state/quality/contract-corrections.jsonl'); const existing = readJsonlStrict(ledger, 'GOVERNOR_LEDGER_INVALID'); let duplicates = 0;
    for (const proposal of proposals) { if (pendingExists(existing, proposal.id)) { duplicates++; continue; } const pending = { timestamp: new Date().toISOString(), id: proposal.id, status: 'pending', capability: 'pending-only', operator_type: proposal.operator_type, contract_id: proposal.contract_id, reason: proposal.reason, contract_patch: proposal.proposed_patch, evidence: proposal.evidence }; appendJsonl(ledger, pending); existing.push(pending); }
    row = { ok: true, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: proposals.length ? 'completed_pending' : 'completed_no_proposals', project_path: project, plan_key: args.plan, report: rep.file, proposals_pending: proposals.length, duplicates, duration_ms: Date.now() - started, proposals };
  } catch (error) { const failure = errorCode(error, 'GOVERNOR_RUN_FAILED'); row = { ok: false, run_id: id, timestamp: new Date().toISOString(), capability: 'pending-only', status: 'failed', project_path: project, report: rep.file, proposals_pending: 0, duplicates: 0, duration_ms: Date.now() - started, error_code: failure.code, error: failure.message }; }
  if (!lock.release()) { row.ok = false; row.status = 'failed'; row.error_code = 'GOVERNOR_LOCK_RELEASE_UNCERTAIN'; }
  return writeRun(root, row);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parse(process.argv.slice(2));
  if (args.help) { console.log('Usage: contract-governor.mjs run --project <path> --report <report.json> [--dry-run]'); process.exit(0); }
  if (args.command !== 'run') { console.error(`GOVERNOR_COMMAND_UNSUPPORTED: ${args.command}`); process.exit(2); }
  try { const result = execute(args, config(path.resolve(args.root))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok === false ? 1 : 0; } catch (error) {
    const failure = errorCode(error, 'GOVERNOR_CONFIG_INVALID');
    if (failure.code === 'GOVERNOR_AUTOMATION_UNSUPPORTED' || args.dryRun) { console.error(failure.message); process.exit(failure.code === 'GOVERNOR_AUTOMATION_UNSUPPORTED' ? 2 : 1); }
    const root = path.resolve(args.root); const row = writeRun(root, { ok: false, run_id: runId(), timestamp: new Date().toISOString(), capability: 'pending-only', status: 'invalid_input', project_path: path.resolve(args.project), report: args.report ? path.resolve(args.report) : null, proposals_pending: 0, duplicates: 0, duration_ms: 0, error_code: failure.code, error: failure.message });
    console.log(JSON.stringify(row, null, 2)); process.exit(1);
  }
}
