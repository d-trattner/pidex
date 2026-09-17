import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { restoreAngularSourceBytes } from './restore-angular-source-bytes.mjs';
import { verifyAngularSourceLock } from '../../modules/pidex/angular/lib/source-lock.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = 'skills/angular-application/references/official-angular/angular-developer.md';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-raw-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const rel of ['modules/pidex/angular', 'skills/angular-application']) fs.cpSync(path.join(repo, rel), path.join(root, rel), { recursive: true });
  fs.copyFileSync(path.join(repo, '.gitattributes'), path.join(root, '.gitattributes'));
  const config = path.join(root, 'empty-config'); fs.writeFileSync(config, '');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_ATTR_NOSYSTEM: '1' };
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || String(result.error)); return result.stdout.trim();
  };
  git('init', '--quiet'); git('-c', 'core.autocrlf=false', 'add', '--', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'isolated test fixture');
  const original = fs.readFileSync(path.join(root, entry));
  const corrupt = rel => { const p = path.join(root, rel); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r?\n/g, '\r\n')); };
  return { root, git, original, corrupt, file: path.join(root, entry) };
}

test('raw 10760-byte CRLF file is restored to exact 10617-byte blob despite hidden worktree drift', t => {
  const f = fixture(t);
  assert.equal(f.original.length, 10617); assert.equal(f.original.toString().split('\n').length - 1, 143);
  f.corrupt(entry);
  assert.equal(fs.statSync(f.file).size, 10760);
  assert.throws(() => verifyAngularSourceLock({ pidexRoot: f.root }), /ANGULAR_SOURCE_MEMBER_DIGEST/);
  // A reproducible successful-but-insufficient restore, not a claim about the
  // user's specific Git flags: skip-worktree hides this file from normal restore.
  f.git('update-index', '--skip-worktree', '--', entry);
  f.git('restore', '--source=HEAD', '--worktree', '--', 'skills/angular-application/references');
  assert.equal(fs.statSync(f.file).size, 10760, 'successful Git restore still leaves the CRLF bytes');
  f.git('diff', '--quiet', '--', entry); // Git's view is not the repair authority.
  assert.match(f.git('check-attr', 'text', '--', entry), /text: unset$/);
  const index = fs.readFileSync(path.join(f.root, '.git/index'));
  const check = restoreAngularSourceBytes({ root: f.root });
  assert.equal(check.status, 'repair-needed'); assert.equal(fs.statSync(f.file).size, 10760);
  assert.deepEqual(check.files, [{ path: entry, before_bytes: 10760, after_bytes: 10617 }]);
  const result = restoreAngularSourceBytes({ root: f.root, apply: true });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.status, 'verified');
  assert.deepEqual(fs.readFileSync(f.file), f.original);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.git/index')), index);
  assert.equal(verifyAngularSourceLock({ pidexRoot: f.root }).status, 'verified');
  assert.deepEqual(restoreAngularSourceBytes({ root: f.root, apply: true }).repaired, []);
});

test('all drifting members and both lock copies recover without changing pinned digests', t => {
  const f = fixture(t), lockPath = 'modules/pidex/angular/config/source-lock.json', mirror = 'skills/angular-application/references/upstream/UPSTREAM.json';
  const lockBytes = fs.readFileSync(path.join(f.root, lockPath));
  const lock = JSON.parse(lockBytes); const files = [...lock.members.map(m => m.path), lockPath, mirror];
  for (const rel of files) f.corrupt(rel);
  const result = restoreAngularSourceBytes({ root: f.root, apply: true });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.aggregate_sha256, lock.aggregate_sha256);
  assert.deepEqual(fs.readFileSync(path.join(f.root, lockPath)), lockBytes);
  assert.deepEqual(fs.readFileSync(path.join(f.root, mirror)), lockBytes);
  assert.equal(verifyAngularSourceLock({ pidexRoot: f.root }).status, 'verified');
});

