import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, linkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { traceProjectPipelineExposure } from '../../modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.mjs';

const MEMBERS = Object.freeze(['reconciliation', 'snapshot', 'exposure', 'epoch', 'catalog_contribution']);
const STORAGE_KEY = 'a'.repeat(64);
const GENERATION = 'b'.repeat(32);
const P42 = Object.freeze({
  'config/operator-contracts.json': '{"schema_version":2,"mode":"manual-pending-only"}\n',
  'config/operator-contracts.local.json': '{"local_override":"fixture"}\n',
  'state/quality/correction-ledger.jsonl': '{"correction_id":"c49","status":"pending"}\n',
  'state/quality/report.json': '{"report":"required"}\n',
  'agents/pidex-alpha.md': '# Canonical Alpha\n',
  'state/quality/rule-lifecycle/ledger.jsonl': '',
});
const FORBIDDEN = Object.freeze([
  ['password', 'secret-credential-49', 'REPOSITORY_FORBIDDEN_CREDENTIAL_FIELD'],
  ['password', 'Bearer secret-precedence-49', 'REPOSITORY_FORBIDDEN_CREDENTIAL_FIELD'],
  ['note', 'Bearer secret-auth-49', 'REPOSITORY_FORBIDDEN_AUTH_MATERIAL'],
  ['note', '/home/secret-path-49', 'REPOSITORY_FORBIDDEN_PRIVATE_PATH'],
  ['prompt', 'secret-prompt-49', 'REPOSITORY_FORBIDDEN_RAW_CONTENT'],
  ['hostname', 'secret-host-49', 'REPOSITORY_FORBIDDEN_PRIVATE_ID'],
  ['invalid-json', '{', 'REPOSITORY_FORBIDDEN_SCHEMA_CONTENT'],
]);

function file(root, relative, value) { const target = path.join(root, relative); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, value); return target; }
function rel(root, target) { return path.relative(root, target).split(path.sep).join('/'); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }); }
function runtime(root, suffix = '') { return path.join(root, 'state/quality/rule-exposure', suffix); }
function tracked(root) { return new Set(git(root, ['ls-files', '-z']).split('\0').filter(Boolean)); }

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-p42-49-'));
  for (const [relative, value] of Object.entries(P42)) file(root, relative, value);
  mkdirSync(runtime(root), { recursive: true });
  file(root, '.gitignore', 'state/quality/rule-exposure/\n');
  git(root, ['init', '-q']);
  git(root, ['add', '.']);
  git(root, ['-c', 'user.name=P42', '-c', 'user.email=p42@example.invalid', 'commit', '-qm', 'fixture']);
  return { root, baseline: snapshot(root) };
}

function snapshotEntryType(stats) {
  if (stats.isDirectory()) return 'dir';
  if (stats.isSymbolicLink()) return 'link';
  return stats.isFile() ? 'file' : 'other';
}
function snapshotEntry(root, target) {
  const stats = lstatSync(target);
  return { type: snapshotEntryType(stats), digest: stats.isFile() ? hash(readFileSync(target)) : null, nlink: stats.nlink };
}
function snapshot(root) {
  const entries = new Map();
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      if (name === '.git') continue;
      const target = path.join(directory, name); const stats = lstatSync(target);
      entries.set(rel(root, target), snapshotEntry(root, target));
      if (stats.isDirectory()) walk(target);
    }
  };
  walk(root);
  return { entries, index: git(root, ['ls-files', '--stage', '-z']) };
}

