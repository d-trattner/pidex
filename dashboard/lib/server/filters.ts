import type { URLSearchParams } from 'node:url';

import { DASHBOARD_ROOT, PIDEX_ROOT } from './paths.ts';

export const DB_PROJECT_PLACEHOLDER_VALUES = new Set(['', 'all', 'all-projects', '*']);

export interface ProjectFilter {
  sql: string;
  params: Array<string | number | boolean | null>;
}

export function parseProjectFilter(params: URLSearchParams): ProjectFilter {
  const project = (params.get('project') || '').trim();
  if (project && !DB_PROJECT_PLACEHOLDER_VALUES.has(project.toLowerCase())) {
    return {
      sql: ' AND (p.name = ? OR p.path = ?)',
      params: [project, project],
    };
  }
  const internalFilter = ' AND p.path NOT IN (?, ?)';
  const internalParams = [PIDEX_ROOT, DASHBOARD_ROOT];
  if (parseBool(params.get('include_test_projects'))) return { sql: internalFilter, params: internalParams };
  return { sql: `${internalFilter} AND COALESCE(p.is_test_project, 0) = 0`, params: internalParams };
}

export function parseBool(value: string | null, defaultValue = false): boolean {
  if (!value) return defaultValue;
  return new Set(['1', 'true', 'yes', 'on']).has(value.toLowerCase());
}

export function parseLimit(raw: string | null, maxValue = 1000, fallback = 500): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maxValue);
}

export function parsePage(raw: string | null, fallback = 0): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
}

export function parseGranularity(raw: string | null): 'week' | 'month' {
  return raw === 'month' ? 'month' : 'week';
}

export function historicalFilter(whereExpr = '1=1', showHistorical = false): {
  clause: string;
  params: string[];
} {
  let clause = whereExpr;
  const params: string[] = [];
  if (!showHistorical) {
    clause = `${whereExpr} AND provider NOT LIKE '%claude%' AND provider NOT LIKE '%gemini%' AND provider NOT LIKE '%openrouter%' AND provider NOT LIKE '%spark%'`;
  }
  return { clause, params };
}

export function providerFilter(provider = ''): { clause: string; params: string[] } {
  if (!provider) return { clause: '', params: [] };
  return {
    clause: ' AND lower(COALESCE(ar.provider, \'\')) = ?',
    params: [provider.toLowerCase()],
  };
}
