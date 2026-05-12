import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type DbValue = string | number | boolean | null;
export interface DbRow {
  [key: string]: DbValue | DbRow[] | DbRow;
}

export const HISTORICAL_PROVIDER_MARKERS = ['claude', 'gemini', 'openrouter', 'spark'];
export const PROVIDER_SORT_ORDER = ['codex', 'openai-codex', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'pi', 'unknown'];

const DASHBOARD_DIR = process.env.PIDEX_DASHBOARD_ROOT
  ? path.resolve(process.env.PIDEX_DASHBOARD_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DB_PATH = process.env.PIDEX_DASHBOARD_DB
  ? path.resolve(process.env.PIDEX_DASHBOARD_DB)
  : path.resolve(DASHBOARD_DIR, 'data', 'pidex.sqlite');

const PYTHON_QUERY = path.resolve(DASHBOARD_DIR, 'lib/server/sqlite-query.py');

export type SqlParams = Array<string | number | boolean | null>;

function queryError(message: string) {
  throw new Error(message);
}

function existsDb(): boolean {
  try {
    readFileSync(DB_PATH, { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

function normalizeParams(params: SqlParams): string {
  return JSON.stringify(params ?? []);
}

function runQueryInternal<T>(sql: string, params: SqlParams = []): T {
  if (!sql) {
    return [] as T;
  }
  if (!existsDb()) {
    return [] as T;
  }

  const payload = execFileSync('python3', [
    PYTHON_QUERY,
    DB_PATH,
    sql,
    normalizeParams(params),
  ], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!payload) {
    return [] as T;
  }

  try {
    const parsed = JSON.parse(payload) as { rows?: T; error?: string };
    if (typeof parsed === 'object' && parsed && 'error' in parsed && typeof (parsed as { error?: string }).error === 'string') {
      const message = (parsed as { error: string }).error;
      if (message.includes('no such table') || message.includes('no such column')) {
        return [] as T;
      }
      queryError(message);
    }
    return (Array.isArray(parsed) ? parsed : parsed.rows || []) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('JSON.parse')) {
      queryError('failed to parse sqlite query output');
    }
    if (message.includes('no such table') || message.includes('no such column')) {
      return [] as T;
    }
    throw error;
  }

  return [] as T;
}

export function queryRows<T>(sql: string, params: SqlParams = []): Promise<T[]> {
  return Promise.resolve(runQueryInternal<T[]>(sql, params));
}

export async function queryRow<T>(sql: string, params: SqlParams = []): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function queryValue<T = DbValue>(sql: string, params: SqlParams = []): Promise<T | null> {
  const row = await queryRow<Record<string, DbValue>>(sql, params);
  if (!row) return null;
  const firstKey = Object.keys(row)[0];
  if (!firstKey) return null;
  return (row[firstKey] as T) ?? null;
}

export function hasHistoricalProvider(value: string): boolean {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('codex')) return false;
  return HISTORICAL_PROVIDER_MARKERS.some((marker) => normalized.includes(marker));
}

export function isHiddenProvider(value: string): boolean {
  return hasHistoricalProvider(value);
}

export function providerSortKey(value: string): [number, string] {
  const normalized = (value || '').toLowerCase();
  for (let i = 0; i < PROVIDER_SORT_ORDER.length; i += 1) {
    if (normalized.startsWith(PROVIDER_SORT_ORDER[i])) {
      return [i, normalized];
    }
  }
  if (!normalized) return [PROVIDER_SORT_ORDER.length, ''];
  return [PROVIDER_SORT_ORDER.length, normalized];
}
