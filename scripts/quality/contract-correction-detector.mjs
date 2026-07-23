#!/usr/bin/env node
// Deterministic pending-only contract-correction proposal detector.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CONTRACTS, MUTABLE_OPERATORS, loadContracts } from './operator-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function parse(argv) { const out = { root: ROOT, project: process.cwd(), report: '', jsonOut: '', maxProposals: '5' }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '-h' || a === '--help') out.help = true; else if (a.startsWith('--')) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i]; else throw new Error(`unknown argument ${a}`); } return out; }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function readJsonl(file) { if (!existsSync(file)) return []; return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function walk(dir) { let out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out = out.concat(walk(p)); else out.push(p); } return out; }
function latestReport(root, project) { const projectPath = path.resolve(project); return walk(path.join(root, 'state/quality')).filter((p) => p.endsWith('.json') && path.basename(p) !== 'review-state.json').map((file) => { try { return { file, report: readJson(file) }; } catch { return null; } }).filter((x) => x?.report?.summary && path.resolve(String(x.report.project_path || '')) === projectPath).sort((a, b) => (Date.parse(b.report.generated_at || '') || 0) - (Date.parse(a.report.generated_at || '') || 0))[0]; }
function decisions(root, project) { const projectPath = path.resolve(project); return walk(path.join(root, 'state/orchestrator-events')).filter((p) => p.endsWith('.jsonl')).flatMap(readJsonl).filter((row) => row.operator_type === 'OpDecision' && path.resolve(String(row.project_path || projectPath)) === projectPath); }
function proposal(operatorType, reasons, evidence, contract) { const patch = { allowed_skip_reasons: reasons }; const id = `contract-correction-${hash({ operator_type: operatorType, contract_id: contract.contract_id, patch })}`; return { proposal_id: id, id, operator_type: operatorType, contract_id: contract.contract_id, current_contract: contract, proposed_patch: patch, reason: `Repeated explicit decisions use unsupported reasons for ${operatorType}.`, evidence: { matching_findings: [], matching_op_decisions: evidence, source_reports: [], relevant_rules: [] }, impact_estimate: { affected_findings: 0, historical_reclassification: 'future-only' }, capability: 'pending-only' }; }
export function detectContractCorrections({ report: _report, reportFile = null, opDecisions = [], maxProposals = 5, contracts = CONTRACTS }) {
  const groups = new Map();
  for (const row of opDecisions) {
    if (!MUTABLE_OPERATORS.has(row.target_operator) || !['skip_step', 'manual_evidence', 'backfill_evidence'].includes(row.decision_type) || !row.reason) continue;
    if (!['high', 'medium'].includes(String(row.confidence || 'medium')) && row.operator_approved !== true) continue;
    const contract = contracts[row.target_operator]; if (!contract || contract.allowed_skip_reasons.includes(row.reason)) continue;
    const key = `${row.target_operator}\0${row.reason}`; const rows = groups.get(key) || []; rows.push(row); groups.set(key, rows);
  }
  const out = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const [operatorType, reason] = key.split('\0'); const contract = contracts[operatorType];
    const reasons = [...new Set([...contract.allowed_skip_reasons, reason])].sort();
    if (reasons.length > 12) continue;
    const item = proposal(operatorType, reasons, rows, contract); item.evidence.source_reports = reportFile ? [reportFile] : []; out.push(item);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(maxProposals) || 5);
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { const args = parse(process.argv.slice(2)); if (args.help) { console.log('Usage: contract-correction-detector.mjs --project <path> [--report report.json]'); process.exit(0); } const root = path.resolve(args.root); const rep = args.report ? { file: args.report, report: readJson(args.report) } : latestReport(root, args.project); const proposals = rep ? detectContractCorrections({ report: rep.report, reportFile: rep.file, opDecisions: decisions(root, args.project), maxProposals: args.maxProposals, contracts: loadContracts(root) }) : []; const result = { ok: true, capability: 'pending-only', generated_at: new Date().toISOString(), project_path: path.resolve(args.project), report: rep?.file || null, proposals }; if (args.jsonOut) { mkdirSync(path.dirname(args.jsonOut), { recursive: true }); writeFileSync(args.jsonOut, `${JSON.stringify(result, null, 2)}\n`); } console.log(JSON.stringify(result, null, 2)); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
}
