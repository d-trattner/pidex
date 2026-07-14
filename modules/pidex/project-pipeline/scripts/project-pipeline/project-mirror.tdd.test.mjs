import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';
import { projectMirrorLockPath, projectMirrorManifestPath, syncProjectMirror } from './project-mirror.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-mirror-')); }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }
function refreshArchiveReport(archiveRoot) {
  const copied = [];
  function walk(rel) {
    const full = path.join(archiveRoot, rel);
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) {
        const content = readFileSync(path.join(archiveRoot, child));
        copied.push({ path: child.replaceAll('\\', '/'), size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') });
      }
    }
  }
  for (const prefix of ['agents.output', 'wiki']) if (existsSync(path.join(archiveRoot, prefix))) walk(prefix);
  write(path.join(archiveRoot, 'archive-sync-report.json'), JSON.stringify({ ok: true, copied }));
}
function setup({ projectId = 'pp-mirror-test', controlRoot, sourceRef = controlRoot, archiveFiles = {} } = {}) {
  const pidexRoot = tmp();
  const archiveRoot = path.join(pidexRoot, 'state', 'project-archives', projectId);
  for (const [rel, text] of Object.entries(archiveFiles)) write(path.join(archiveRoot, rel), text);
  refreshArchiveReport(archiveRoot);
  const record = createProjectRecord({ project_id: projectId, name: 'mirror', source_kind: sourceRef ? 'host-path' : 'empty', source_ref: sourceRef || '' });
  record.status = 'ready';
  record.archive.path = archiveRoot;
  if (controlRoot) record.control_project_path = controlRoot;
  saveProjectRecord(pidexRoot, record);
  return { pidexRoot, archiveRoot, projectId };
}

test('required host mirror copies archive files and records hash ownership', () => {
  const host = tmp();
  const ctx = setup({ controlRoot: host, archiveFiles: { 'agents.output/qa/report.md': '# QA\n', 'wiki/index.md': '# Wiki\n' } });
  const result = syncProjectMirror(ctx);
  assert.equal(result.status, 'complete');
  assert.equal(result.degraded, false);
  assert.equal(readFileSync(path.join(host, 'agents.output/qa/report.md'), 'utf8'), '# QA\n');
  assert.equal(readFileSync(path.join(host, 'wiki/index.md'), 'utf8'), '# Wiki\n');
  const manifest = JSON.parse(readFileSync(projectMirrorManifestPath(ctx.pidexRoot, ctx.projectId), 'utf8'));
  assert.equal(manifest.host_root, host);
  assert.equal(typeof manifest.files['wiki/index.md'], 'string');
  assert.equal(JSON.stringify(manifest).includes('# Wiki'), false);
  assert.equal(readdirSync(path.dirname(projectMirrorManifestPath(ctx.pidexRoot, ctx.projectId))).some((name) => name.endsWith('.tmp')), false);
});

test('initial differing host file is preserved and reported as degraded conflict', () => {
  const host = tmp();
  write(path.join(host, 'wiki/index.md'), '# Host\n');
  const ctx = setup({ controlRoot: host, archiveFiles: { 'wiki/index.md': '# Container\n', 'agents.output/new.md': '# New\n' } });
  const result = syncProjectMirror(ctx);
  assert.equal(result.status, 'conflict');
  assert.equal(result.degraded, true);
  assert.deepEqual(result.conflict_paths, ['wiki/index.md']);
  assert.equal(readFileSync(path.join(host, 'wiki/index.md'), 'utf8'), '# Host\n');
  assert.equal(readFileSync(path.join(host, 'agents.output/new.md'), 'utf8'), '# New\n');
});

test('owned files update and delete safely while host edits are preserved', () => {
  const host = tmp();
  const ctx = setup({ controlRoot: host, archiveFiles: { 'wiki/update.md': 'v1\n', 'wiki/delete.md': 'delete\n', 'wiki/remove-owned.md': 'remove\n' } });
  assert.equal(syncProjectMirror(ctx).status, 'complete');
  write(path.join(ctx.archiveRoot, 'wiki/update.md'), 'v2\n');
  write(path.join(host, 'wiki/delete.md'), 'host edit\n');
  unlinkSync(path.join(ctx.archiveRoot, 'wiki/remove-owned.md'));
  refreshArchiveReport(ctx.archiveRoot);
  const result = syncProjectMirror(ctx);
  assert.equal(result.status, 'conflict');
  assert.equal(readFileSync(path.join(host, 'wiki/update.md'), 'utf8'), 'v2\n');
  assert.equal(readFileSync(path.join(host, 'wiki/delete.md'), 'utf8'), 'host edit\n');
  assert.equal(existsSync(path.join(host, 'wiki/remove-owned.md')), false);
  assert.equal(result.deleted, 1);
});

