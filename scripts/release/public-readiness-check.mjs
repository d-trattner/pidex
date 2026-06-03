#!/usr/bin/env node
// Node checks used by public-readiness.sh. No network, no LLM calls.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const cmd = process.argv[2];
function fail(msg) { console.error(msg); process.exit(1); }
function gitFiles() { return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean); }
function readText(file) { try { return readFileSync(file, 'utf8'); } catch { return null; } }
if (cmd === 'tracked-clean') {
  const paths = gitFiles(); const bad = [];
  for (const file of paths) {
    const parts = file.split('/');
    if (file === 'pidex/state/.gitkeep') continue;
    if (parts.includes('agents.output') || parts.includes('logs') || parts.includes('node_modules') || parts.includes('__pycache__') || parts.includes('.playwright') || parts.includes('.fallow') || parts.includes('test-results') || (parts.includes('state') && file !== 'pidex/state/.gitkeep') || file === 'dashboard/data' || file.includes('/.env') || file.startsWith('.env') || file === 'config.env' || file.startsWith('secrets/') || parts.includes('secrets') || /\.(db|sqlite|sqlite3|pem|key|crt|p12|pfx|jks|keystore|kubeconfig|pid)$/.test(file)) bad.push(file);
  }
  const skipSuffixes = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.woff', '.woff2', '.ttf', '.ico', '.lock', '.svg']);
  const allowFiles = new Set([
    'scripts/doctor.sh',
    'modules/pidex/git-security-hooks/scripts/lib/security-scan.sh',
    'modules/pidex/memory-wiki-hygiene/scripts/wiki/hygiene.mjs',
  ]);
  const patterns = [
    ['AWS key', /\b(AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g], ['Google API key', /AIza[A-Za-z0-9_-]{35}/g], ['GitHub token', /\b(ghp|gho|ghs)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{82}/g], ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9_-]{40,}\b/g], ['Anthropic key', /sk-ant-api03-[A-Za-z0-9_-]{80,}/g], ['Slack token/webhook', /xox[baprs]-[0-9A-Za-z-]{20,}|hooks\.slack\.com\/services\/[A-Za-z0-9/]{30,}/g], ['Telegram bot token', /\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b/g], ['Private key', /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g], ['Credentialed URL', /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:@]+:[^\s@]+@/g]
  ];
  const findings = [];
  for (const file of paths) {
    if (allowFiles.has(file) || skipSuffixes.has(path.posix.extname(file))) continue;
    const text = readText(file); if (text == null) continue;
    for (const [label, re] of patterns) { re.lastIndex = 0; let m; while ((m = re.exec(text))) findings.push(`${file}:${text.slice(0, m.index).split('\n').length}: ${label}`); }
  }
  if (findings.length) fail(`High-confidence secret-like values found:\n${findings.slice(0, 100).join('\n')}`);
  const localFindings = [];
  for (const file of paths) {
    if (file === 'scripts/release/public-readiness.sh' || skipSuffixes.has(path.posix.extname(file))) continue;
    const text = readText(file); if (text == null) continue;
    for (const [label, re] of [['operator home path', /\/home\/daniel/g], ['specific private LAN address', /\b10\.0\.0\.[0-9]+\b/g]]) { let m; while ((m = re.exec(text))) localFindings.push(`${file}:${text.slice(0, m.index).split('\n').length}: ${label}`); }
  }
  if (localFindings.length) fail(`Local operator path/address leaks found:\n${localFindings.slice(0, 100).join('\n')}`);
  if (existsSync('config/balance.json')) { const data = JSON.parse(readFileSync('config/balance.json', 'utf8')); const snapshots = (data.providers || []).flatMap((p) => p.snapshots || []); if (snapshots.length) fail('config/balance.json contains local balance snapshots'); }
  if (paths.includes('config/operator-contracts.local.json')) fail('config/operator-contracts.local.json must remain local/untracked');
  if (paths.includes('config/contract-governor.local.json')) fail('config/contract-governor.local.json must remain local/untracked');
  if (bad.length) fail([...new Set(bad)].sort().join('\n'));
} else if (cmd === 'pnpm-workspace') {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const dashPkg = JSON.parse(readFileSync('dashboard/package.json', 'utf8'));
  const pm = String(pkg.packageManager || '');
  if (!/^pnpm@\d+\.\d+\.\d+/.test(pm)) fail('package.json must pin packageManager as pnpm@<exact-version>');
  if (!existsSync('pnpm-lock.yaml')) fail('pnpm-lock.yaml must be committed');
  if (!existsSync('pnpm-workspace.yaml')) fail('pnpm-workspace.yaml must be committed');
  const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
  if (!/^\s*-\s*dashboard\s*$/m.test(workspace)) fail('pnpm-workspace.yaml must include dashboard workspace package');
  if (existsSync('package-lock.json')) fail('root package-lock.json must not exist after pnpm migration');
  if (existsSync('dashboard/package-lock.json')) fail('dashboard/package-lock.json must not exist after pnpm migration');
  if (dashPkg.name !== '@pidex/dashboard') fail('dashboard package name must be @pidex/dashboard');
  if (dashPkg.private !== true) fail('dashboard package must remain private');
  const trackedLocks = gitFiles().filter((file) => file === 'package-lock.json' || file.endsWith('/package-lock.json'));
  if (trackedLocks.length) fail(`package-lock.json files must not be tracked in PIDEX pnpm workspace:\n${trackedLocks.join('\n')}`);
} else if (cmd === 'parallel-defaults') {
  const governorFile = 'config/contract-governor.json';
  if (existsSync(governorFile)) { const g = JSON.parse(readFileSync(governorFile, 'utf8')); if (g.enabled !== false) fail('config/contract-governor.json must be disabled by default'); if (g.hot_mode !== false) fail('contract governor hot_mode must be false by default'); if (!['off', 0, false, null, undefined].includes(g.auto_apply)) fail('contract governor auto_apply must be off by default'); if (g.max_cost_usd_per_run !== 0) fail('contract governor public max_cost_usd_per_run must be 0'); }

  const file = 'config/parallel-agents.json';
  if (existsSync(file)) { const data = JSON.parse(readFileSync(file, 'utf8')); if (data.enabled !== false) fail('config/parallel-agents.json must be disabled by default for public release'); for (const [name, cfg] of Object.entries(data.agents || {})) { if (cfg.enabled !== false) fail(`parallel agent ${name} must be disabled by default for public release`); for (const lane of cfg.provider_models || []) if (lane.enabled !== false) fail(`parallel lane ${name}:${lane.provider}:${lane.model} must be disabled by default`); } }
} else if (cmd === 'pack-clean') {
  const rawPack = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const pkg = Array.isArray(rawPack) ? rawPack[0] : rawPack;
  const bad = [];
  const forbiddenPrefixes = [
    'dashboard-old/', 'analysis/', 'wiki/', 'state/', 'agents.output/', 'logs/',
    'dashboard/node_modules/', 'dashboard/.playwright/', 'dashboard/.fallow/',
    'dashboard/agents.output/', 'dashboard/dist/', 'dashboard/test-results/', 'dashboard/data/'
  ];
  const forbiddenPatterns = [
    /(^|\/)wiki\//,
    /(^|\/)agents\.output\//,
    /(^|\/)state\//,
    /(^|\/)pidex\/state\//,
    /(^|\/)logs\//,
    /(^|\/)node_modules\//,
    /(^|\/)__pycache__\//,
    /(^|\.)\.env($|\.)/,
    /(^|\/)config\.env$/,
    /(^|\/)secrets?\//,
    /\.local\.json$/,
    /\.(db|sqlite|sqlite3|pyc|pem|key|crt|p12|pfx|jks|keystore|kubeconfig|pid|id)$/,
  ];
  for (const f of pkg.files || []) {
    const p = f.path || '';
    if (p === 'pidex/state/.gitkeep') continue;
    if (forbiddenPrefixes.some((x) => p.startsWith(x)) || forbiddenPatterns.some((re) => re.test(p))) bad.push(p);
  }
  if (bad.length) fail(`Forbidden package paths:\n${[...new Set(bad)].sort().slice(0, 100).join('\n')}`);
  console.log(`pack ok: files=${(pkg.files || []).length} unpacked=${pkg.unpackedSize}`);
} else fail(`unknown public-readiness check: ${cmd}`);
