import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyArchivePath, projectArchiveLockPath, resolveArchiveRoot, syncProjectArchive } from './archive-sync.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-pipeline-archive-')); }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }

test('classifyArchivePath blocks executable and secret-like paths case-insensitively', () => {
  assert.equal(classifyArchivePath('agents.output/qa/report.md').ok, true);
  for (const rel of ['agents.output/x.js', 'wiki/tool.TS', 'wiki/.SSH/key.txt', 'agents.output/Credentials/info.md', 'wiki/../x.md']) {
    assert.equal(classifyArchivePath(rel).ok, false, rel);
  }
});

test('resolveArchiveRoot derives contained PIDEX state path unless explicit unsafe test override', () => {
  const root = tmp();
  const resolved = resolveArchiveRoot({ pidexRoot: root, projectId: 'pp-archive-abc123' });
  assert.equal(resolved, path.join(root, 'state', 'project-archives', 'pp-archive-abc123'));
  assert.throws(() => resolveArchiveRoot({ pidexRoot: root, projectId: '../bad' }), /invalid project id/);
});

test('syncProjectArchive mirrors allowed agents.output and wiki files', () => {
  const workspace = tmp();
  const archive = tmp();
  write(path.join(workspace, 'agents.output/qa/report.md'), '# QA\n');
  write(path.join(workspace, 'wiki/index.md'), '# Wiki\n');
  const result = syncProjectArchive({ workspace, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true });
  assert.equal(result.ok, true);
  assert.equal(existsSync(path.join(archive, 'agents.output/qa/report.md')), true);
  assert.equal(existsSync(path.join(archive, 'wiki/index.md')), true);
  assert.equal(existsSync(path.join(archive, 'archive-sync-report.json')), true);
  const report = JSON.parse(readFileSync(path.join(archive, 'archive-sync-report.json'), 'utf8'));
  assert.equal(report.files_copied, 2);
});

test('syncProjectArchive uses exact latest mirror and removes stale archive files', () => {
  const workspace = tmp();
  const archive = tmp();
  write(path.join(workspace, 'wiki/keep.md'), 'keep\n');
  write(path.join(workspace, 'wiki/remove.md'), 'remove\n');
  assert.equal(syncProjectArchive({ workspace, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true }).ok, true);
  assert.equal(existsSync(path.join(archive, 'wiki/remove.md')), true);
  // Rebuild workspace without remove.md
  const workspace2 = tmp();
  write(path.join(workspace2, 'wiki/keep.md'), 'keep\n');
  assert.equal(syncProjectArchive({ workspace: workspace2, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true }).ok, true);
  assert.equal(existsSync(path.join(archive, 'wiki/keep.md')), true);
  assert.equal(existsSync(path.join(archive, 'wiki/remove.md')), false);
});

test('syncProjectArchive skips blocked files, symlinks and secret patterns with report', () => {
  const workspace = tmp();
  const archive = tmp();
  write(path.join(workspace, 'agents.output/qa/report.md'), '# OK\n');
  write(path.join(workspace, 'agents.output/qa/helper.js'), 'console.log(1)\n');
  write(path.join(workspace, 'wiki/leak.md'), 'token = abcdefghijklmnopqrstuvwxyz123456\n');
  symlinkSync(path.join(workspace, 'agents.output/qa/report.md'), path.join(workspace, 'wiki/link.md'));
  const result = syncProjectArchive({ workspace, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true });
  assert.equal(result.ok, true);
  assert.equal(existsSync(path.join(archive, 'agents.output/qa/report.md')), true);
  assert.equal(existsSync(path.join(archive, 'agents.output/qa/helper.js')), false);
  assert.equal(existsSync(path.join(archive, 'wiki/leak.md')), false);
  assert.equal(existsSync(path.join(archive, 'wiki/link.md')), false);
  const reasons = result.skipped.map((item) => item.reason).join('\n');
  assert.match(reasons, /blocked-extension/);
  assert.match(reasons, /secret-scan/);
  assert.match(reasons, /symlink-blocked/);
});

test('syncProjectArchive enforces file size limits without failing entire sync', () => {
  const workspace = tmp();
  const archive = tmp();
  write(path.join(workspace, 'wiki/small.md'), 'small\n');
  write(path.join(workspace, 'wiki/large.md'), '0123456789\n');
  const result = syncProjectArchive({ workspace, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true, limits: { maxFileBytes: 5 } });
  assert.equal(result.ok, true);
  assert.equal(existsSync(path.join(archive, 'wiki/small.md')), false);
  assert.equal(result.skipped.some((item) => item.reason === 'max-file-bytes-exceeded'), true);
});