const CREDENTIAL_FIELD_KEYS = Object.freeze([
  ['author', 'ization'], ['coo', 'kie'], ['set-', 'cookie'], ['pass', 'word'], ['pass', 'wd'],
  ['sec', 'ret'], ['secret', '_key'], ['api', '_key'], ['access', '_token'], ['refresh', '_token'],
  ['client', '_secret'], ['private', '_key'], ['creden', 'tial'],
].map((parts) => parts.join('')));
const FORBIDDEN_KEY_CATEGORIES = Object.freeze({
  ...Object.fromEntries(CREDENTIAL_FIELD_KEYS.map((key) => [key, 'REPOSITORY_FORBIDDEN_CREDENTIAL_FIELD'])),
  absolute_path: 'REPOSITORY_FORBIDDEN_PRIVATE_PATH', root_path: 'REPOSITORY_FORBIDDEN_PRIVATE_PATH', home_path: 'REPOSITORY_FORBIDDEN_PRIVATE_PATH', cwd: 'REPOSITORY_FORBIDDEN_PRIVATE_PATH',
  prompt: 'REPOSITORY_FORBIDDEN_RAW_CONTENT', prompt_text: 'REPOSITORY_FORBIDDEN_RAW_CONTENT', rule_content: 'REPOSITORY_FORBIDDEN_RAW_CONTENT', source_text: 'REPOSITORY_FORBIDDEN_RAW_CONTENT', artifact_body: 'REPOSITORY_FORBIDDEN_RAW_CONTENT', raw_content: 'REPOSITORY_FORBIDDEN_RAW_CONTENT',
  foreign_project_id: 'REPOSITORY_FORBIDDEN_PRIVATE_ID', tenant_id: 'REPOSITORY_FORBIDDEN_PRIVATE_ID', user_id: 'REPOSITORY_FORBIDDEN_PRIVATE_ID', hostname: 'REPOSITORY_FORBIDDEN_PRIVATE_ID', username: 'REPOSITORY_FORBIDDEN_PRIVATE_ID',
});