test('missing normal host root is degraded and cannot become an internal skip implicitly', () => {
  const ctx = setup({ sourceRef: '', archiveFiles: { 'wiki/index.md': '# Wiki\n' } });
  const normal = syncProjectMirror(ctx);
  assert.equal(normal.status, 'degraded-host-root-missing');
  assert.equal(normal.degraded, true);
  const internal = syncProjectMirror({ ...ctx, internalDisposable: true });
  assert.equal(internal.status, 'skipped-internal-no-host-root');
  assert.equal(internal.degraded, false);
});

test('conflicting root identities and changed manifest root fail closed', () => {
  const hostA = tmp();
  const hostB = tmp();
  const ctx = setup({ controlRoot: hostA, sourceRef: hostB, archiveFiles: { 'wiki/index.md': '# Wiki\n' } });
  assert.equal(syncProjectMirror(ctx).status, 'degraded-host-root-conflict');
  assert.equal(existsSync(path.join(hostA, 'wiki/index.md')), false);

  const ctx2 = setup({ projectId: 'pp-mirror-root-change', controlRoot: hostA, archiveFiles: { 'wiki/index.md': '# Wiki\n' } });
  assert.equal(syncProjectMirror(ctx2).status, 'complete');
  const manifestFile = projectMirrorManifestPath(ctx2.pidexRoot, ctx2.projectId);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  manifest.host_root = hostB;
  writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.equal(syncProjectMirror(ctx2).status, 'degraded-host-root-changed');
});

test('registered root symlink and protected roots fail closed', () => {
  const realHost = tmp();
  const rootLink = path.join(tmp(), 'host-link');
  symlinkSync(realHost, rootLink);
  const linked = setup({ projectId: 'pp-mirror-root-link', controlRoot: rootLink, sourceRef: rootLink, archiveFiles: { 'wiki/index.md': '# Escape\n' } });
  assert.equal(syncProjectMirror(linked).status, 'degraded-unsafe-root');
  assert.equal(existsSync(path.join(realHost, 'wiki/index.md')), false);

  const pidexRoot = tmp();
  const protectedRecord = createProjectRecord({ project_id: 'pp-mirror-protected', name: 'protected', source_kind: 'host-path', source_ref: pidexRoot });
  protectedRecord.status = 'ready'; protectedRecord.control_project_path = pidexRoot; saveProjectRecord(pidexRoot, protectedRecord);
  write(path.join(pidexRoot, 'state/project-archives/pp-mirror-protected/wiki/index.md'), '# Wiki\n');
  assert.equal(syncProjectMirror({ pidexRoot, projectId: 'pp-mirror-protected' }).status, 'degraded-unsafe-root');

  for (const [id, protectedRoot] of [['pp-mirror-home', os.homedir()], ['pp-mirror-filesystem', path.parse(process.cwd()).root]]) {
    const protectedCtx = setup({ projectId: id, controlRoot: protectedRoot, sourceRef: protectedRoot, archiveFiles: { 'wiki/index.md': '# No write\n' } });
    assert.equal(syncProjectMirror(protectedCtx).status, 'degraded-unsafe-root');
  }
});

test('operation-time parent replacement before rename fails closed and recovers', () => {
  const host = tmp();
  const outside = tmp();
  const ctx = setup({ projectId: 'pp-mirror-race', controlRoot: host, archiveFiles: { 'wiki/race/report.md': '# Safe\n' } });
  let replaced = false;
  const raced = syncProjectMirror({ ...ctx, operationHook: ({ phase, rel }) => {
    if (!replaced && phase === 'before-rename' && rel === 'wiki/race/report.md') {
      replaced = true;
      const raceDir = path.join(host, 'wiki/race');
      rmSync(raceDir, { recursive: true, force: true });
      symlinkSync(outside, raceDir);
    }
  } });
  assert.equal(raced.status, 'degraded-unsafe-root');
  assert.equal(existsSync(path.join(outside, 'report.md')), false);
  rmSync(path.join(host, 'wiki/race'), { force: true });
  assert.equal(syncProjectMirror(ctx).status, 'complete');
  assert.equal(existsSync(path.join(host, 'wiki/race/report.md')), true);
});

test('manifest publication interruption reports failure and next run reconciles', () => {
  const host = tmp();
  const ctx = setup({ projectId: 'pp-mirror-manifest-interrupt', controlRoot: host, archiveFiles: { 'wiki/index.md': '# Wiki\n' } });
  let interrupted = false;
  const failed = syncProjectMirror({ ...ctx, operationHook: ({ phase }) => {
    if (!interrupted && phase === 'before-manifest-rename') { interrupted = true; throw new Error('injected manifest interruption'); }
  } });
  assert.equal(failed.status, 'failed');
  assert.equal(existsSync(path.join(host, 'wiki/index.md')), true);
  assert.equal(syncProjectMirror(ctx).status, 'complete');
});

