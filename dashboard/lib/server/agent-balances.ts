import { promises as fs } from 'node:fs';
import path from 'node:path';

export type BalanceSnapshotKind = 'balance_update' | 'balance_top_up';

export interface BalanceSnapshot {
  kind: BalanceSnapshotKind;
  balance_usd: number;
  captured_at: string;
}

export interface BalanceProviderConfig {
  provider: string;
  label?: string;
  snapshots?: BalanceSnapshot[];
  enabled?: boolean;
}

export interface BalanceConfig {
  schema_version: 1;
  providers: BalanceProviderConfig[];
}

type MetricRow = {
  timestamp?: string;
  provider?: string;
  model?: string;
  project?: string;
  plan?: string;
  input_tokens_estimate?: number;
  output_tokens_estimate?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd_estimate?: number;
};

export interface AgentBalanceSummary {
  provider: string;
  label: string;
  enabled: boolean;
  latest_balance_usd: number | null;
  latest_observed_at: string | null;
  estimated_current_balance_usd: number | null;
  estimated_spend_since_latest_usd: number | null;
  learned_cost_per_1m_weighted_tokens: number | null;
  learned_intervals: number;
  confidence: 'none' | 'metric' | 'learning' | 'rough' | 'better';
  burn_24h_usd: number | null;
  burn_3d_usd: number | null;
  burn_7d_usd: number | null;
  primary_daily_burn_usd: number | null;
  days_remaining: number | null;
  weighted_tokens_24h: number;
  weighted_tokens_3d: number;
  weighted_tokens_7d: number;
  total_weighted_tokens_since_latest: number;
  snapshots: BalanceSnapshot[];
  trend: Array<{ date: string; weighted_tokens: number; estimated_spend_usd: number | null }>;
}

export interface AgentBalancesPayload {
  ok: boolean;
  config_path: string;
  generated_at: string;
  providers: AgentBalanceSummary[];
  config: BalanceConfig;
}

const ROOT = path.resolve(process.cwd(), '..');
const DEFAULT_CONFIG_PATH = path.resolve(ROOT, 'config', 'balance.json');
const LOCAL_CONFIG_PATH = path.resolve(ROOT, 'config', 'balance.local.json');
const METRICS_ROOT = path.resolve(ROOT, 'state', 'metrics');

async function readable(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function balanceConfigPath(forWrite = false): Promise<string> {
  if (process.env.PIDEX_BALANCE_CONFIG) return path.resolve(process.env.PIDEX_BALANCE_CONFIG);
  if (forWrite || await readable(LOCAL_CONFIG_PATH)) return LOCAL_CONFIG_PATH;
  return DEFAULT_CONFIG_PATH;
}

const PROVIDER_WEIGHTS: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  deepseek: { input: 1, output: 2, cacheRead: 0.2, cacheWrite: 1 },
  minimax: { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 1 },
};
const DEFAULT_WEIGHTS = { input: 1, output: 3, cacheRead: 0.2, cacheWrite: 1 };

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeProvider(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isoNow(): string {
  return new Date().toISOString();
}

function sanitizeSnapshot(raw: any): BalanceSnapshot | null {
  const balance = Number(raw?.balance_usd ?? raw?.balanceUsd);
  const captured = String(raw?.captured_at || raw?.capturedAt || '').trim();
  const kind = raw?.kind === 'balance_top_up' ? 'balance_top_up' : 'balance_update';
  if (!Number.isFinite(balance) || balance < 0 || !captured || Number.isNaN(new Date(captured).getTime())) return null;
  return { kind, balance_usd: Number(balance.toFixed(4)), captured_at: new Date(captured).toISOString() };
}

export function sanitizeBalanceConfig(raw: any): BalanceConfig {
  const providers = Array.isArray(raw?.providers) ? raw.providers : Array.isArray(raw?.balances) ? raw.balances : [];
  const byProvider = new Map<string, BalanceProviderConfig>();
  for (const entry of providers) {
    const provider = normalizeProvider(entry?.provider || entry?.id);
    if (!provider) continue;
    const snapshots = (Array.isArray(entry?.snapshots) ? entry.snapshots : [])
      .map(sanitizeSnapshot)
      .filter(Boolean) as BalanceSnapshot[];
    snapshots.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    byProvider.set(provider, {
      provider,
      label: String(entry?.label || provider).trim() || provider,
      enabled: entry?.enabled !== false,
      snapshots,
    });
  }
  return { schema_version: 1, providers: [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider)) };
}