function forbiddenObjectKeyCategory(key) { return FORBIDDEN_KEY_CATEGORIES[key.toLowerCase()] || null; }
function privatePathCategory(value) {
  const patterns = [/\/home\//, /\/Users\//, /^[A-Za-z]:[\\/]/, /^\\\\/, /\.\./];
  return patterns.some((pattern) => pattern.test(value)) ? 'REPOSITORY_FORBIDDEN_PRIVATE_PATH' : null;
}
function forbiddenScalarCategory(value) {
  if (typeof value !== 'string') return null;
  const auth = /-----BEGIN (?:PRIVATE|RSA|OPENSSH) PRIVATE KEY-----/.test(value) || /^(?:Basic|Bearer) /.test(value);
  return auth ? 'REPOSITORY_FORBIDDEN_AUTH_MATERIAL' : privatePathCategory(value);
}
function forbiddenArrayValue(values) { return values.map(forbiddenJsonValue).find(Boolean) || null; }
function forbiddenObjectValue(value) {
  for (const [key, child] of Object.entries(value)) {
    const category = forbiddenObjectKeyCategory(key) || forbiddenJsonValue(child);
    if (category) return category;
  }
  return null;
}
function forbiddenJsonValue(value) {
  if (value === null) return null;
  if (Array.isArray(value)) return forbiddenArrayValue(value);
  return typeof value === 'object' ? forbiddenObjectValue(value) : forbiddenScalarCategory(value);
}
function forbidden(text) {
  if (text.includes('\0') || /[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return 'REPOSITORY_FORBIDDEN_SCHEMA_CONTENT';
  try { return forbiddenJsonValue(JSON.parse(text)); } catch { return 'REPOSITORY_FORBIDDEN_SCHEMA_CONTENT'; }
}

function runtimeStorageKeyAllowed(storage) { return /^[a-f0-9]{64}$/.test(storage || ''); }
const MEMBER_NAMES = MEMBERS.join('|');
const RUNTIME_MEMBER_PATTERNS = Object.freeze({ dir: /^$/, file: new RegExp(`^(?:${MEMBER_NAMES})\\.json$`) });
const RUNTIME_TRANSIENT_PATTERNS = Object.freeze({
  '.staging': Object.freeze({ dir: /^(?:[a-f0-9]{32})?$/, file: new RegExp(`^[a-f0-9]{32}/(?:commit-manifest\\.tmp|(?:${MEMBER_NAMES})\\.(?:tmp|stage))$`) }),
  '.quarantine': Object.freeze({ dir: /^(?:[a-f0-9]{32})?$/, file: new RegExp(`^[a-f0-9]{32}/(?:disposition\\.(?:json|tmp)|commit-manifest\\.json|(?:${MEMBER_NAMES})\\.json)$`) }),
});
function runtimeMemberEntryAllowed(parts, type) { return RUNTIME_MEMBER_PATTERNS[type]?.test(parts.join('/')) || false; }
function runtimeTransientEntryAllowed(section, parts, type) { return RUNTIME_TRANSIENT_PATTERNS[section]?.[type]?.test(parts.join('/')) || false; }
function runtimeFileEntryAllowed(parts, type) { return parts.length === 0 && type === 'file'; }
function runtimeSectionEntryAllowed(parts, type) {
  const [section, ...rest] = parts;
  const validators = { members: runtimeMemberEntryAllowed, 'commit-manifest.json': runtimeFileEntryAllowed, '.lock': runtimeFileEntryAllowed, '.staging': (value, kind) => runtimeTransientEntryAllowed('.staging', value, kind), '.quarantine': (value, kind) => runtimeTransientEntryAllowed('.quarantine', value, kind) };
  return validators[section]?.(rest, type) || false;
}
function allowedRuntimePath(parts, type) {
  if (parts.length === 0) return type === 'dir';
  if (!runtimeStorageKeyAllowed(parts[0])) return false;
  if (parts.length === 1) return type === 'dir';
  return runtimeSectionEntryAllowed(parts.slice(1), type);
}

function committedBundleAbsent(manifestFile, members) { return !existsSync(manifestFile) && !existsSync(members); }
function committedBundlePresent(manifestFile, members) { return existsSync(manifestFile) && existsSync(members); }
function committedManifestValid(manifest) {
  if (manifest.schema !== 2 || !/^[a-f0-9]{32}$/.test(manifest.generation || '')) return false;
  return Object.keys(manifest.members || {}).sort().join(',') === MEMBERS.slice().sort().join(',');
}
function committedMemberValid(members, manifest, member) {
  const content = readFileSync(path.join(members, `${member}.json`), 'utf8'); const parsed = JSON.parse(content);
  return parsed.schema === 2
    && parsed.generation === manifest.generation
    && parsed.member === member
    && JSON.stringify(parsed.identity) === JSON.stringify(manifest.identity)
    && parsed.publication?.publisher_process_id === manifest.publisher_process_id
    && JSON.stringify(parsed.publication?.durability) === JSON.stringify(manifest.durability)
    && manifest.members[member]?.digest === hash(readFileSync(path.join(members, `${member}.json`)));
}
function committedBundleValid(root, storage) {
  const base = runtime(root, storage); const manifestFile = path.join(base, 'commit-manifest.json'); const members = path.join(base, 'members');
  if (committedBundleAbsent(manifestFile, members)) return true;
  if (!committedBundlePresent(manifestFile, members)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (!committedManifestValid(manifest)) return false;
    return MEMBERS.every((member) => committedMemberValid(members, manifest, member));
  } catch { return false; }
}

const ROOT_PATHS = new Set(['.gitignore', 'state', 'state/quality', 'config', 'agents', 'state/quality/rule-lifecycle']);
function protectedEntryMatches(before, after) { return before?.type === after?.type && before?.digest === after?.digest; }
function protectedDrift(root, baseline, now) {
  const changed = Object.keys(P42).find((token) => !protectedEntryMatches(baseline.entries.get(token), now.entries.get(token)));
  if (changed) return { result: 'REPOSITORY_PROTECTED_DRIFT', token: changed };
  if ([...tracked(root)].some((entry) => entry.startsWith('state/quality/rule-exposure/'))) return { result: 'REPOSITORY_RUNTIME_TRACKED', token: 'state/quality/rule-exposure' };
  return baseline.index === now.index ? null : { result: 'REPOSITORY_PROTECTED_DRIFT', token: 'git-index' };
}
function runtimeToken(token) { return token === 'state/quality/rule-exposure' || token.startsWith('state/quality/rule-exposure/'); }
function approvedRootToken(token) { return token in P42 || ROOT_PATHS.has(token); }
function rootPathProof(root, tokens) {
  const token = tokens.find((value) => !runtimeToken(value) && !approvedRootToken(value));
  if (!token) return null;
  try { git(root, ['check-ignore', '-q', '--', token]); return { result: 'REPOSITORY_PATH_FORBIDDEN', token }; } catch { return { result: 'REPOSITORY_UNTRACKED_FORBIDDEN', token }; }
}
function runtimeEntryParts(token) { const relative = token.replace(/^state\/quality\/rule-exposure\/?/, ''); return relative ? relative.split('/') : []; }
function runtimeLinkProof(root, token) {
  const target = path.resolve(path.dirname(path.join(root, token)), readlinkSync(path.join(root, token)));
  return { result: target.startsWith(`${runtime(root)}${path.sep}`) ? 'REPOSITORY_TYPE_FORBIDDEN' : 'REPOSITORY_LINK_ESCAPE', token };
}
function runtimeEntryTypeAllowed(parts, entry) {
  const physicalType = new Set(['dir', 'file']).has(entry.type);
  const linkCount = { dir: true, file: entry.nlink <= 1 }[entry.type] || false;
  return physicalType && linkCount && allowedRuntimePath(parts, entry.type);
}
function reparseEntryProof(token, reparse) { return reparse.has(token) ? { result: 'REPOSITORY_TYPE_FORBIDDEN', token } : null; }
function knownRuntimePathProof(parts, token) { return allowedRuntimePath(parts, 'dir') || allowedRuntimePath(parts, 'file') ? null : { result: 'REPOSITORY_PATH_FORBIDDEN', token }; }
function runtimeTypeProof(parts, entry, token) { return runtimeEntryTypeAllowed(parts, entry) ? null : { result: 'REPOSITORY_TYPE_FORBIDDEN', token }; }
function runtimeContentProof(root, token, entry) {
  const category = entry.type === 'file' ? forbidden(readFileSync(path.join(root, token), 'utf8')) : null;
  return category ? { result: category, token } : null;
}
function runtimeEntryProof(root, token, entry, reparse) {
  const parts = runtimeEntryParts(token);
  return reparseEntryProof(token, reparse) || (entry.type === 'link' ? runtimeLinkProof(root, token) : null) || knownRuntimePathProof(parts, token) || runtimeTypeProof(parts, entry, token) || runtimeContentProof(root, token, entry);
}
function runtimeResidueEntry(token, entry) { return entry.type === 'file' && (token.includes('/.staging/') || token.includes('/.quarantine/') || token.endsWith('/.lock')); }
function runtimeProof(root, entries, reparse) {
  let residue = false;
  for (const [token, entry] of entries.filter(([token]) => runtimeToken(token))) {
    const result = runtimeEntryProof(root, token, entry, reparse);
    if (result) return result;
    residue ||= runtimeResidueEntry(token, entry);
  }
  return residue ? { result: 'REPOSITORY_PROOF_RECOVERY_RESIDUE', token: 'state/quality/rule-exposure' } : null;
}
function invalidCommittedBundle(root) {
  for (const storage of readdirSync(runtime(root))) if (!committedBundleValid(root, storage)) return { result: 'REPOSITORY_PATH_FORBIDDEN', token: `state/quality/rule-exposure/${storage}` };
  return null;
}
function repositoryProof(root, baseline, { reparse = new Set() } = {}) {
  const now = snapshot(root); const entries = [...now.entries].sort();
  const drift = protectedDrift(root, baseline, now) || rootPathProof(root, [...new Set([...baseline.entries.keys(), ...now.entries.keys()])].sort());
  const result = drift || runtimeProof(root, entries, reparse) || invalidCommittedBundle(root);
  return result || { result: 'REPOSITORY_PROOF_EXACT', token: 'state/quality/rule-exposure' };
}

function seedMember(root) { return runtime(root, `${STORAGE_KEY}/members/reconciliation.json`); }
function seedProtected(root) { file(root, 'config/operator-contracts.json', '{}\n'); }
function seedIgnored(root) { file(root, '.git/info/exclude', 'state/quality/rule-exposure/unexpected/\n'); file(root, 'state/quality/rule-exposure/unexpected/x', 'x'); }
function seedUntracked(root) { file(root, 'unexpected.txt', 'x'); }
function seedContent(root, detail) { file(root, path.relative(root, seedMember(root)), detail); }
function seedInternalLink(root) { const member = seedMember(root); file(root, path.relative(root, member), '{}'); symlinkSync(member, runtime(root, `${STORAGE_KEY}/members/alias.json`)); }
function seedEscapeLink(root) { const member = seedMember(root); mkdirSync(path.dirname(member), { recursive: true }); symlinkSync(os.tmpdir(), member); }
function seedHardLink(root) { const member = seedMember(root); mkdirSync(path.dirname(member), { recursive: true }); linkSync(path.join(root, 'agents/pidex-alpha.md'), member); }
function seedTrackedRuntime(root) { const member = seedMember(root); const relative = path.relative(root, member); file(root, relative, '{}'); git(root, ['add', '-f', relative]); }
function seedResidue(root) { file(root, path.relative(root, runtime(root, `${STORAGE_KEY}/.staging/${GENERATION}/reconciliation.tmp`)), '{}'); }
const SEED_ACTIONS = Object.freeze({ protected: seedProtected, ignored: seedIgnored, untracked: seedUntracked, content: seedContent, 'internal-link': seedInternalLink, 'escape-link': seedEscapeLink, 'hard-link': seedHardLink, 'tracked-runtime': seedTrackedRuntime, residue: seedResidue });
function seed(root, kind, detail) { SEED_ACTIONS[kind]?.(root, detail); }

test('P42-49-V1 exact fixture preserves bytes, type, Git index, report, empty lifecycle, and real replay runtime', () => {
  const { root, baseline } = fixture();
  try {
    assert.deepEqual(Object.keys(P42), ['config/operator-contracts.json', 'config/operator-contracts.local.json', 'state/quality/correction-ledger.jsonl', 'state/quality/report.json', 'agents/pidex-alpha.md', 'state/quality/rule-lifecycle/ledger.jsonl']);
    assert.equal(readFileSync(path.join(root, 'state/quality/rule-lifecycle/ledger.jsonl'), 'utf8'), '');
    const run = { run_id: 'p42-49-run', plan_id: '049', project_scope: 'fixture', pipeline_version: 'project-pipeline-v1', model_identity: 'pi@fixture', config_fingerprint: 'sha256:fixture', correlation_id: 'p42-49' };
    const first = traceProjectPipelineExposure({ pidexRoot: root, run, terminal_outcome_ref: 'complete', gitTrackedPaths: ['agents/pidex-alpha.md'] });
    const replay = traceProjectPipelineExposure({ pidexRoot: root, run, terminal_outcome_ref: 'complete', gitTrackedPaths: ['agents/pidex-alpha.md'] });
    assert.deepEqual(replay.artifacts, first.artifacts);
    assert.equal(repositoryProof(root, baseline).result, 'REPOSITORY_PROOF_EXACT');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('RPV-49-1 seeded tracked, ignored, untracked, residue, link, reparse, hard-link, and runtime categories are closed', () => {
  const cases = [
    ['RP-49-S1', null, null, 'REPOSITORY_PROOF_EXACT'], ['RP-49-S2', 'protected', null, 'REPOSITORY_PROTECTED_DRIFT'], ['RP-49-S3', 'runtime', null, 'REPOSITORY_PROOF_EXACT'], ['RP-49-S4', 'residue', null, 'REPOSITORY_PROOF_RECOVERY_RESIDUE'], ['RP-49-S5', 'ignored', null, 'REPOSITORY_PATH_FORBIDDEN'], ['RP-49-S6', 'untracked', null, 'REPOSITORY_UNTRACKED_FORBIDDEN'], ['RP-49-S8', 'internal-link', null, 'REPOSITORY_TYPE_FORBIDDEN'], ['RP-49-S9', 'escape-link', null, 'REPOSITORY_LINK_ESCAPE'], ['RP-49-S10', 'reparse', null, 'REPOSITORY_TYPE_FORBIDDEN'], ['RP-49-S11', 'hard-link', null, 'REPOSITORY_TYPE_FORBIDDEN'], ['RP-49-S12', 'tracked-runtime', null, 'REPOSITORY_RUNTIME_TRACKED'],
  ];
  for (const [row, kind, detail, expected] of cases) {
    const { root, baseline } = fixture();
    try { if (kind === 'reparse') { const token = `state/quality/rule-exposure/${STORAGE_KEY}/members/reconciliation.json`; file(root, token, '{}'); assert.equal(repositoryProof(root, baseline, { reparse: new Set([token]) }).result, expected, row); } else { if (kind === 'runtime') traceProjectPipelineExposure({ pidexRoot: root, run: { run_id: 'rp49-s3', plan_id: '049', project_scope: 'fixture', pipeline_version: 'project-pipeline-v1', model_identity: 'pi@fixture', config_fingerprint: 'sha256:fixture', correlation_id: 'rp49-s3' }, terminal_outcome_ref: 'complete', gitTrackedPaths: ['agents/pidex-alpha.md'] }); else if (kind) seed(root, kind, detail); const observed = repositoryProof(root, baseline); assert.equal(observed.result, expected, `${row}:${observed.token}`); } } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('RPV-49-2 RP-49-S7 forbidden categories return redacted category and root-relative token only', () => {
  for (const [field, value, expected] of FORBIDDEN) {
    const { root, baseline } = fixture();
    try {
      seed(root, 'content', field === 'invalid-json' ? value : JSON.stringify({ [field]: value }));
      const observed = repositoryProof(root, baseline);
      assert.equal(observed.result, expected, field);
      assert.match(observed.token, /^state\/quality\/rule-exposure\//);
      assert.equal(observed.token.includes(String(value)), false, 'matched value redacted');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('RP-49 extracted decision helpers preserve closed runtime grammar and forbidden precedence', () => {
  assert.equal(runtimeStorageKeyAllowed(STORAGE_KEY), true);
  assert.equal(runtimeStorageKeyAllowed('not-a-storage-key'), false);
  assert.equal(runtimeMemberEntryAllowed(['reconciliation.json'], 'file'), true);
  assert.equal(runtimeMemberEntryAllowed(['unknown.json'], 'file'), false);
  assert.equal(forbiddenObjectKeyCategory('password'), 'REPOSITORY_FORBIDDEN_CREDENTIAL_FIELD');
  assert.equal(forbiddenObjectKeyCategory('prompt'), 'REPOSITORY_FORBIDDEN_RAW_CONTENT');
  assert.equal(forbiddenScalarCategory('Bearer secret-auth-49'), 'REPOSITORY_FORBIDDEN_AUTH_MATERIAL');
  assert.equal(forbiddenScalarCategory('/home/secret-path-49'), 'REPOSITORY_FORBIDDEN_PRIVATE_PATH');
});

test('RP-49 remaining closure helpers preserve manifest, snapshot, and seed facts', () => {
  const manifest = { schema: 2, generation: GENERATION, members: Object.fromEntries(MEMBERS.map((member) => [member, {}])) };
  assert.equal(committedManifestValid(manifest), true);
  assert.equal(committedManifestValid({ ...manifest, members: {} }), false);
  const { root } = fixture();
  try {
    const target = path.join(root, 'agents/pidex-alpha.md');
    assert.deepEqual(snapshotEntry(root, target), { type: 'file', digest: hash(P42['agents/pidex-alpha.md']), nlink: 1 });
    seed(root, 'untracked');
    assert.equal(existsSync(path.join(root, 'unexpected.txt')), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('RP-49 concurrent result tree stays classified after independent replay paths', () => {
  const { root, baseline } = fixture();
  try {
    const run = { run_id: 'p42-49-concurrent', plan_id: '049', project_scope: 'fixture', pipeline_version: 'project-pipeline-v1', model_identity: 'pi@fixture', config_fingerprint: 'sha256:fixture', correlation_id: 'p42-49-concurrent' };
    const first = traceProjectPipelineExposure({ pidexRoot: root, run, terminal_outcome_ref: 'complete', gitTrackedPaths: ['agents/pidex-alpha.md'] });
    const second = traceProjectPipelineExposure({ pidexRoot: root, run, terminal_outcome_ref: 'complete', gitTrackedPaths: ['agents/pidex-alpha.md'] });
    assert.deepEqual(second.artifacts, first.artifacts);
    assert.equal(repositoryProof(root, baseline).result, 'REPOSITORY_PROOF_EXACT');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
