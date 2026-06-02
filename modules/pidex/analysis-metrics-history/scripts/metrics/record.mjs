#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parse(argv) {
  const out = { project: 'unknown', plan: 'unknown-plan', agent: 'unknown', provider: 'unknown', model: '', inputTokens: '0', outputTokens: '0', durationMs: '0', exitCode: '0', source: 'manual', fallbackFrom: '', logFile: '', finalTextChars: '0' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const v = () => argv[++i] || '';
    if (a === '--project') out.project = v(); else if (a === '--plan') out.plan = v(); else if (a === '--agent') out.agent = v(); else if (a === '--provider') out.provider = v(); else if (a === '--model') out.model = v(); else if (a === '--input-tokens') out.inputTokens = v(); else if (a === '--output-tokens') out.outputTokens = v(); else if (a === '--duration-ms') out.durationMs = v(); else if (a === '--exit' || a === '--exit-code') out.exitCode = v(); else if (a === '--source') out.source = v(); else if (a === '--fallback-from') out.fallbackFrom = v(); else if (a === '--log-file') out.logFile = v(); else if (a === '--final-text-chars') out.finalTextChars = v(); else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return out;
}
function isCodexProvider(provider, model) { const v = String(provider || '').toLowerCase().trim(); const m = String(model || '').toLowerCase(); return v === 'codex' || v === 'openai' || v.startsWith('openai-codex/') || v.includes('codex') || m.includes('codex') || m.startsWith('gpt-5.'); }
function slug(value) { return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown'; }
function asInt(value, fallback = 0) { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? n : fallback; }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const stateDir = process.env.RUNNING_PI_STATE_DIR || path.join(root, 'state');
const pricingFile = process.env.RUNNING_PI_PRICING_FILE || path.join(root, 'config', 'pricing.json');
const args = parse(process.argv.slice(2));
const allowNonCodex = String(process.env.PIDEX_RECORD_ALL_PROVIDERS || '0').toLowerCase();
if (!['1', 'true', 'yes'].includes(allowNonCodex) && args.provider && !isCodexProvider(args.provider, args.model)) process.exit(0);
let normalizedModel = String(args.model || '').trim();
if (normalizedModel.startsWith('-m ')) normalizedModel = normalizedModel.slice(3).trim();
if (normalizedModel.startsWith('--model ')) normalizedModel = normalizedModel.slice(8).trim();
let pricing = {};
try { pricing = JSON.parse(readFileSync(pricingFile, 'utf8')); } catch {}
const inTok = asInt(args.inputTokens); const outTok = asInt(args.outputTokens);
const price = pricing[normalizedModel];
const cost = price ? (inTok / 1_000_000) * Number(price.input || 0) + (outTok / 1_000_000) * Number(price.output || 0) : null;
const record = { timestamp: new Date().toISOString(), project: args.project, plan: args.plan, agent: args.agent, provider: args.provider, model: normalizedModel || null, duration_ms: asInt(args.durationMs), exit_code: asInt(args.exitCode), fallback_from: args.fallbackFrom || null, input_tokens_estimate: inTok, output_tokens_estimate: outTok, cost_usd_estimate: cost, final_text_chars: asInt(args.finalTextChars), log_file: args.logFile || null, source: args.source };
const outDir = path.join(stateDir, 'metrics', slug(args.project));
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${slug(args.plan)}.jsonl`);
writeFileSync(outPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
console.log(outPath);
