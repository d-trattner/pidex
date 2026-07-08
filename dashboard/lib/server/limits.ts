import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type { JsonObject } from './api';
import { PIDEX_ROOT } from './paths';

export interface ProviderLimitRecord {
  provider: string;
  window?: string | null;
  limit_name?: string | null;
  metered_feature?: string | null;
  used_percent?: number | null;
  usage?: number | null;
  resets_at?: string | null;
  captured_at?: string | null;
  plan?: string | null;
  status?: string | null;
  limit_reached?: boolean | null;
  allowed?: boolean | null;
  cost?: number | null;
  error?: string | null;
  burn_percent_per_hour?: number | null;
  projected_exhaustion_at?: string | null;
  projected_before_reset?: boolean | null;
  forecast_confidence?: string | null;
  forecast_points?: number | null;
  forecast_span_hours?: number | null;
  hours_to_exhaustion?: number | null;
  hours_until_reset?: number | null;
  forecast_status?: 'forecast-hit-before-reset' | 'forecast-safe-until-reset' | 'insufficient-data' | 'unknown-limit';
}

export interface ProviderLimitsPayload {
  profiles: string[];
  active_profile: string;
  limits: ProviderLimitRecord[];
  records: ProviderLimitRecord[];
  history: ProviderLimitRecord[];
}

const ROOT = PIDEX_ROOT;
const PROFILE_DIR = path.resolve(ROOT, 'config', 'profiles');
const AGENTS_CONFIG_FILE = path.resolve(ROOT, 'config', 'agents.json');
const STATE_DIR = path.resolve(ROOT, 'state', 'provider-limits');
const STATE_FILE = path.resolve(STATE_DIR, 'latest.json');
const HISTORY_FILE = path.resolve(STATE_DIR, 'history.jsonl');
const ACTIVE_PROFILE_FILE = path.resolve(STATE_DIR, 'active-profile.json');
const PROBE_SCRIPT = path.resolve(ROOT, 'modules', 'pidex', 'provider-governance', 'scripts', 'provider-limits', 'probe.mjs');
const execFileAsync = promisify(execFile);
let refreshInFlight: Promise<void> | null = null;
let lastRefreshAttempt = 0;

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value).filter(Boolean).sort())];
}

function asNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function asBool(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return Boolean(value);
}

function asString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return String(value);
}

function parseTime(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function statusFor(used: number | null | undefined, projectedBeforeReset: boolean | null | undefined): string {
  if (used == null) return 'unknown';
  if (projectedBeforeReset || used >= 90) return 'danger';
  if (used >= 75) return 'warning';
  return 'healthy';
}

async function readProfiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(PROFILE_DIR, { withFileTypes: true });
    return unique(entries
      .filter((entry) => entry && entry.isFile() && entry.name.endsWith('.json'))
      .map((entry: { name: string; isFile: () => boolean }) => entry.name.replace(/\.json$/, '')));
  } catch {
    return [];
  }
}

async function readState(): Promise<JsonObject | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(raw) as JsonObject;
  } catch {
    return null;
  }
}

