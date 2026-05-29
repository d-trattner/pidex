#!/usr/bin/env node
// Deterministic contract-correction proposal detector for PDQ reports.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CONTRACTS } from './operator-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function parse(argv) { const out = { root: ROOT, project: process.cwd(), report: '', jsonOut: '', maxProposals: '5' }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '-h' || a === '--help') out.help = true; else if (a.startsWith('--')) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; else { console.error(`Unknown arg: ${a}`); process.exit(2); } } return out; }
function slug(v) { return String(v || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'unknown'; }
function hash(v) { return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16); }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function readJsonl(file) { if (!existsSync(file)) return []; return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)); }
function walk(dir) { let out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out = out.concat(walk(p)); else out.push(p); } return out; }
function latestReport(root, project) { const projectPath = path.resolve(project); const files = walk(path.join(root, 'state', 'quality')).filter((p) => p.endsWith('.json') && path.basename(p) !== 'review-state.json'); const reports = files.map((file) => { try { return { file, report: readJson(file) }; } catch { return null; } }).filter((r) => r?.report?.summary && path.resolve(String(r.report.project_path || '')) === projectPath); reports.sort((a, b) => (Date.parse(b.report.generated_at || '') || 0) - (Date.parse(a.report.generated_at || '') || 0)); return reports[0]; }
function decisions(root, project) { const projectPath = path.resolve(project); return walk(path.join(root, 'state', 'orchestrator-events')).filter((p) => p.endsWith('.jsonl')).flatMap(readJsonl).filter((r) => r.operator_type === 'OpDecision' && path.resolve(String(r.project_path || projectPath)) === projectPath); }
function forbiddenCheck(operatorType, patch) { const broadReasons = Array.isArray(patch.allowed_skip_reasons) && patch.allowed_skip_reasons.length > 12; return { touches_security_gate: operatorType === 'OpGate' || operatorType === 'OpReview', touches_release_gate: false, removes_required_operator: false, broadens_skip_reasons: broadReasons }; }
function proposal(operatorType, patch, reason, evidence, reportFile) { const contract = CONTRACTS[operatorType] || {}; const fingerprint = { operatorType, patch, evidence: evidence.slice(0, 10).map((e) => e._source_path || e.timestamp || e.plan_key || e.reason) }; const id = `contract-correction-${hash(fingerprint)}`; return { proposal_id: id, id, operator_type: operatorType, contract_id: contract.contract_id || null, current_contract: contract, proposed_patch: patch, reason, evidence: { matching_findings: evidence.filter((e) => e.kind === 'finding').map((e) => e.row), matching_op_decisions: evidence.filter((e) => e.kind === 'decision').map((e) => e.row), source_reports: [reportFile], relevant_rules: [] }, impact_estimate: { affected_findings: evidence.filter((e) => e.kind === 'finding').length, severity_before: evidence.filter((e) => e.kind === 'finding').reduce((acc, e) => { const s = e.row.severity || 'unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}), historical_reclassification: 'future-only' }, forbidden_changes_check: forbiddenCheck(operatorType, patch) }; }
export function detectContractCorrections({ report, reportFile = null, opDecisions = [], maxProposals = 5 }) {
  const findings = report?.summary?.operator_trace?.findings || [];
  const proposals = [];
  const expectationGroups = new Map();
  for (const d of opDecisions) if (d.decision_type === 'expectation_correction' && d.target_operator) { const key = d.target_operator; const arr = expectationGroups.get(key) || []; arr.push(d); expectationGroups.set(key, arr); }
  for (const [operatorType, rows] of expectationGroups) {
    const withPatch = rows.filter((r) => r.proposed_expectation || r.contract_patch);
    if (!withPatch.length) continue;
    const patch = withPatch.at(-1).contract_patch || withPatch.at(-1).proposed_expectation;
    proposals.push(proposal(operatorType, patch, `Repeated expectation correction decisions for ${operatorType}.`, rows.map((row) => ({ kind: 'decision', row })), reportFile));
  }
  const byOp = new Map();
  for (const f of findings) if (f.contract_id && f.type !== 'valid_skip') { const arr = byOp.get(f.operator_type) || []; arr.push(f); byOp.set(f.operator_type, arr); }
  for (const [operatorType, rows] of byOp) {
    if (rows.length < 3) continue;
    const contract = CONTRACTS[operatorType] || {};
    if (operatorType === 'OpQualityReview' && rows.every((r) => String(r.reason || '').includes('terminal pipeline event'))) {
      proposals.push(proposal(operatorType, { required_when: 'terminal pipeline event exists and auto-PDQ hooks were enabled' }, 'Repeated OpQualityReview gaps suggest required_when is too broad for manual/backfilled terminal events.', rows.map((row) => ({ kind: 'finding', row })), reportFile));
    } else if (contract.allowed_skip_reasons) {
      // Conservative generic proposal: no patch, pending report only, for visibility.
    }
  }
  const seen = new Set();
  return proposals.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).slice(0, Number(maxProposals) || 5);
}
function usage() { return 'Usage: contract-correction-detector.mjs --project <path> [--report report.json] [--json-out out.json]'; }
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parse(process.argv.slice(2));
  if (args.help) { console.log(usage()); process.exit(0); }
  try { const root = path.resolve(args.root || ROOT); const rep = args.report ? { file: args.report, report: readJson(args.report) } : latestReport(root, args.project); const proposals = rep ? detectContractCorrections({ report: rep.report, reportFile: rep.file, opDecisions: decisions(root, args.project), maxProposals: args.maxProposals }) : []; const out = { ok: true, generated_at: new Date().toISOString(), project_path: path.resolve(args.project), report: rep?.file || null, proposals }; if (args.jsonOut) { mkdirSync(path.dirname(args.jsonOut), { recursive: true }); writeFileSync(args.jsonOut, `${JSON.stringify(out, null, 2)}\n`, 'utf8'); } console.log(JSON.stringify(out, null, 2)); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
}
