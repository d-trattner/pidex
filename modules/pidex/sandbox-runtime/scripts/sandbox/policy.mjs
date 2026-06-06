import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_IMAGE = 'node:22-slim';
export const REQUIRED_PNPM = '10.33.0';

export const COPY_EXCLUDES = [
  '.git', 'node_modules', '.pnpm-store', 'agents.output', 'state', 'logs', '.cache', '.playwright', '.fallow',
  'test-results', 'coverage', 'dist', 'build', 'dashboard/data', 'dashboard/dist', '.env', '.env.*', '.npmrc',
  '.yarnrc', '.yarnrc.yml', '.git-credentials', '.netrc', 'config.env', 'config/*.local.json', 'secrets', 'secrets/**',
  '*.pem', '*.key', '*.crt', '*.p12', '*.pfx', '*.kubeconfig',
];

export const FORBIDDEN_PATCH_PATTERNS = [
  '.env', '.env.*', '.npmrc', '.yarnrc', '.yarnrc.yml', '.git-credentials', '.netrc', 'config.env',
  'config/*.local.json', 'secrets', 'secrets/**', '*.pem', '*.key', '*.crt', '*.p12', '*.pfx', '*.kubeconfig',
  'agents.output/**', 'state/**', 'logs/**',
];

export const ENV_FILES = ['.env', '.env.local', '.env.test', '.env.development'];
export const ENV_ENABLED_PHASES = new Set(['test', 'check', 'build', 'integration', 'dev-smoke']);
export const ENV_DISABLED_PHASES = new Set(['install', 'dependency setup', 'pnpm bootstrap', 'edit', 'setup']);
export const SAFE_HOST_HELPERS = new Set(['exec.mjs', 'status.mjs', 'apply.mjs', 'cleanup.mjs']);

export function toPosix(p) { return String(p).split(path.sep).join('/'); }

export function globToRegExp(pattern) {
  const posix = toPosix(pattern);
  let out = '^';
  for (let i = 0; i < posix.length; i += 1) {
    const ch = posix[i];
    const next = posix[i + 1];
    if (ch === '*' && next === '*') { out += '.*'; i += 1; continue; }
    if (ch === '*') { out += '[^/]*'; continue; }
    if ('\\^$+?.()|{}[]'.includes(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return new RegExp(`${out}$`);
}

const copyRegexes = COPY_EXCLUDES.map(globToRegExp);
const forbiddenRegexes = FORBIDDEN_PATCH_PATTERNS.map(globToRegExp);

export function matchesAnyPattern(rel, patterns = copyRegexes) {
  const normalized = toPosix(rel).replace(/^\.\//, '');
  return patterns.some((re) => re.test(normalized));
}

export function isCopyExcluded(rel) {
  const normalized = toPosix(rel).replace(/^\.\//, '');
  if (matchesAnyPattern(normalized, copyRegexes)) return true;
  const blockedDirs = ['.git', 'node_modules', '.pnpm-store', 'agents.output', 'state', 'logs', '.cache', '.playwright', '.fallow', 'test-results', 'coverage', 'dist', 'build', 'secrets'];
  return blockedDirs.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}
export function isForbiddenPatchPath(rel) { return matchesAnyPattern(rel, forbiddenRegexes); }

export function resolveContained(root, child) {
  const rootResolved = path.resolve(root);
  const childResolved = path.resolve(rootResolved, child);
  const rel = path.relative(rootResolved, childResolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`path escapes root: ${child}`);
  return childResolved;
}

export function safeRunId(value) {
  const runId = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{8,96}$/.test(runId)) throw new Error(`invalid run_id: ${runId || '(empty)'}`);
  if (runId.includes('..')) throw new Error('invalid run_id: parent traversal not allowed');
  return runId;
}

export function validatePhase(requestedPhase, argv = []) {
  const phase = String(requestedPhase || '').trim();
  if (!phase) return { ok: true, phase: 'edit', env_enabled: false, reason: 'default-env-disabled' };
  if (!ENV_ENABLED_PHASES.has(phase) && !ENV_DISABLED_PHASES.has(phase)) {
    return { ok: false, phase, env_enabled: false, reason: 'unknown-command-phase' };
  }
  const command = argv.join(' ');
  const installShape = /\b(?:pnpm|npm|yarn|bun)\s+(?:install|ci)\b|\bcorepack\b|npm\s+install\s+-g/.test(command);
  if (ENV_ENABLED_PHASES.has(phase) && installShape) return { ok: false, phase, env_enabled: false, reason: 'phase-command-conflict-install-cannot-use-env' };
  return { ok: true, phase, env_enabled: ENV_ENABLED_PHASES.has(phase), reason: ENV_ENABLED_PHASES.has(phase) ? 'validated-env-enabled-phase' : 'validated-env-disabled-phase' };
}

export function sensitiveEnvKeyReason(key) {
  const upper = String(key || '').toUpperCase();
  if (!upper) return null;
  if (/(_|^)(TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|SESSION|COOKIE)(_|$)/.test(upper)) return 'sensitive-key-name';
  if (/^(AWS_|AZURE_|GCP_|GOOGLE_|OPENAI_|ANTHROPIC_|STRIPE_|GITHUB_|GITLAB_|NPM_|CLOUDFLARE_|DIGITALOCEAN_|HEROKU_|VERCEL_)/.test(upper)) return 'provider-or-cloud-key-prefix';
  if (upper.includes('KEY') && !['KEY', 'PUBLIC_KEY', 'VITE_PUBLIC_KEY'].includes(upper)) return 'key-like-name';
  return null;
}

export function detectEnvMetadata(projectRoot, phaseInfo) {
  if (!phaseInfo.env_enabled) return { env_files: [], env_keys: [], sensitive_env_keys: [], api_hosts: [], env_values_recorded: false };
  const envFiles = [];
  const envKeys = new Set();
  const sensitive = new Map();
  const hosts = new Set();
  for (const file of ENV_FILES) {
    const abs = path.join(projectRoot, file);
    if (!existsSync(abs)) continue;
    envFiles.push(file);
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
      if (key) {
        envKeys.add(key);
        const reason = sensitiveEnvKeyReason(key);
        if (reason) sensitive.set(key, reason);
      }
      const value = trimmed.slice(trimmed.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
      try {
        const url = new URL(value);
        if (url.hostname) hosts.add(url.hostname);
      } catch {}
    }
  }
  return { env_files: envFiles, env_keys: [...envKeys].sort(), sensitive_env_keys: [...sensitive.entries()].map(([key, reason]) => ({ key, reason })).sort((a, b) => a.key.localeCompare(b.key)), api_hosts: [...hosts].sort(), env_values_recorded: false };
}

export function assertNoSymlinkPath(absPath) {
  const st = lstatSync(absPath);
  if (st.isSymbolicLink()) throw new Error(`symlink path is not allowed: ${absPath}`);
  return st;
}

export function listFilesRecursive(root) {
  const out = [];
  function walk(dir, relBase = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      out.push({ rel, abs, entry });
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(abs, rel);
    }
  }
  walk(root);
  return out;
}
