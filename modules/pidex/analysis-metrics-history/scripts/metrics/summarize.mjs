#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function slug(value) { return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown'; }
function parse(argv) { const out = { project: '', plan: '' }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--project') out.project = argv[++i] || ''; else if (a === '--plan') out.plan = argv[++i] || ''; else if (a === '-h' || a === '--help') { console.log('Usage: summarize.mjs <plan-id> [--project PROJECT]\n       summarize.mjs --plan <plan-id> [--project PROJECT]'); process.exit(0); } else if (!out.plan) out.plan = a; else { console.error(`Unknown arg: ${a}`); process.exit(2); } } if (!out.plan) { console.error('plan id required'); process.exit(2); } return out; }
function isCodexRecord(rec) { if (['1', 'true', 'yes'].includes(String(process.env.PIDEX_SUMMARY_INCLUDE_ALL || '0').toLowerCase())) return true; const provider = String(rec.provider || '').toLowerCase(); const model = String(rec.model || '').toLowerCase(); return provider.includes('codex') || provider.includes('openai-codex') || model.includes('gpt-5.3-codex') || model.startsWith('openai-codex/'); }
function esc(value) { return String(value ?? '').replaceAll('|', '\\|'); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const stateDir = process.env.RUNNING_PI_STATE_DIR || path.join(root, 'state');
const args = parse(process.argv.slice(2));
const planSlug = slug(args.plan);
const base = path.join(stateDir, 'metrics');
let files = [];
if (args.project) files = [path.join(base, slug(args.project), `${planSlug}.jsonl`)];
else { try { files = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(base, d.name, `${planSlug}.jsonl`)); } catch {} }
const records = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const rec = JSON.parse(line); if (isCodexRecord(rec)) records.push({ ...rec, _file: file }); } catch {}
  }
}
if (!records.length) { console.log(`No metrics found for ${planSlug}`); process.exit(0); }
console.log(`# Running Pi metrics — ${planSlug}\n`);
console.log('| Agent | Verdict | Route To | Gate | Provider | Model | Exit | Duration | Input tok | Output tok | Cost | Fallback | Context file |');
console.log('|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|');
let totalCost = 0, hasCost = false, totalIn = 0, totalOut = 0, totalDuration = 0;
const verdicts = {}, routes = {};
for (const r of records) {
  const cost = typeof r.cost_usd_estimate === 'number' ? r.cost_usd_estimate : null;
  if (cost != null) { totalCost += cost; hasCost = true; }
  const duration = Number(r.duration_ms || 0); const inTok = Number(r.input_tokens_estimate || 0); const outTok = Number(r.output_tokens_estimate || 0);
  totalDuration += duration; totalIn += inTok; totalOut += outTok;
  verdicts[r.agent_verdict || 'unknown'] = (verdicts[r.agent_verdict || 'unknown'] || 0) + 1;
  routes[r.route_to || 'unknown'] = (routes[r.route_to || 'unknown'] || 0) + 1;
  console.log(`| ${esc(r.agent)} | ${esc(r.agent_verdict)} | ${esc(r.route_to)} | ${esc(r.gate)} | ${esc(r.provider)} | ${esc(r.model)} | ${r.exit_code ?? ''} | ${(duration / 1000).toFixed(1)}s | ${inTok} | ${outTok} | ${cost == null ? 'n/a' : `$${cost.toFixed(4)}`} | ${esc(r.fallback_from)} | ${esc(r.context_file)} |`);
}
console.log(`\n- Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
console.log(`- Total estimated tokens: input ${totalIn}, output ${totalOut}`);
console.log(`- Verdict counts: ${Object.entries(verdicts).sort().map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`- Route counts: ${Object.entries(routes).sort().map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(hasCost ? `- Total estimated cost: $${totalCost.toFixed(4)}` : '- Total estimated cost: n/a');
console.log('\nMetric files:');
for (const file of [...new Set(records.map((r) => r._file))].sort()) console.log(`- ${file}`);
