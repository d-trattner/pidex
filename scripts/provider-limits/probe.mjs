#!/usr/bin/env node
// Provider-limits probe helper. Node implementation for cross-platform use.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = path.join(ROOT, 'state', 'provider-limits');
const ALERT_STATE = path.join(STATE, 'alert-state.json');
const HISTORY = path.join(STATE, 'history.jsonl');
const PROFILES = path.join(ROOT, 'config', 'profiles');

function nowIso() { return new Date().toISOString(); }
function parseTime(value) {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value * 1000);
  const d = new Date(String(value).replace(/Z$/, 'Z'));
  return Number.isFinite(d.getTime()) ? d : null;
}
function resetBucket(value) {
  const d = parseTime(value);
  if (!d) return 'unknown';
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}
function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  return raw == null ? defaultValue : ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}
function durationText(seconds) {
  if (seconds == null) return 'unknown';
  const s = Math.max(0, Math.trunc(Number(seconds)) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function loadJson(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } }
function writeJson(file, data, pretty = false) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8'); }
function listProfiles() {
  try { return readdirSync(PROFILES).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json')).sort(); } catch { return []; }
}
function activeProfile() {
  const data = loadJson(path.join(STATE, 'active-profile.json'));
  const profiles = listProfiles();
  return profiles.includes(data.active_profile) ? data.active_profile : (profiles[0] || 'custom');
}
function nativeRecords() {
  const rows = loadJson(path.join(STATE, 'native-records.json')).records;
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
}
function codexToken() {
  if (process.env.CODEX_TOKEN) return process.env.CODEX_TOKEN;
  const authFile = process.env.CODEX_AUTH_FILE || path.join(os.homedir(), '.codex', 'auth.json');
  const data = loadJson(authFile);
  return data.tokens?.access_token || data.access_token || null;
}
async function getJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'pidex-provider-limits/0.1' }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
function codexAdditionalProviderName(limit) {
  const name = String(limit.limit_name || limit.metered_feature || 'additional').trim().toLowerCase();
  if (name.includes('spark') || name.includes('bengalfox')) return 'codex-spark';
  const slug = name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-');
  return `codex-${slug || 'additional'}`;
}
function appendCodexRateLimit(out, data, rl, provider, limitName = null, meteredFeature = null) {
  for (const [source, name] of [[rl.primary_window || {}, 'five_hour'], [rl.secondary_window || {}, 'seven_day']]) {
    const resetAt = source.reset_at ? parseTime(source.reset_at) : null;
    out.push({ provider, window: name, used_percent: source.used_percent, resets_at: resetAt ? resetAt.toISOString() : null, allowed: rl.allowed, limit_reached: rl.limit_reached, plan: data.plan_type, limit_name: limitName, metered_feature: meteredFeature });
  }
}
async function probeCodex() {
  const token = codexToken();
  if (!token) return [{ provider: 'codex', window: 'auth', error: 'missing Codex token' }];
  let data;
  try { data = await getJson('https://chatgpt.com/backend-api/wham/usage', token); }
  catch (error) { return [{ provider: 'codex', window: 'auth', error: `Codex usage probe failed: ${error instanceof Error ? error.message : String(error)}` }]; }
  const out = [];
  appendCodexRateLimit(out, data, data.rate_limit || {}, 'codex');
  for (const limit of data.additional_rate_limits || []) if (limit && typeof limit === 'object') appendCodexRateLimit(out, data, limit.rate_limit || {}, codexAdditionalProviderName(limit), limit.limit_name, limit.metered_feature);
  return out;
}
function writeHistory(records, capturedAt) {
  mkdirSync(STATE, { recursive: true });
  const lines = records.map((record) => JSON.stringify({ ...record, captured_at: capturedAt })).join('\n');
  if (lines) writeFileSync(HISTORY, `${lines}\n`, { encoding: 'utf8', flag: 'a' });
}
function activeProfileUsesSpark(profile = null) {
  const current = profile || activeProfile();
  if (current.includes('no-spark')) return false;
  if (current.includes('spark')) return true;
  const data = loadJson(path.join(PROFILES, `${current}.json`));
  return JSON.stringify(data).toLowerCase().includes('codex-spark');
}
function sparkLimitHit(records) {
  for (const record of records) {
    if (record.provider !== 'codex-spark') continue;
    const used = record.used_percent == null ? null : Number(record.used_percent);
    if (record.limit_reached || record.allowed === false || (Number.isFinite(used) && used >= 99)) return true;
  }
  return false;
}
function nonSparkFallbackProfile(current, profiles) {
  const noSpark = profiles.filter((p) => p.includes('no-spark'));
  if (!noSpark.length || noSpark.includes(current)) return null;
  const exact = current.replace('plus-spark', 'no-spark');
  if (noSpark.includes(exact)) return exact;
  if (current.startsWith('5.3') && noSpark.includes('5.3-no-spark-balanced')) return '5.3-no-spark-balanced';
  if (current.startsWith('5.5') && noSpark.includes('5.5-no-spark-balanced')) return '5.5-no-spark-balanced';
  return noSpark[0];
}
function applyRoutingProfile(profile) {
  const source = path.resolve(PROFILES, `${profile}.json`);
  const profileRoot = path.resolve(PROFILES);
  if (!source.startsWith(`${profileRoot}${path.sep}`)) throw new Error(`invalid profile path: ${profile}`);
  const raw = readFileSync(source, 'utf8');
  JSON.parse(raw);
  const target = path.join(ROOT, 'config', 'agents.json');
  const tmp = path.join(path.dirname(target), `.agents.json.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
  renameSync(tmp, target);
}
function setProfile(profile) {
  const profiles = listProfiles();
  if (!profiles.includes(profile)) throw new Error(`unknown profile: ${profile}`);
  applyRoutingProfile(profile);
  const payload = latestSnapshot();
  payload.active_profile = profile;
  delete payload.recommended_profile;
  mkdirSync(STATE, { recursive: true });
  writeJson(path.join(STATE, 'active-profile.json'), { active_profile: profile, updated: nowIso() });
  if (payload.latest == null) payload.latest = nowIso();
  writeJson(path.join(STATE, 'latest.json'), payload);
  return payload;
}
function autoSwitchIfNeeded(payload) {
  if (envBool('PIDEX_PROVIDER_LIMITS_DISABLE_AUTO_SWITCH', false)) return payload;
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (!sparkLimitHit(records)) return payload;
  const profiles = listProfiles();
  const current = String(payload.active_profile || activeProfile());
  const target = nonSparkFallbackProfile(current, profiles);
  if (!target) return payload;
  const switched = setProfile(target);
  switched.auto_profile_switch = { reason: 'codex-spark-limit-hit', from: current, to: target, updated: nowIso() };
  return switched;
}
async function refreshSnapshot() {
  const capturedAt = nowIso();
  const records = await probeCodex();
  for (const record of records) record.captured_at = capturedAt;
  let payload = { active_profile: activeProfile(), profiles: listProfiles(), records, generated_at: capturedAt, latest: capturedAt };
  mkdirSync(STATE, { recursive: true });
  writeJson(path.join(STATE, 'latest.json'), payload);
  writeHistory(records, capturedAt);
  payload = autoSwitchIfNeeded(payload);
  writeJson(path.join(STATE, 'latest.json'), payload);
  return payload;
}
function latestSnapshot() {
  let data = loadJson(path.join(STATE, 'latest.json'));
  if (!Object.keys(data).length) data = { active_profile: activeProfile(), profiles: listProfiles(), records: [], generated_at: nowIso(), latest: nowIso() };
  const profiles = listProfiles();
  data.profiles = profiles;
  if (!profiles.includes(data.active_profile)) data.active_profile = activeProfile();
  if (!Array.isArray(data.records) || !data.records.length) data.records = nativeRecords();
  delete data.recommended_profile;
  data = autoSwitchIfNeeded(data);
  mkdirSync(STATE, { recursive: true });
  writeJson(path.join(STATE, 'latest.json'), data);
  return data;
}
function shouldAlertRecord(record, payload) {
  if (record.provider !== 'codex-spark') return true;
  if (envBool('PIDEX_PROVIDER_ALERT_SPARK_WHEN_INACTIVE', false)) return true;
  return activeProfileUsesSpark(String(payload.active_profile || activeProfile()));
}
function alert(dryRun = false) {
  const payload = latestSnapshot();
  const state = loadJson(ALERT_STATE);
  const onceUntilReset = envBool('PIDEX_PROVIDER_ALERT_ONCE_UNTIL_RESET', true);
  const sent = [];
  for (const record of payload.records || []) {
    if (!record || typeof record !== 'object' || !shouldAlertRecord(record, payload) || record.used_percent == null) continue;
    const used = Number(record.used_percent);
    const projected = Boolean(record.projected_before_reset);
    const limitReached = Boolean(record.limit_reached);
    let level = null;
    if (limitReached || used >= 95 || projected) level = 'danger';
    else if (used >= 80) level = 'warning';
    if (!level) continue;
    const key = onceUntilReset ? `limit-once:${record.provider}:${record.window}:${resetBucket(record.resets_at)}` : `limit:${record.provider}:${record.window}:${record.resets_at}:${level}`;
    if (state[key] === 'sent') continue;
    const reset = parseTime(record.resets_at);
    const resetAfter = reset ? Math.trunc((reset.getTime() - Date.now()) / 1000) : null;
    const forecast = record.forecast_confidence != null && record.forecast_confidence !== 'none' ? ` Forecast: ${record.forecast_confidence} confidence, burn ${record.burn_percent_per_hour}%/h, exhaustion ${record.projected_exhaustion_at || 'not before reset'}.` : '';
    const msg = `${level.toUpperCase()}: ${record.provider} ${record.window} quota is at ${used}%. Reset: ${record.resets_at || 'unknown'} (in ${durationText(resetAfter)}).${forecast}`;
    if (dryRun) console.log(msg);
    else {
      spawnSync(path.join(ROOT, 'scripts', 'telegram', 'notify.sh'), ['--optional', '--project', ROOT, '--needs', 'Provider limit attention', '--context', msg], { stdio: 'ignore' });
      state[key] = 'sent';
    }
    sent.push(key);
  }
  if (!dryRun) writeJson(ALERT_STATE, state, true);
  return { sent, count: sent.length };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  let result;
  if (!command || command === 'latest') result = latestSnapshot();
  else if (command === 'refresh') result = await refreshSnapshot();
  else if (command === 'use') result = setProfile(rest[0]);
  else if (command === 'alert') result = alert(rest.includes('--dry-run'));
  else { console.error(`Unknown command: ${command}`); process.exit(2); }
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
