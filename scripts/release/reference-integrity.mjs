#!/usr/bin/env node
// Read-only reference integrity check for package-facing PIDEX docs/rules/skills.
// Catches stale executable file references before public/npm release while avoiding prose false positives.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const json = args.has('--json');

const scanRoots = ['agents', 'rules', 'skills', 'prompts', 'templates', 'README.md', 'readme'];
const executablePrefixes = ['scripts/', 'rules/', 'templates/', 'config/', 'agents/', 'skills/', 'prompts/', 'dashboard/', 'pidex/'];
const generatedOrRuntimePrefixes = ['agents.output/', 'state/', 'logs/', 'dashboard/data/', 'pidex/state/'];

// Known documentation-only placeholders/examples. Keep this small: real stale refs should be fixed, not hidden.
const allowedMissing = new Set([
  'config/dns/hosts/',
  'config/dns/hosts/my.domain.com',
  'config/reporter/output',
  'config/status',
  'config/test/script/lockfile/context',
  'rules/config',
  'rules/prompts',
  'agents/status.json',
  // Preferred future Windows-owned path documented in the compatibility matrix.
  'scripts/git-hooks/install-global.windows.ps1',
]);

function isDirEntry(entry) {
  try { return readdirSync(root, { withFileTypes: true }).find((e) => e.name === entry)?.isDirectory(); }
  catch { return false; }
}
function walk(p) {
  if (!existsSync(p)) return [];
  const out = [];
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name);
    const rel = path.relative(root, full).replaceAll(path.sep, '/');
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'data'].includes(e.name)) continue;
      out.push(...walk(full));
    } else if (/\.(md|mdx|txt|json|ts|tsx|mjs|js|sh|ps1)$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

const files = [];
for (const entry of scanRoots) {
  const full = path.join(root, entry);
  if (!existsSync(full)) continue;
  if (isDirEntry(entry)) files.push(...walk(full));
  else files.push(entry);
}

function normalizeRef(raw) {
  let value = String(raw || '').trim();
  value = value.replace(/^<pidex-root>\//, '');
  value = value.replace(/^\.\//, '');
  value = value.replace(/^['"`(]+/, '');
  value = value.replace(/[\]`'"),;:]+$/g, '');
  value = value.replace(/#.*$/, '');
  return value;
}
function hasKnownPrefix(ref) { return executablePrefixes.some((p) => ref.startsWith(p)); }
function isConcrete(ref) {
  if (!ref) return false;
  if (ref.includes('<') || ref.includes('>')) return false;
  if (/^(https?:|git:|npm:)/.test(ref)) return false;
  if (ref.includes('*') || ref.includes('{') || ref.includes('[')) return false;
  if (generatedOrRuntimePrefixes.some((p) => ref.startsWith(p))) return false;
  if (!hasKnownPrefix(ref)) return false;
  // Project-local optional/generated surfaces are examples/contracts, not PIDEX package files.
  if (/^pidex\/rules\/[^/]+\.md$/.test(ref)) return false;
  if (ref === 'pidex/context/CONTEXT-MAP.md' || ref.startsWith('pidex/context/contexts/') || ref.startsWith('pidex/context/adr/')) return false;
  // Prose placeholders accidentally shaped like paths.
  if (/^dashboard\/[A-Z][A-Za-z-]*$/.test(ref)) return false;
  return true;
}
function isAllowedMissing(ref) { return allowedMissing.has(ref); }
function existingRef(ref) {
  if (existsSync(path.join(root, ref))) return true;
  // Directory references may omit trailing slash.
  if (existsSync(path.join(root, `${ref}/`))) return true;
  return false;
}
function extractPathTokens(text) {
  const refs = [];
  const tokenRe = /(?<![A-Za-z0-9_-])(?:<pidex-root>\/|\.\/)?((?:scripts|rules|templates|config|agents|skills|prompts|dashboard|pidex)\/[A-Za-z0-9_./*?{}\[\]@:-]+)/g;
  let m;
  while ((m = tokenRe.exec(text))) refs.push(normalizeRef(m[1]));
  return refs;
}
function candidateRefsFromLine(line) {
  const refs = [];
  const isGlobalPiSkillRef = line.includes('~/.pi/agent/skills/') || line.includes('~/.agents/skills/');
  // Explicit PIDEX-root package references are always meaningful.
  refs.push(...extractPathTokens([...line.matchAll(/<pidex-root>\/[^\s`'"),;]+/g)].map((m) => m[0]).join(' ')));

  // Markdown links to relative package paths.
  for (const m of line.matchAll(/\]\(([^)]+)\)/g)) refs.push(...extractPathTokens(m[1]));

  // Inline code and fenced command text: only scan code-looking spans to avoid prose fragments.
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    if (isGlobalPiSkillRef && m[1].includes('/skills/')) continue;
    refs.push(...extractPathTokens(m[1]));
  }

  // Shell command lines without backticks in skill docs/templates.
  if (/^\s*(bash|node|npm|\.\/|powershell|pwsh)\b/.test(line) || line.includes(' bash ') || line.includes(' node ')) {
    refs.push(...extractPathTokens(line));
  }
  return refs;
}

const findings = [];
for (const file of files) {
  const lines = readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Avoid URL path fragments like github.com/d-trattner/pidex/master/install.windows.ps1.
    if (/https?:\/\//.test(line) && !/<pidex-root>\//.test(line) && !/`[^`]+`/.test(line)) continue;
    for (const ref of new Set(candidateRefsFromLine(line).filter(isConcrete))) {
      if (isAllowedMissing(ref) || existingRef(ref)) continue;
      findings.push({ file, line: i + 1, ref, severity: ref.startsWith('rules/') || ref.startsWith('scripts/') ? 'high' : 'medium' });
    }
  }
}

if (json) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
} else if (findings.length) {
  console.error('Reference integrity failures:');
  for (const f of findings.slice(0, 200)) console.error(`- [${f.severity}] ${f.file}:${f.line} -> ${f.ref}`);
} else {
  console.log('reference integrity ok');
}
if (findings.length) process.exit(1);