for (const kind of ['real-edit', 'staged-edit', 'extra', 'symlink', 'hardlink', 'head-corrupt', 'index-lock', 'repair-lock', 'partial-clone']) test(`refuses ${kind} before writing any member`, t => {
  const f = fixture(t); f.corrupt(entry);
  const other = 'skills/angular-application/references/official-material/material-22.md';
  if (kind === 'real-edit' || kind === 'staged-edit') {
    fs.appendFileSync(path.join(f.root, other), 'real edit');
    if (kind === 'staged-edit') f.git('add', '--', other);
  }
  if (kind === 'extra') fs.writeFileSync(path.join(f.root, 'skills/angular-application/references/official-angular/extra.md'), 'extra');
  if (kind === 'symlink') {
    fs.unlinkSync(f.file);
    const target = path.join(f.root, 'outside'); fs.writeFileSync(target, f.original);
    try { fs.symlinkSync(target, f.file); } catch (error) { if (error.code === 'EPERM') return t.skip('symlink privilege unavailable'); throw error; }
  }
  if (kind === 'hardlink') fs.linkSync(f.file, path.join(f.root, 'other-link'));
  if (kind === 'head-corrupt') {
    fs.appendFileSync(path.join(f.root, other), 'unapproved upstream change'); f.git('add', '--', other);
    f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'corrupt source without rehashing');
  }
  if (kind === 'partial-clone') f.git('config', 'remote.origin.promisor', 'true');
  if (kind === 'index-lock') fs.writeFileSync(path.join(f.root, '.git/index.lock'), 'other owner');
  if (kind === 'repair-lock') fs.writeFileSync(path.join(f.root, '.git/pidex-angular-source-restore.lock'), 'other owner');
  const before = fs.readFileSync(f.file), index = fs.readFileSync(path.join(f.root, '.git/index'));
  const result = restoreAngularSourceBytes({ root: f.root, apply: true });
  assert.equal(result.ok, false, JSON.stringify(result)); assert.deepEqual(result.repaired, []);
  assert.deepEqual(fs.readFileSync(f.file), before); assert.deepEqual(fs.readFileSync(path.join(f.root, '.git/index')), index);
  if (kind === 'repair-lock') {
    assert.equal(fs.readFileSync(path.join(f.root, '.git/pidex-angular-source-restore.lock'), 'utf8'), 'other owner');
    assert.equal(restoreAngularSourceBytes({ root: f.root }).error, 'restore-lock-busy');
  }
});

test('late edit produces an explicit partial HOLD without overwriting or rolling back edits', t => {
  const f = fixture(t);
  const members = JSON.parse(fs.readFileSync(path.join(f.root, 'modules/pidex/angular/config/source-lock.json'))).members;
  const [first, second] = members.map(m => m.path);
  f.corrupt(first); f.corrupt(second);
  const edited = Buffer.from('concurrent real edit');
  const result = restoreAngularSourceBytes({ root: f.root, apply: true, beforeWrite: rel => { if (rel === first) fs.writeFileSync(path.join(f.root, second), edited); } });
  assert.equal(result.ok, false); assert.equal(result.status, 'held-partial');
  assert.deepEqual(result.repaired, [first]);
  assert.deepEqual(fs.readFileSync(path.join(f.root, second)), edited);
});

test('changed repair owner is held, not cleared or used to authorize replacement', t => {
  const f = fixture(t); f.corrupt(entry); const before = fs.readFileSync(f.file);
  const lock = path.join(f.root, '.git/pidex-angular-source-restore.lock');
  const result = restoreAngularSourceBytes({ root: f.root, apply: true, beforeWrite: () => fs.writeFileSync(lock, 'unknown owner') });
  assert.equal(result.ok, false); assert.equal(result.status, 'held-cleanup');
  assert.deepEqual(fs.readFileSync(f.file), before); assert.equal(fs.readFileSync(lock, 'utf8'), 'unknown owner');
});

test('tampered temporary bytes cannot be published over the original', t => {
  const f = fixture(t); f.corrupt(entry); const before = fs.readFileSync(f.file);
  const result = restoreAngularSourceBytes({ root: f.root, apply: true, beforeWrite: () => {
    const dir = path.dirname(f.file), name = fs.readdirSync(dir).find(n => n.startsWith('.pidex-source-'));
    fs.writeFileSync(path.join(dir, name), 'tampered temporary bytes');
  } });
  assert.equal(result.ok, false); assert.equal(result.error, 'temporary-changed');
  assert.deepEqual(fs.readFileSync(f.file), before); assert.deepEqual(result.repaired, []);
});

test('concurrent content edit detected immediately before replacement is preserved', t => {
  const f = fixture(t); f.corrupt(entry);
  const edited = Buffer.concat([f.original, Buffer.from('concurrent edit')]);
  const result = restoreAngularSourceBytes({ root: f.root, apply: true, beforeWrite: () => fs.writeFileSync(f.file, edited) });
  assert.equal(result.ok, false); assert.equal(result.error, 'source-changed');
  assert.deepEqual(fs.readFileSync(f.file), edited);
  assert.equal(fs.readdirSync(path.dirname(f.file)).some(n => n.startsWith('.pidex-source-')), false);
});
