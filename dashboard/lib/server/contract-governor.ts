import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PIDEX_ROOT } from './paths.ts';
type AnyRecord = Record<string, any>;

async function readJson(file: string, fallback: AnyRecord = {}) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function exists(file: string) { try { await fs.stat(file); return true; } catch { return false; } }
async function walk(dir: string): Promise<string[]> { const out: string[] = []; async function rec(current: string) { for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) { const target = path.join(current, entry.name); if (entry.isDirectory()) await rec(target); else out.push(target); } } await rec(dir); return out.sort(); }
async function readJsonl(file: string): Promise<AnyRecord[]> { try { return (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; } }
function pendingConfig(input: AnyRecord) { return { version: 2, capability: 'manual-pending-only', timeout_seconds: Math.max(10, Math.min(600, Number(input.timeout_seconds || 60))), max_proposals_per_run: Math.max(1, Math.min(20, Number(input.max_proposals_per_run || 5))) }; }
function collapse(rows: AnyRecord[]) { const map = new Map<string, AnyRecord>(); for (const row of rows) { const id = row.id || row.proposal_id; if (!id) continue; map.set(id, { ...(map.get(id) || {}), ...row, source_status: row.status }); } return [...map.values()]; }
function assess(row: AnyRecord) { const lacksBaseline = row.status === 'validated' && !row.validation_metrics?.matching_findings_before; const manual = row.approved_by && row.approved_by !== 'pidex-contract-governor'; return lacksBaseline && manual ? { ...row, assessment: 'inconclusive', assessment_reason: 'Legacy manual correction has no immutable baseline or post-apply report window.' } : row; }

export async function getContractGovernorStatus(root = PIDEX_ROOT) {
  const defaults = await readJson(path.join(root, 'config/contract-governor.json'));
  const localPath = path.join(root, 'config/contract-governor.local.json');
  const local = await readJson(localPath, {});
  const legacyKeys = Object.keys(local).filter((key) => ['enabled', 'background', 'mode', 'hot_mode', 'auto_apply', 'agent_enabled', 'model', 'escalation_model', 'effort', 'max_cost_usd_per_run', 'monitoring_window_reports'].includes(key));
  const runFiles = (await walk(path.join(root, 'state/quality/contract-governor'))).filter((file) => file.endsWith('run.json'));
  const runs = (await Promise.all(runFiles.map((file) => readJson(file).then((row) => ({ ...row, path: file }))))).filter((row) => row.run_id || row.status).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, 20);
  const corrections = await readJsonl(path.join(root, 'state/quality/contract-corrections.jsonl'));
  const latest = collapse(corrections).map(assess).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  return { ok: true, capability: 'manual-pending-only', default_config: defaults, local_config_exists: await exists(localPath), legacy_local_config_keys: legacyKeys, effective_config: pendingConfig(defaults), runs, corrections: corrections.slice(-100).reverse(), latest_corrections: latest, pending: latest.filter((row) => row.status === 'pending').slice(0, 50), approved: latest.filter((row) => ['approved', 'applied', 'monitoring', 'validated', 'needs_review', 'superseded'].includes(row.status) || row.applied_at || row.monitoring_status).slice(0, 50) };
}