async function applyRoutingProfile(profile: string): Promise<void> {
  const source = path.resolve(PROFILE_DIR, `${profile}.json`);
  const relative = path.relative(PROFILE_DIR, source);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('invalid profile path');
  }
  const raw = await fs.readFile(source, 'utf-8');
  JSON.parse(raw);
  await fs.mkdir(path.dirname(AGENTS_CONFIG_FILE), { recursive: true });
  const tmp = path.resolve(path.dirname(AGENTS_CONFIG_FILE), `.agents.json.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf-8');
  await fs.rename(tmp, AGENTS_CONFIG_FILE);
}

function stateAgeMs(state: JsonObject | null): number | null {
  const raw = state?.latest || state?.generated_at;
  if (!raw) return null;
  const parsed = new Date(String(raw)).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Date.now() - parsed;
}

async function refreshIfStale(state: JsonObject | null): Promise<void> {
  if ((process.env.PIDEX_PROVIDER_LIMITS_AUTO_REFRESH || '1') === '0') return;
  const staleMs = Number(process.env.PIDEX_PROVIDER_LIMITS_STALE_MS || 120_000);
  const minAttemptMs = Number(process.env.PIDEX_PROVIDER_LIMITS_MIN_REFRESH_MS || 60_000);
  const age = stateAgeMs(state);
  if (age != null && age >= 0 && age < staleMs) return;
  const now = Date.now();
  if (now - lastRefreshAttempt < minAttemptMs) return;
  lastRefreshAttempt = now;
  if (!refreshInFlight) {
    refreshInFlight = execFileAsync(process.execPath, [PROBE_SCRIPT, 'refresh'], {
      cwd: ROOT,
      timeout: Number(process.env.PIDEX_PROVIDER_LIMITS_REFRESH_TIMEOUT_MS || 30_000),
      maxBuffer: 1024 * 1024,
    }).then(() => undefined).catch(() => undefined).finally(() => {
      refreshInFlight = null;
    });
  }
  await refreshInFlight;
}

async function readHistory(): Promise<ProviderLimitRecord[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
    return raw
      .split('\n')
      .filter(Boolean)
      .slice(-2000)
      .map((line) => JSON.parse(line) as JsonObject)
      .filter((entry) => entry && typeof entry === 'object')
      .map(sanitizeLimitEntry);
  } catch {
    return [];
  }
}

function sanitizeLimitEntry(entry: JsonObject): ProviderLimitRecord {
  const provider = String(entry.provider || '').toLowerCase();
  return {
    provider,
    window: asString(entry.window),
    limit_name: asString(entry.limit_name),
    metered_feature: asString(entry.metered_feature),
    used_percent: asNumber(entry.used_percent),
    usage: asNumber(entry.usage),
    resets_at: asString(entry.resets_at),
    captured_at: asString(entry.captured_at),
    plan: asString(entry.plan),
    status: asString(entry.status),
    limit_reached: asBool(entry.limit_reached),
    allowed: asBool(entry.allowed),
    cost: asNumber(entry.cost),
    error: asString(entry.error),
    burn_percent_per_hour: asNumber(entry.burn_percent_per_hour),
    projected_exhaustion_at: asString(entry.projected_exhaustion_at),
    projected_before_reset: asBool(entry.projected_before_reset),
    forecast_confidence: asString(entry.forecast_confidence),
    forecast_points: asNumber(entry.forecast_points),
    forecast_span_hours: asNumber(entry.forecast_span_hours),
    hours_to_exhaustion: asNumber(entry.hours_to_exhaustion),
    hours_until_reset: asNumber(entry.hours_until_reset),
  };
}

function sanitizeLimits(input: JsonObject | null): ProviderLimitRecord[] {
  if (!input || !Array.isArray(input.records)) return [];
  return input.records
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => sanitizeLimitEntry(entry as JsonObject));
}

function shouldIncludeHistorical(profile: string | undefined, includeHistorical: boolean): boolean {
  if (!profile) return includeHistorical;
  if (!includeHistorical) {
    const lowered = profile.toLowerCase();
    return ['codex', 'openai-codex', 'gpt-5.3-codex', 'pi'].some((item) => lowered.includes(item));
  }
  return true;
}

function forecastFromHistory(record: ProviderLimitRecord, now: Date, history: ProviderLimitRecord[]): Partial<ProviderLimitRecord> {
  const used = record.used_percent;
  const reset = parseTime(record.resets_at);
  if (used == null || !reset) {
    return { forecast_confidence: 'none', forecast_status: 'unknown-limit' };
  }

  const rows: Array<[Date, number]> = [];
  for (const row of history) {
    if (row.provider !== record.provider || row.window !== record.window) continue;
    if (row.used_percent == null) continue;
    if (row.resets_at && record.resets_at && row.resets_at !== record.resets_at) continue;
    const ts = parseTime(row.captured_at);
    if (!ts || (now.getTime() - ts.getTime()) > 48 * 3600 * 1000) continue;
    rows.push([ts, Number(row.used_percent)]);
  }

  rows.push([now, Number(used)]);
  rows.sort((a, b) => a[0].getTime() - b[0].getTime());

  const dedup: Array<[Date, number]> = [];
  const seen = new Set<number>();
  for (const [ts, val] of rows) {
    const key = Math.floor(ts.getTime() / 1000);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push([ts, val]);
  }

  if (dedup.length < 3) {
    return { forecast_confidence: 'none', forecast_points: dedup.length, forecast_status: 'insufficient-data' };
  }

  const spanHours = (dedup[dedup.length - 1][0].getTime() - dedup[0][0].getTime()) / 3600000;
  const delta = dedup[dedup.length - 1][1] - dedup[0][1];
  if (spanHours < 1 || delta <= 0) {
    return {
      forecast_confidence: 'none',
      forecast_points: dedup.length,
      forecast_span_hours: Math.round(spanHours * 100) / 100,
      forecast_status: 'forecast-safe-until-reset',
    };
  }

  const burnPerHour = delta / spanHours;
  if (burnPerHour <= 0) {
    return {
      forecast_confidence: 'none',
      forecast_points: dedup.length,
      forecast_span_hours: Math.round(spanHours * 100) / 100,
      forecast_status: 'forecast-safe-until-reset',
    };
  }

  const hoursTo100 = Math.max(0, (100 - Number(used)) / burnPerHour);
  const projectedAt = new Date(now.getTime() + hoursTo100 * 3600000);
  const hoursUntilReset = Math.max(0, (reset.getTime() - now.getTime()) / 3600000);
  const projectedBeforeReset = projectedAt.getTime() < reset.getTime();
  const isSevenDay = record.window === 'seven_day';
  const confidence = dedup.length >= 6 && spanHours >= (isSevenDay ? 12 : 3) ? 'high' : 'medium';
  const shouldWarn = projectedBeforeReset && (confidence === 'high' || Number(used) >= 75);

  return {
    forecast_confidence: confidence,
    forecast_points: dedup.length,
    forecast_span_hours: Math.round(spanHours * 100) / 100,
    burn_percent_per_hour: Math.round(burnPerHour * 1000) / 1000,
    projected_exhaustion_at: iso(projectedAt),
    projected_before_reset: projectedBeforeReset,
    hours_to_exhaustion: Math.round(hoursTo100 * 100) / 100,
    hours_until_reset: Math.round(hoursUntilReset * 100) / 100,
    forecast_status: shouldWarn ? 'forecast-hit-before-reset' : (confidence === 'medium' ? 'insufficient-data' : 'forecast-safe-until-reset'),
  };
}

function enrich(records: ProviderLimitRecord[], history: ProviderLimitRecord[]): ProviderLimitRecord[] {
  const now = new Date();
  return records.map((record) => {
    const fc = forecastFromHistory(record, now, history);
    const used = record.used_percent;
    const next: ProviderLimitRecord = {
      ...record,
      ...fc,
      provider: record.provider || 'unknown',
      status: record.status || statusFor(used, fc.projected_before_reset),
      cost: Number.isFinite(record.cost as number) ? Number(record.cost) : undefined,
    };
    return next;
  });
}

export async function getLimits(options?: { includeHistorical?: boolean }): Promise<ProviderLimitsPayload> {
  const includeHistorical = options?.includeHistorical ?? false;
  const profiles = await readProfiles();
  const initialState = await readState();
  await refreshIfStale(initialState);
  const state = await readState();
  const history = await readHistory();

  const activeProfile = String((state && (state.active_profile as string)) || 'codex-optimized');
  const limits: ProviderLimitRecord[] = enrich(sanitizeLimits(state), history);

  const records = limits
    .filter((record) => includeHistorical || shouldIncludeHistorical(record.provider, includeHistorical));
  const visibleHistory = history
    .filter((record) => includeHistorical || shouldIncludeHistorical(record.provider, includeHistorical));

  return {
    profiles,
    active_profile: activeProfile,
    limits: records,
    records,
    history: visibleHistory,
  };
}

export async function setProfile(profile: string): Promise<ProviderLimitsPayload> {
  const profiles = await readProfiles();
  if (!profiles.includes(profile)) {
    throw new Error('invalid profile');
  }

  await applyRoutingProfile(profile);
  const current = await readState();
  const payload = {
    ...(current || {}),
    active_profile: profile,
  };
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await Promise.all([
    fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8'),
    fs.writeFile(ACTIVE_PROFILE_FILE, JSON.stringify({ active_profile: profile, updated: new Date().toISOString() }, null, 2), 'utf-8'),
  ]);
  return getLimits({ includeHistorical: true });
}

export { PROFILE_DIR, STATE_FILE, HISTORY_FILE, ACTIVE_PROFILE_FILE };