test('real Windows junction root is rejected when supported', { skip: process.platform !== 'win32' }, () => {
  const target = tmp();
  const junction = path.join(tmp(), 'junction-root');
  symlinkSync(target, junction, 'junction');
  const ctx = setup({ projectId: 'pp-mirror-junction', controlRoot: junction, sourceRef: junction, archiveFiles: { 'wiki/index.md': '# No write\n' } });
  assert.equal(syncProjectMirror(ctx).status, 'degraded-unsafe-root');
});

test('operation-time parent replacement before delete cannot unlink outside root', () => {
  const host = tmp();
  const outside = tmp();
  const ctx = setup({ projectId: 'pp-mirror-delete-race', controlRoot: host, archiveFiles: { 'wiki/remove.md': 'owned\n' } });
  assert.equal(syncProjectMirror(ctx).status, 'complete');
  unlinkSync(path.join(ctx.archiveRoot, 'wiki/remove.md'));
  refreshArchiveReport(ctx.archiveRoot);
  write(path.join(outside, 'remove.md'), 'owned\n');
  const raced = syncProjectMirror({ ...ctx, operationHook: ({ phase, rel }) => {
    if (phase === 'before-delete' && rel === 'wiki/remove.md') {
      rmSync(path.join(host, 'wiki'), { recursive: true, force: true });
      symlinkSync(outside, path.join(host, 'wiki'));
    }
  } });
  assert.equal(raced.status, 'degraded-unsafe-root');
  assert.equal(readFileSync(path.join(outside, 'remove.md'), 'utf8'), 'owned\n');
});

test('operation-time empty-directory replacement is detected before cleanup', () => {
  const host = tmp();
  const outside = tmp();
  const ctx = setup({ projectId: 'pp-mirror-dir-race', controlRoot: host, archiveFiles: { 'wiki/a/b/remove.md': 'owned\n' } });
  assert.equal(syncProjectMirror(ctx).status, 'complete');
  unlinkSync(path.join(ctx.archiveRoot, 'wiki/a/b/remove.md'));
  refreshArchiveReport(ctx.archiveRoot);
  let replaced = false;
  const raced = syncProjectMirror({ ...ctx, operationHook: ({ phase, rel }) => {
    if (!replaced && phase === 'before-empty-dir-delete' && rel === 'wiki/a/b') {
      replaced = true;
      rmSync(path.join(host, rel), { recursive: true, force: true });
      symlinkSync(outside, path.join(host, rel));
    }
  } });
  assert.equal(raced.status, 'degraded-unsafe-root');
  assert.equal(existsSync(outside), true);
});

test('concurrent leaf creation, update, and deletion are preserved as conflicts', () => {
  const host = tmp();
  const ctx = setup({ projectId: 'pp-mirror-leaf-races', controlRoot: host, archiveFiles: { 'wiki/update.md': 'v1\n', 'wiki/delete.md': 'owned\n' } });
  assert.equal(syncProjectMirror(ctx).status, 'complete');
  write(path.join(ctx.archiveRoot, 'wiki/update.md'), 'v2\n');
  unlinkSync(path.join(ctx.archiveRoot, 'wiki/delete.md'));
  write(path.join(ctx.archiveRoot, 'wiki/new.md'), 'incoming\n');
  refreshArchiveReport(ctx.archiveRoot);
  const raced = syncProjectMirror({ ...ctx, operationHook: ({ phase, rel }) => {
    if (phase === 'before-rename' && ['wiki/update.md', 'wiki/new.md'].includes(rel)) write(path.join(host, rel), 'CONCURRENT HOST EDIT\n');
    if (phase === 'before-delete' && rel === 'wiki/delete.md') write(path.join(host, rel), 'CONCURRENT HOST EDIT\n');
  } });
  assert.equal(raced.status, 'conflict');
  assert.deepEqual(raced.conflict_paths, ['wiki/delete.md', 'wiki/new.md', 'wiki/update.md']);
  for (const rel of raced.conflict_paths) assert.equal(readFileSync(path.join(host, rel), 'utf8'), 'CONCURRENT HOST EDIT\n');
});