test('syncProjectArchive preserves host browser evidence without adding it to the mirror report', () => {
  const workspace = tmp();
  const archive = tmp();
  write(path.join(workspace, 'wiki/index.md'), 'first\n');
  assert.equal(syncProjectArchive({ workspace, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true }).ok, true);
  write(path.join(archive, 'browser-smoke/request-1/browser-smoke-result.json'), '{"status":"BROWSER-SMOKE-PASS"}\n');
  write(path.join(archive, 'browser-smoke/request-1/desktop.png'), 'png-bytes');
  const workspace2 = tmp();
  write(path.join(workspace2, 'wiki/index.md'), 'second\n');
  const result = syncProjectArchive({ workspace: workspace2, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true });
  assert.equal(result.ok, true);
  assert.equal(readFileSync(path.join(archive, 'browser-smoke/request-1/browser-smoke-result.json'), 'utf8'), '{"status":"BROWSER-SMOKE-PASS"}\n');
  assert.equal(readFileSync(path.join(archive, 'browser-smoke/request-1/desktop.png'), 'utf8'), 'png-bytes');
  assert.equal(result.copied.some((item) => item.path.startsWith('browser-smoke/')), false);
});

test('invalid browser evidence aborts sync and leaves the previous archive authoritative', () => {
  const workspace = tmp();
  const archive = tmp();
  write(path.join(workspace, 'wiki/index.md'), 'before\n');
  assert.equal(syncProjectArchive({ workspace, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true }).ok, true);
  const outside = path.join(tmp(), 'outside.json');
  write(outside, '{}\n');
  mkdirSync(path.join(archive, 'browser-smoke/request-unsafe'), { recursive: true });
  symlinkSync(outside, path.join(archive, 'browser-smoke/request-unsafe/browser-smoke-result.json'));
  const workspace2 = tmp();
  write(path.join(workspace2, 'wiki/index.md'), 'after\n');
  const result = syncProjectArchive({ workspace: workspace2, archiveRoot: archive, unsafeAllowCustomArchiveRoot: true });
  assert.equal(result.ok, false);
  assert.equal(readFileSync(path.join(archive, 'wiki/index.md'), 'utf8'), 'before\n');
  assert.equal(existsSync(path.join(archive, 'browser-smoke/request-unsafe/browser-smoke-result.json')), true);
});

test('archive lock path is outside the replaceable archive and an existing lock fails closed', () => {
  const root = tmp();
  const projectId = 'pp-lock-demo';
  const archive = resolveArchiveRoot({ pidexRoot: root, projectId });
  const lock = projectArchiveLockPath({ pidexRoot: root, projectId });
  assert.equal(path.dirname(lock), path.join(root, 'state', 'project-archive-locks'));
  assert.equal(lock.startsWith(`${archive}${path.sep}`), false);
  mkdirSync(lock, { recursive: true });
  write(path.join(lock, 'owner.json'), '{"owner":"other"}\n');
  const workspace = tmp();
  write(path.join(workspace, 'wiki/index.md'), 'locked\n');
  const result = syncProjectArchive({ workspace, pidexRoot: root, projectId, lockTimeoutMs: 10 });
  assert.equal(result.ok, false);
  assert.match(result.error, /archive lock unavailable/);
  assert.equal(existsSync(lock), true);
});

test('staging initialization failure releases the acquired external lock', () => {
  const root = tmp();
  const projectId = 'pp-stage-failure';
  mkdirSync(path.join(root, 'state'), { recursive: true });
  writeFileSync(path.join(root, 'state', 'project-archives'), 'not-a-directory');
  const workspace = tmp();
  write(path.join(workspace, 'wiki/index.md'), 'content\n');
  const result = syncProjectArchive({ workspace, pidexRoot: root, projectId });
  assert.equal(result.ok, false);
  assert.equal(existsSync(projectArchiveLockPath({ pidexRoot: root, projectId })), false);
});

test('archive staging and lock parents reject symlink redirection without touching outside data', () => {
  const workspace = tmp();
  write(path.join(workspace, 'wiki/index.md'), 'content\n');

  const stageRoot = tmp();
  const stageOutside = tmp();
  write(path.join(stageOutside, 'sentinel.txt'), 'keep\n');
  mkdirSync(path.join(stageRoot, 'state'), { recursive: true });
  symlinkSync(stageOutside, path.join(stageRoot, 'state', 'project-archives'));
  const staged = syncProjectArchive({ workspace, pidexRoot: stageRoot, projectId: 'pp-stage-link' });
  assert.equal(staged.ok, false);
  assert.equal(readFileSync(path.join(stageOutside, 'sentinel.txt'), 'utf8'), 'keep\n');
  assert.deepEqual(readdirSync(stageOutside), ['sentinel.txt']);

  const lockRoot = tmp();
  const lockOutside = tmp();
  mkdirSync(path.join(lockRoot, 'state'), { recursive: true });
  symlinkSync(lockOutside, path.join(lockRoot, 'state', 'project-archive-locks'));
  const locked = syncProjectArchive({ workspace, pidexRoot: lockRoot, projectId: 'pp-lock-link' });
  assert.equal(locked.ok, false);
  assert.deepEqual(readdirSync(lockOutside), []);
});
