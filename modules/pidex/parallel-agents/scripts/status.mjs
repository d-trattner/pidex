#!/usr/bin/env node
// PIDEX optional parallel agents config/status helper. Node implementation for cross-platform use.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUPPORTED_AGENTS = new Set(['pidex-critic', 'pidex-code-reviewer']);
const WARNING_TYPES = new Set(['usage-limit-or-balance', 'auth-failed', 'provider-unavailable', 'timeout', 'tooling-error', 'unknown-error']);
const CRED_KEYS = /(api[_-]?key|token|secret|password|credential)/i;
const TOKEN_RE = /([A-Za-z0-9_-]{4})[A-Za-z0-9_.\/+=:-]{16,}([A-Za-z0-9_-]{4})/g;

function now() { return new Date().toISOString(); }
function rootFromScript() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'); }
function configPath(root, forWrite = false) {
  if (process.env.PIDEX_PARALLEL_AGENTS_CONFIG) return path.resolve(process.env.PIDEX_PARALLEL_AGENTS_CONFIG);
  const local = path.join(root, 'config', 'parallel-agents.local.json');
  if (forWrite || existsSync(local)) return local;
  return path.join(root, 'config', 'parallel-agents.json');
}
function paths(root, forWrite = false) { return [configPath(root, forWrite), path.join(root, 'state', 'parallel-agents', 'status.json'), path.join(root, 'state', 'telegram', 'parallel-agent-warnings.json')]; }
function loadJson(file, fallback) { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
function writeJson(file, data) { mkdirSync(path.dirname(file), { recursive: true }); const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`); writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); renameSync(tmp, file); }
function laneId(agent, provider, model) { return `${agent}:${provider}:${model}`; }
function redact(value, maxLen = 500) { return String(value || '').replace(TOKEN_RE, (_m, a, b) => `${a}…${b}`).slice(0, maxLen); }
function validateNoCreds(obj, current = '') {
  const errors = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const child = current ? `${current}.${k}` : String(k);
      if (CRED_KEYS.test(String(k))) errors.push(`credential-like field not allowed: ${child}`);
      errors.push(...validateNoCreds(v, child));
    }
  } else if (Array.isArray(obj)) obj.forEach((v, i) => errors.push(...validateNoCreds(v, `${current}[${i}]`)));
  return errors;
}
function normalizeConfig(raw = {}) {
  const errors = validateNoCreds(raw);
  const cfg = { schema_version: Number.parseInt(raw.schema_version || 1, 10), enabled: Boolean(raw.enabled ?? false), default_mode: raw.default_mode || 'opportunistic', dedupe_hours: Number.parseInt(raw.dedupe_hours || 6, 10), max_provider_models_per_agent: Number.parseInt(raw.max_provider_models_per_agent || 2, 10), agents: {} };
  if (cfg.max_provider_models_per_agent !== 2) { errors.push('max_provider_models_per_agent must be 2'); cfg.max_provider_models_per_agent = 2; }
  const agents = raw.agents || {};
  for (const agent of Object.keys(agents)) if (!SUPPORTED_AGENTS.has(agent)) errors.push(`unsupported agent: ${agent}`);
  for (const agent of [...SUPPORTED_AGENTS].sort()) {
    const a = agents[agent] || {};
    let pms = a.provider_models || [];
    if (!Array.isArray(pms)) { errors.push(`${agent}.provider_models must be a list`); pms = []; }
    if (pms.length > 2) { errors.push(`${agent} has more than 2 provider_models`); pms = pms.slice(0, 2); }
    const seen = new Set(); const clean = [];
    pms.forEach((pm, idx) => {
      if (!pm || typeof pm !== 'object' || Array.isArray(pm)) { errors.push(`${agent}.provider_models[${idx}] must be object`); return; }
      const provider = String(pm.provider || '').trim(); const model = String(pm.model || '').trim();
      if (!provider || !model) { errors.push(`${agent}.provider_models[${idx}] requires provider and model`); return; }
      const key = `${provider}\0${model}`;
      if (seen.has(key)) { errors.push(`duplicate provider/model for ${agent}: ${provider}/${model}`); return; }
      seen.add(key); clean.push({ provider, model, effort: String(pm.effort || 'medium'), enabled: Boolean(pm.enabled ?? true) });
    });
    let mode = String(a.mode || cfg.default_mode);
    if (mode !== 'opportunistic') { errors.push(`unsupported mode for ${agent}: ${mode}`); mode = 'opportunistic'; }
    cfg.agents[agent] = { enabled: Boolean(a.enabled ?? false), trigger: String(a.trigger || (agent === 'pidex-critic' ? 'after-plan' : 'after-implementation')), mode, timeout_seconds: Number.parseInt(a.timeout_seconds || 600, 10), notify_on_unavailable: Boolean(a.notify_on_unavailable ?? true), provider_models: clean };
  }
  return [cfg, errors];
}
function loadConfig(root) { return normalizeConfig(loadJson(paths(root)[0], {})); }
function mergeStatus(root) {
  const [configPath, statePath] = paths(root);
  const [cfg, errors] = loadConfig(root);
  const state = loadJson(statePath, {});
  const lanesState = state.lanes || {}; const agents = []; const warnings = state.warnings || [];
  for (const [agent, a] of Object.entries(cfg.agents)) {
    const pms = (a.provider_models || []).map((pm) => { const lid = laneId(agent, pm.provider, pm.model); const st = lanesState[lid] || {}; return { ...pm, lane_id: lid, last_attempt_at: st.last_attempt_at, last_success_at: st.last_success_at, last_failure_at: st.last_failure_at, last_status: st.last_status, last_message: st.last_message, warning_active: Boolean(st.warning_active || false), warning_type: st.warning_type, telegram_notified_at: st.telegram_notified_at }; });
    agents.push({ ...a, agent, provider_models: pms });
  }
  return { ok: errors.length === 0 && existsSync(configPath), errors, config_path: configPath, state_path: statePath, enabled: cfg.enabled, updated_at: state.updated_at, agents, warnings };
}
function eligibleLanes(root, agent = null, trigger = null) {
  const status = mergeStatus(root); const lanes = []; const direct = new Set(['pi', 'codex']);
  if (status.ok && status.enabled) for (const a of status.agents || []) {
    if (agent && a.agent !== agent) continue; if (trigger && a.trigger !== trigger) continue; if (!a.enabled) continue;
    for (const pm of a.provider_models || []) {
      if (!Boolean(pm.enabled ?? true)) continue;
      const provider = String(pm.provider || ''); const model = String(pm.model || '');
      lanes.push({ lane_id: pm.lane_id, agent: a.agent, trigger: a.trigger, provider, model, runner_provider: direct.has(provider) ? provider : 'pi', runner_model: direct.has(provider) ? model : `${provider}/${model}`, effort: pm.effort || 'medium', timeout_seconds: a.timeout_seconds, warning_active: Boolean(pm.warning_active || false), warning_type: pm.warning_type, last_status: pm.last_status });
    }
  }
  return { ok: Boolean(status.ok), enabled: Boolean(status.enabled), agent, trigger, lanes, errors: status.errors || [] };
}
function classifyMsg(msg) { const s = String(msg).toLowerCase(); if (/usage limit|rate limit|quota|insufficient balance|no balance|billing|payment required|subscription|limit reached|\b429\b/.test(s)) return 'usage-limit-or-balance'; if (/auth|authentication|unauthorized|forbidden|\b401\b|\b403\b|login required/.test(s)) return 'auth-failed'; if (/timeout|timed out|deadline exceeded/.test(s)) return 'timeout'; if (/provider unavailable|service unavailable|\b503\b|connection refused|network/.test(s)) return 'provider-unavailable'; return 'unknown-error'; }
function updateLane(root, lid, status, message = '', wtype = null, noTelegram = false) {
  const [cfg] = loadConfig(root); const [, statePath] = paths(root); const state = loadJson(statePath, { schema_version: 1, lanes: {}, warnings: [] });
  state.schema_version ||= 1; state.enabled = cfg.enabled || false; state.updated_at = now(); state.lanes ||= {}; state.warnings ||= [];
  const [agent = '', provider = '', model = ''] = `${lid}::`.split(':').slice(0, 3);
  const lane = state.lanes[lid] ||= { configured: false, enabled: false };
  Object.assign(lane, { agent, provider, model, last_attempt_at: now(), last_status: status, last_message: redact(message) });
  if (status === 'success') { Object.assign(lane, { last_success_at: now(), warning_active: false, warning_type: null }); state.warnings = state.warnings.filter((w) => w.lane !== lid); }
  else { const type = wtype || classifyMsg(message); Object.assign(lane, { last_failure_at: now(), warning_active: true, warning_type: type }); state.warnings = state.warnings.filter((w) => !(w.lane === lid && w.type === type)); state.warnings.push({ lane: lid, type, message: redact(message), last_seen: now() }); }
  const a = cfg.agents?.[agent]; if (a) Object.assign(lane, { configured: true, enabled: Boolean(a.enabled), trigger: a.trigger });
  writeJson(statePath, state); if (status !== 'success' && !noTelegram) maybeTelegram(root, cfg, lid, wtype || 'unknown-error', redact(message), state); return state;
}
function clearLane(root, lid) { const [, statePath] = paths(root); const state = loadJson(statePath, { schema_version: 1, lanes: {}, warnings: [] }); const lane = (state.lanes ||= {})[lid] ||= { configured: false, enabled: false }; Object.assign(lane, { warning_active: false, warning_type: null, last_status: 'cleared' }); state.warnings = (state.warnings || []).filter((w) => w.lane !== lid); state.updated_at = now(); writeJson(statePath, state); return state; }
function maybeTelegram(root, cfg, lid, wtype, msg, state) {
  if (['0', 'false', 'no', 'off'].includes(String(process.env.PIDEX_TELEGRAM_PARALLEL_WARNINGS || '1').toLowerCase())) return;
  const agent = lid.split(':', 1)[0]; if (!Boolean(cfg.agents?.[agent]?.notify_on_unavailable ?? true)) return;
  const [, statePath, dedupePath] = paths(root); const dedupe = loadJson(dedupePath, {}); const key = `${lid}:${wtype}`; const last = dedupe[key]; const hours = Number.parseInt(cfg.dedupe_hours || 6, 10);
  if (last && Date.now() - new Date(String(last).replace(/Z$/, 'Z')).getTime() < hours * 3600 * 1000) return;
  const script = path.join(root, 'scripts', 'telegram', 'notify.sh'); if (!existsSync(script)) return;
  const cp = spawnSync(script, [`PIDEX parallel lane warning\nlane: ${lid}\nstatus: ${wtype}\nmessage: ${msg}`], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  if (cp.error) return; dedupe[key] = now(); writeJson(dedupePath, dedupe); const lane = state.lanes?.[lid]; if (lane) { lane.telegram_notified_at = dedupe[key]; writeJson(statePath, state); }
}
function piAuthProviderPresent(provider) { try { const data = loadJson(path.join(os.homedir(), '.pi', 'agent', 'auth.json'), {}); const entry = data[String(provider).toLowerCase()]; return Boolean(entry && typeof entry === 'object' && entry.type); } catch { return false; } }
function providerAuth(provider) {
  const p = String(provider).toLowerCase(); if (piAuthProviderPresent(p)) return { authenticated: true, auth_reason: 'Pi auth store has provider credentials' };
  if (p === 'openai-codex') { const ok = Boolean(process.env.OPENAI_API_KEY) || existsSync(path.join(os.homedir(), '.codex', 'auth.json')); return { authenticated: ok, auth_reason: ok ? 'OPENAI_API_KEY or ~/.codex/auth.json' : 'missing OPENAI_API_KEY / codex login' }; }
  const envByProvider = { google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], openrouter: ['OPENROUTER_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'], minimax: ['MINIMAX_API_KEY'], anthropic: ['ANTHROPIC_API_KEY'] };
  const envs = envByProvider[p] || [`${p.toUpperCase().replaceAll('-', '_')}_API_KEY`]; const ok = envs.some((e) => process.env[e]); return { authenticated: ok, auth_reason: ok ? `env present: ${envs.join(', ')}` : `missing auth env: ${envs.join(', ')}` };
}
function modelEntry(provider, model) { const auth = providerAuth(provider); return { provider, model, id: `${provider}/${model}`, label: `${provider}/${model}`, ...auth }; }
function modelOptions(root) {
  const models = []; let source = 'pi --list-models';
  try { const cp = spawnSync('pi', ['--list-models'], { cwd: root, encoding: 'utf8', timeout: 20_000 }); if (cp.status === 0) for (const line of `${cp.stdout}\n${cp.stderr}`.split('\n')) { const cols = line.trim().split(/\s+/); if (cols.length >= 2 && cols[0] !== 'provider' && !cols[0].startsWith('-')) models.push(modelEntry(cols[0], cols[1])); } } catch (e) { source = `fallback: ${e instanceof Error ? e.message : String(e)}`; }
  if (!models.length) { const [cfg] = loadConfig(root); for (const a of Object.values(cfg.agents || {})) for (const pm of a.provider_models || []) models.push(modelEntry(pm.provider, pm.model)); const acfg = loadJson(path.join(root, 'config', 'agents.json'), {}); for (const r of Object.values(acfg.agents || {})) { const m = r?.model; if (typeof m === 'string' && m.includes('/')) { const [provider, model] = m.split('/', 2); models.push(modelEntry(provider, model)); } } }
  const seen = new Set(); const unique = models.filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; }); return { ok: Boolean(unique.length), source, models: unique };
}
function parseArgs(argv) { let root = rootFromScript(); const rest = []; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--root') root = path.resolve(argv[++i]); else rest.push(argv[i]); } return { root, args: rest }; }
function argValue(args, name, fallback = undefined) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; }
async function main() {
  const { root, args } = parseArgs(process.argv.slice(2)); const cmd = args[0]; let out; let code = 0;
  if (!cmd) { console.error('command required'); process.exit(2); }
  if (cmd === 'show') { out = mergeStatus(root); code = out.ok ? 0 : 1; }
  else if (cmd === 'config') { const [cfg, errors] = loadConfig(root); const [configPath] = paths(root); out = { ok: !errors.length && existsSync(configPath), errors, config: cfg }; code = out.ok ? 0 : 1; }
  else if (cmd === 'models') out = modelOptions(root);
  else if (cmd === 'eligible') { out = eligibleLanes(root, argValue(args, '--agent', null), argValue(args, '--trigger', null)); code = out.ok ? 0 : 1; }
  else if (cmd === 'save-config') { const rawArg = argValue(args, '--config-json'); const raw = String(rawArg || '').startsWith('@') ? readFileSync(String(rawArg).slice(1), 'utf8') : rawArg; const [cfg, errors] = normalizeConfig(JSON.parse(raw)); if (errors.length) { console.error(JSON.stringify({ ok: false, errors })); process.exit(2); } writeJson(paths(root, true)[0], cfg); out = { ok: true, config_path: paths(root, true)[0] }; }
  else if (cmd === 'classify') out = { ok: true, type: classifyMsg(argValue(args, '--message', '')) };
  else if (cmd === 'warn') { const type = argValue(args, '--type') || classifyMsg(argValue(args, '--message', '')); if (!WARNING_TYPES.has(type)) { console.error(`invalid warning type: ${type}`); process.exit(2); } updateLane(root, argValue(args, '--lane'), type, argValue(args, '--message', ''), type, args.includes('--no-telegram')); out = { ok: true, state_path: paths(root)[1] }; }
  else if (cmd === 'success') { updateLane(root, argValue(args, '--lane'), 'success', argValue(args, '--message', 'success')); out = { ok: true }; }
  else if (cmd === 'clear') { clearLane(root, argValue(args, '--lane')); out = { ok: true }; }
  else { console.error(`unknown command: ${cmd}`); process.exit(2); }
  if (cmd === 'classify' && !args.includes('--json')) console.log(out.type); else console.log(JSON.stringify(out, null, args.includes('--json') ? 0 : 2)); process.exitCode = code;
}
main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