test('malformed or mismatched ownership manifests fail closed without host mutation', () => {
  const variants = [
    '{bad json',
    JSON.stringify({ schema_version: 999, project_id: 'pp-manifest', host_root: 'ROOT', files: {} }),
    JSON.stringify({ schema_version: 1, project_id: 'pp-other', host_root: 'ROOT', files: {} }),
    JSON.stringify({ schema_version: 1, project_id: 'pp-manifest', host_root: 'ROOT', files: { 'wiki/victim.md': 'not-a-hash' } }),
    JSON.stringify({ schema_version: 1, project_id: 'pp-manifest', host_root: 'ROOT', files: { 'wiki/a/./victim.md': crypto.createHash('sha256').update('host data\n').digest('hex') } }),
    JSON.stringify({ schema_version: 1, project_id: 'pp-manifest', host_root: 'ROOT', files: {}, mirrored_at: '2026-02-31T00:00:00.000Z' }),
    JSON.stringify({ schema_version: 1, project_id: 'pp-manifest', host_root: 'ROOT', files: {}, mirrored_at: '1' }),
  ];
  for (const rawTemplate of variants) {
    const host = tmp();
    write(path.join(host, 'wiki/victim.md'), 'host data\n');
    const ctx = setup({ projectId: 'pp-manifest', controlRoot: host, archiveFiles: {} });
    const raw = rawTemplate.replaceAll('ROOT', host.replaceAll('\\', '\\\\'));
    write(projectMirrorManifestPath(ctx.pidexRoot, ctx.projectId), raw);
    assert.equal(syncProjectMirror(ctx).status, 'degraded-manifest-invalid');
    assert.equal(readFileSync(path.join(host, 'wiki/victim.md'), 'utf8'), 'host data\n');
  }
  const host = tmp();
  const ctx = setup({ projectId: 'pp-manifest-large', controlRoot: host, archiveFiles: {} });
  const files = Object.fromEntries(Array.from({ length: 5001 }, (_, index) => [`wiki/${index}.md`, 'a'.repeat(64)]));
  write(projectMirrorManifestPath(ctx.pidexRoot, ctx.projectId), JSON.stringify({ schema_version: 1, project_id: ctx.projectId, host_root: host, files }));
  assert.equal(syncProjectMirror(ctx).status, 'degraded-manifest-invalid');
});

test('archive bounds and publication hash prevent oversized or replaced source reads', () => {
  const hostA = tmp();
  const deepRel = `wiki/${Array.from({ length: 16 }, (_, index) => `d${index}`).join('/')}/file.md`;
  const deep = setup({ projectId: 'pp-archive-deep', controlRoot: hostA, archiveFiles: { [deepRel]: 'deep\n' } });
  assert.equal(syncProjectMirror(deep).status, 'failed');
  assert.equal(existsSync(path.join(hostA, deepRel)), false);

  const hostB = tmp();
  const replaced = setup({ projectId: 'pp-archive-race', controlRoot: hostB, archiveFiles: { 'wiki/race.md': 'published\n' } });
  const raced = syncProjectMirror({ ...replaced, operationHook: ({ phase, rel }) => {
    if (phase === 'before-source-read' && rel === 'wiki/race.md') write(path.join(replaced.archiveRoot, rel), 'replaced after publish\n');
  } });
  assert.equal(raced.status, 'failed');
  assert.equal(existsSync(path.join(hostB, 'wiki/race.md')), false);

  const hostC = tmp();
  const large = setup({ projectId: 'pp-archive-large', controlRoot: hostC, archiveFiles: { 'wiki/large.md': Buffer.alloc(2 * 1024 * 1024 + 1) } });
  assert.equal(syncProjectMirror(large).status, 'failed');
  assert.equal(existsSync(path.join(hostC, 'wiki/large.md')), false);
});

test('destination symlinks and competing root lock fail closed', () => {
  const host = tmp();
  const outside = tmp();
  mkdirSync(path.join(host, 'wiki'), { recursive: true });
  symlinkSync(outside, path.join(host, 'wiki', 'linked'));
  const ctx = setup({ controlRoot: host, archiveFiles: { 'wiki/linked/report.md': '# Escape\n' } });
  const unsafe = syncProjectMirror(ctx);
  assert.equal(unsafe.status, 'degraded-unsafe-root');
  assert.equal(existsSync(path.join(outside, 'report.md')), false);

  const host2 = tmp();
  const ctx2 = setup({ projectId: 'pp-mirror-lock', controlRoot: host2, archiveFiles: { 'wiki/index.md': '# Wiki\n' } });
  mkdirSync(projectMirrorLockPath(ctx2.pidexRoot, host2), { recursive: true });
  const secondRecord = createProjectRecord({ project_id: 'pp-mirror-lock-other', name: 'other', source_kind: 'host-path', source_ref: host2 });
  secondRecord.status = 'ready'; secondRecord.control_project_path = host2; saveProjectRecord(ctx2.pidexRoot, secondRecord);
  write(path.join(ctx2.pidexRoot, 'state/project-archives/pp-mirror-lock-other/wiki/index.md'), '# Other\n');
  const locked = syncProjectMirror({ pidexRoot: ctx2.pidexRoot, projectId: 'pp-mirror-lock-other' });
  assert.equal(locked.status, 'locked-or-stale');
  assert.equal(locked.degraded, true);
});