export async function readBalanceConfig(): Promise<BalanceConfig> {
  try {
    const file = await balanceConfigPath(false);
    const raw = JSON.parse(await fs.readFile(file, 'utf-8'));
    return sanitizeBalanceConfig(raw);
  } catch {
    return { schema_version: 1, providers: [] };
  }
}

async function writeBalanceConfig(config: BalanceConfig): Promise<void> {
  const file = await balanceConfigPath(true);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.resolve(path.dirname(file), `.balance.local.json.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, `${JSON.stringify(sanitizeBalanceConfig(config), null, 2)}\n`, 'utf-8');
  await fs.rename(tmp, file);
}

async function listMetricFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listMetricFiles(full);
      return entry.isFile() && entry.name.endsWith('.jsonl') ? [full] : [];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

async function readMetrics(): Promise<MetricRow[]> {
  const files = await listMetricFiles(METRICS_ROOT);
  const rows: MetricRow[] = [];
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf-8').catch(() => '');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as MetricRow;
        if (parsed.timestamp) rows.push(parsed);
      } catch { /* ignore malformed metric rows */ }
    }
  }
  return rows;
}

function metricProvider(row: MetricRow): string {
  const provider = normalizeProvider(row.provider);
  const model = String(row.model || '').trim().toLowerCase();
  if (provider && provider !== 'pi') return provider;
  if (model.includes('/')) return model.split('/')[0];
  return provider;
}

function matchesProvider(row: MetricRow, provider: string): boolean {
  const normalized = normalizeProvider(provider);
  if (metricProvider(row) === normalized) return true;
  return String(row.model || '').toLowerCase().startsWith(`${normalized}/`);
}

function weightedTokens(row: MetricRow, provider: string): number {
  const w = PROVIDER_WEIGHTS[normalizeProvider(provider)] || DEFAULT_WEIGHTS;
  return num(row.input_tokens_estimate) * w.input
    + num(row.output_tokens_estimate) * w.output
    + num(row.cache_read_tokens) * w.cacheRead
    + num(row.cache_write_tokens) * w.cacheWrite;
}

function rowsBetween(rows: MetricRow[], provider: string, start: number, end: number): MetricRow[] {
  return rows.filter((row) => {
    const ts = new Date(String(row.timestamp || '')).getTime();
    return Number.isFinite(ts) && ts >= start && ts < end && matchesProvider(row, provider);
  });
}

function sumWeighted(rows: MetricRow[], provider: string): number {
  return rows.reduce((sum, row) => sum + weightedTokens(row, provider), 0);
}

function roundMoney(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

function summarizeProvider(config: BalanceProviderConfig, allRows: MetricRow[], nowMs: number): AgentBalanceSummary {
  const provider = normalizeProvider(config.provider);
  const snapshots = [...(config.snapshots || [])].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
  const rows = allRows.filter((row) => matchesProvider(row, provider));
  const learned: Array<{ rate: number; tokens: number }> = [];
  for (let i = 1; i < snapshots.length; i += 1) {
    const previous = snapshots[i - 1];
    const current = snapshots[i];
    if (current.kind === 'balance_top_up') continue;
    const start = new Date(previous.captured_at).getTime();
    const end = new Date(current.captured_at).getTime();
    const observedSpend = previous.balance_usd - current.balance_usd;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || observedSpend <= 0) continue;
    const tokens = sumWeighted(rowsBetween(rows, provider, start, end), provider);
    if (tokens > 0) learned.push({ rate: observedSpend / tokens, tokens });
  }
  const learnedTokens = learned.reduce((sum, item) => sum + item.tokens, 0);
  const learnedSpend = learned.reduce((sum, item) => sum + item.rate * item.tokens, 0);
  const latest = snapshots[snapshots.length - 1] || null;
  const pricedRows = rows.filter((row) => num(row.cost_usd_estimate) > 0);
  const pricedWeightedTokens = sumWeighted(pricedRows, provider);
  const pricedSpend = pricedRows.reduce((sum, row) => sum + num(row.cost_usd_estimate), 0);
  const rate = learnedTokens > 0 ? learnedSpend / learnedTokens : pricedWeightedTokens > 0 ? pricedSpend / pricedWeightedTokens : null;
  const confidence: AgentBalanceSummary['confidence'] = learned.length === 0
    ? (pricedWeightedTokens > 0 ? 'metric' : 'none')
    : learned.length === 1 ? 'learning' : learned.length < 4 ? 'rough' : 'better';
  const latestMs = latest ? new Date(latest.captured_at).getTime() : nowMs;
  const sinceLatestTokens = latest && rate != null ? sumWeighted(rowsBetween(rows, provider, latestMs, nowMs + 1), provider) : 0;
  const spendSinceLatest = rate == null ? null : sinceLatestTokens * rate;
  const estimatedCurrent = latest ? latest.balance_usd - (spendSinceLatest || 0) : null;
  const windows = [
    ['24h', 24 * 3600_000],
    ['3d', 3 * 24 * 3600_000],
    ['7d', 7 * 24 * 3600_000],
  ] as const;
  const tokenWindow = (ms: number) => sumWeighted(rowsBetween(rows, provider, nowMs - ms, nowMs + 1), provider);
  const tokens24 = tokenWindow(windows[0][1]);
  const tokens3 = tokenWindow(windows[1][1]);
  const tokens7 = tokenWindow(windows[2][1]);
  const burn24 = rate == null ? null : tokens24 * rate;
  const burn3Daily = rate == null ? null : (tokens3 * rate) / 3;
  const burn7Daily = rate == null ? null : (tokens7 * rate) / 7;
  const primaryDaily = burn3Daily && burn3Daily > 0 ? burn3Daily : burn7Daily && burn7Daily > 0 ? burn7Daily : burn24 && burn24 > 0 ? burn24 : null;
  const daysRemaining = estimatedCurrent != null && primaryDaily && primaryDaily > 0 ? Math.max(0, estimatedCurrent / primaryDaily) : null;
  const trend: AgentBalanceSummary['trend'] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = new Date(nowMs - i * 24 * 3600_000);
    dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime();
    const end = start + 24 * 3600_000;
    const tokens = sumWeighted(rowsBetween(rows, provider, start, end), provider);
    trend.push({ date: dayStart.toISOString().slice(0, 10), weighted_tokens: Math.round(tokens), estimated_spend_usd: rate == null ? null : roundMoney(tokens * rate) });
  }
  return {
    provider,
    label: config.label || provider,
    enabled: config.enabled !== false,
    latest_balance_usd: latest ? latest.balance_usd : null,
    latest_observed_at: latest ? latest.captured_at : null,
    estimated_current_balance_usd: roundMoney(estimatedCurrent),
    estimated_spend_since_latest_usd: roundMoney(spendSinceLatest),
    learned_cost_per_1m_weighted_tokens: rate == null ? null : roundMoney(rate * 1_000_000),
    learned_intervals: learned.length,
    confidence,
    burn_24h_usd: roundMoney(burn24),
    burn_3d_usd: roundMoney(burn3Daily),
    burn_7d_usd: roundMoney(burn7Daily),
    primary_daily_burn_usd: roundMoney(primaryDaily),
    days_remaining: daysRemaining == null ? null : Math.round(daysRemaining * 10) / 10,
    weighted_tokens_24h: Math.round(tokens24),
    weighted_tokens_3d: Math.round(tokens3),
    weighted_tokens_7d: Math.round(tokens7),
    total_weighted_tokens_since_latest: Math.round(sinceLatestTokens),
    snapshots,
    trend,
  };
}

export async function getAgentBalances(): Promise<AgentBalancesPayload> {
  const config = await readBalanceConfig();
  const rows = await readMetrics();
  const now = Date.now();
  return {
    ok: true,
    config_path: await balanceConfigPath(false),
    generated_at: new Date(now).toISOString(),
    providers: config.providers.filter((provider) => provider.enabled !== false).map((provider) => summarizeProvider(provider, rows, now)),
    config,
  };
}

export async function recordBalanceSnapshot(input: { provider: string; label?: string; kind: BalanceSnapshotKind; balance_usd: number }): Promise<AgentBalancesPayload> {
  const provider = normalizeProvider(input.provider);
  if (!provider) throw new Error('provider is required');
  const balance = Number(input.balance_usd);
  if (!Number.isFinite(balance) || balance < 0) throw new Error('balance_usd must be a non-negative number');
  const config = await readBalanceConfig();
  let entry = config.providers.find((item) => item.provider === provider);
  if (!entry) {
    entry = { provider, label: input.label || provider, enabled: true, snapshots: [] };
    config.providers.push(entry);
  }
  if (input.label) entry.label = input.label;
  entry.snapshots = entry.snapshots || [];
  entry.snapshots.push({ kind: input.kind === 'balance_top_up' ? 'balance_top_up' : 'balance_update', balance_usd: Number(balance.toFixed(4)), captured_at: isoNow() });
  await writeBalanceConfig(config);
  return getAgentBalances();
}

export async function deleteBalanceProvider(providerInput: string): Promise<AgentBalancesPayload> {
  const provider = normalizeProvider(providerInput);
  const config = await readBalanceConfig();
  config.providers = config.providers.filter((entry) => entry.provider !== provider);
  await writeBalanceConfig(config);
  return getAgentBalances();
}
