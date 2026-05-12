import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { JsonObject } from './api';

export interface ProviderLimitRecord {
  provider: string;
  window?: string | null;
  limit_name?: string | null;
  used_percent?: number | null;
  usage?: number | null;
  resets_at?: string | null;
  plan?: string | null;
  status?: string | null;
  limit_reached?: boolean | null;
  cost?: number | null;
}

export interface ProviderLimitsPayload {
  profiles: string[];
  active_profile: string;
  limits: ProviderLimitRecord[];
  records: ProviderLimitRecord[];
}

const ROOT = path.resolve(process.cwd(), '..');
const PROFILE_DIR = path.resolve(ROOT, 'config', 'profiles');
const STATE_FILE = path.resolve(ROOT, 'state', 'provider-limits', 'latest.json');

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value).filter(Boolean).sort())];
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

function sanitizeLimits(input: JsonObject | null): ProviderLimitRecord[] {
  if (!input || !Array.isArray(input.records)) return [];
  return input.records
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const provider = String((entry as JsonObject).provider || '').toLowerCase();
      return {
        provider,
        window: (entry as JsonObject).window as string | null | undefined,
        limit_name: (entry as JsonObject).limit_name as string | null | undefined,
        used_percent: (entry as JsonObject).used_percent as number | null | undefined,
        usage: (entry as JsonObject).usage as number | null | undefined,
        resets_at: (entry as JsonObject).resets_at as string | null | undefined,
        plan: (entry as JsonObject).plan as string | null | undefined,
        status: (entry as JsonObject).status as string | null | undefined,
        limit_reached: (entry as JsonObject).limit_reached as boolean | null | undefined,
        cost: (entry as JsonObject).cost as number | null | undefined,
      };
    });
}

function shouldIncludeHistorical(profile: string | undefined, includeHistorical: boolean): boolean {
  if (!profile) return includeHistorical;
  if (!includeHistorical) {
    const lowered = profile.toLowerCase();
    return ['codex', 'openai-codex', 'gpt-5.3-codex', 'pi'].some((item) => lowered.includes(item));
  }
  return true;
}

export async function getLimits(options?: { includeHistorical?: boolean }): Promise<ProviderLimitsPayload> {
  const includeHistorical = options?.includeHistorical ?? false;
  const profiles = await readProfiles();
  const state = await readState();

  const activeProfile = String((state && (state.active_profile as string)) || 'codex-optimized');
  const limits: ProviderLimitRecord[] = sanitizeLimits(state);

  const records = limits
    .filter((record) => includeHistorical || shouldIncludeHistorical(record.provider, includeHistorical))
    .map((record) => ({
      ...record,
      status: record.status || 'unknown',
      provider: record.provider || 'unknown',
      cost: Number.isFinite(record.cost as number) ? Number(record.cost) : undefined,
    }));

  return {
    profiles,
    active_profile: activeProfile,
    limits: records,
    records,
  };
}

export async function setProfile(profile: string): Promise<ProviderLimitsPayload> {
  const profiles = await readProfiles();
  if (!profiles.includes(profile)) {
    throw new Error('invalid profile');
  }

  const payload = await getLimits({ includeHistorical: true });
  payload.active_profile = profile;
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await Promise.all([
    fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8'),
  ]);
  return payload;
}

export { PROFILE_DIR, STATE_FILE };
