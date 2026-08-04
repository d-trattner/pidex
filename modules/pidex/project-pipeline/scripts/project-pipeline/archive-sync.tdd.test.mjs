import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync, linkSync, unlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyArchivePath, projectArchiveLockPath, resolveArchiveRoot, syncProjectArchive } from './archive-sync.mjs';
import { writeTbr } from '../../../../../scripts/quality/tbr.mjs';
import { acquireProjectTbrLock, projectTbrLockPath, releaseProjectTbrLock } from '../../../analysis-metrics-history/lib/tbr-lock.mjs';

const tbrIdentity = { planId: 'plan-059', runFamilyId: 'family-s3-carry', reviewGate: 'code-review' };
const tbrFinding = { findingId: 'F-carry-immediate', relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate', title: 'Carry immediate finding', shortDescription: 'Deferred from current gate.', originEpic: 'initiative-059', reviewArtifact: 'agents.output/code-review/059.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.' };
function syncStateDir(pidexRoot) { return process.env.RUNNING_PI_STATE_DIR ? path.resolve(process.env.RUNNING_PI_STATE_DIR) : path.join(path.resolve(pidexRoot), 'state'); }
function archiveInventory(archiveRoot) {
  const files = [];
  function walk(rel) {
    const full = path.join(archiveRoot, rel);
    if (!existsSync(full)) return;
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) files.push(child.replaceAll('\\', '/'));
    }
  }
  for (const prefix of ['agents.output', 'wiki']) walk(prefix);
  return files.sort();
}
function seedArchiveWithTbr(pidexRoot, projectId) {
  const archive = resolveArchiveRoot({ pidexRoot, projectId });
  const workspace = tmp();
  write(path.join(workspace, 'wiki/index.md'), '# wiki\n');
  const seeded = writeTbr({ root: workspace, identity: tbrIdentity, findings: [tbrFinding] });
  assert.equal(seeded.ok, true);
  const first = syncProjectArchive({ workspace, pidexRoot, projectId });
  assert.equal(first.ok, true);
  return { archive, itemFile: seeded.items[0].file, itemBytes: readFileSync(path.join(archive, 'wiki', 'tbr', 'items', seeded.items[0].file)) };
}

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-pipeline-archive-')); }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }

test('archive sync carries PIDEX-owned wiki/tbr across full replacement with fresh report hashes and inventory equality', () => {
  const pidexRoot = tmp();
  const projectId = 'pp-tbr-carry';
  const archive = resolveArchiveRoot({ pidexRoot, projectId });
  const workspace = tmp();
  write(path.join(workspace, 'wiki/index.md'), '# wiki\n');
  const seeded = writeTbr({ root: workspace, identity: tbrIdentity, findings: [tbrFinding] });
  assert.equal(seeded.ok, true);
  assert.equal(syncProjectArchive({ workspace, pidexRoot, projectId }).ok, true, 'first sync publishes workspace wiki/tbr');
  const carriedPath = `wiki/tbr/items/${seeded.items[0].file}`;

  const workspace2 = tmp();
  write(path.join(workspace2, 'wiki/index.md'), '# wiki 2\n');
  const second = syncProjectArchive({ workspace: workspace2, pidexRoot, projectId });
  assert.equal(second.ok, true, 'second sync with no workspace wiki/tbr still succeeds');
  assert.equal(existsSync(path.join(archive, carriedPath)), true, 'carried TBR item survives full archive replacement');
  assert.equal(existsSync(path.join(archive, 'wiki/tbr/index.md')), true, 'carried TBR index survives full archive replacement');
  const report = JSON.parse(readFileSync(path.join(archive, 'archive-sync-report.json'), 'utf8'));
  const itemEntry = report.copied.find((entry) => entry.path === carriedPath);
  assert.ok(itemEntry, 'carried TBR item enters unchanged report schema copied inventory');
  const freshBytes = readFileSync(path.join(archive, carriedPath));
  assert.equal(itemEntry.size, freshBytes.length, 'carried report size is fresh over staged bytes');
  assert.equal(itemEntry.sha256, createHash('sha256').update(freshBytes).digest('hex'), 'carried report hash is fresh over staged bytes');
  const indexEntry = report.copied.find((entry) => entry.path === 'wiki/tbr/index.md');
  assert.ok(indexEntry && /^[a-f0-9]{64}$/.test(indexEntry.sha256), 'carried TBR index enters report.copied with fresh hash');
  assert.equal(indexEntry.size, readFileSync(path.join(archive, 'wiki/tbr/index.md')).length, 'carried index report size matches staged bytes');
  assert.deepEqual(report.copied.map((entry) => entry.path).sort(), archiveInventory(archive), 'Project Mirror inventory equality holds with carried TBRs (unchanged report schema)');

  const workspace3 = tmp();
  write(path.join(workspace3, 'wiki/index.md'), '# wiki 3\n');
  assert.equal(syncProjectArchive({ workspace: workspace3, pidexRoot, projectId }).ok, true, 'third sync persists carried TBRs again');
  assert.equal(existsSync(path.join(archive, carriedPath)), true, 'carried TBR persists across subsequent syncs');
  assert.equal(existsSync(projectTbrLockPath({ stateDir: syncStateDir(pidexRoot), project: archive })), false, 'project TBR lock released after sync');
});

test('workspace and carried same stable TBR identity with different canonical bytes aborts and preserves previous archive', () => {
  const pidexRoot = tmp();
  const projectId = 'pp-tbr-conflict';
  const { archive, itemFile } = seedArchiveWithTbr(pidexRoot, projectId);
  const carriedBytes = readFileSync(path.join(archive, 'wiki', 'tbr', 'items', itemFile), 'utf8');
  const workspace2 = tmp();
  write(path.join(workspace2, 'wiki/index.md'), '# wiki 2\n');
  const changed = { ...tbrFinding, title: 'Different canonical bytes for the same stable identity' };
  assert.equal(writeTbr({ root: workspace2, identity: tbrIdentity, findings: [changed] }).ok, true);
  const second = syncProjectArchive({ workspace: workspace2, pidexRoot, projectId });
  assert.equal(second.ok, false, 'same stable identity with different canonical bytes aborts publication');
  assert.match(second.error, /tbr workspace conflict/, 'conflict error names the stable identity clash');
  assert.equal(readFileSync(path.join(archive, 'wiki', 'tbr', 'items', itemFile), 'utf8'), carriedBytes, 'previous archive TBR bytes preserved authoritative');
});

test('unsafe retained TBR content aborts publication and leaves previous archive authoritative', () => {
  const pidexRoot = tmp();
  const projectId = 'pp-tbr-unsafe';
  for (const [label, mutate, expected] of [
    ['tampered item', (itemDir, itemPath) => { writeFileSync(itemPath, '---\ntampered\n---\n'); }, /TBR_ITEM_INVALID/],
    ['stale index', (itemDir, itemPath, archive) => { writeFileSync(path.join(archive, 'wiki', 'tbr', 'index.md'), 'stale index\n'); }, /TBR_INDEX_INVALID/],
    ['hardlinked item', (itemDir, itemPath) => { const extra = path.join(itemDir, 'hardlink-extra.md'); linkSync(itemPath, extra); }, /TBR_PATH_INVALID/],
    ['oversized item', (itemDir, itemPath) => { writeFileSync(itemPath, readFileSync(itemPath) + 'x'.repeat(9000)); }, /TBR_ITEM_TOO_LARGE/],
    ['collision', (itemDir, itemPath) => { const name = path.basename(itemPath); const twin = path.join(itemDir, name.replace(/-carry-immediate-finding\.md$/, '-other-title.md')); writeFileSync(twin, readFileSync(itemPath)); }, /TBR_COLLISION/],
  ]) {
    const { archive, itemFile } = seedArchiveWithTbr(pidexRoot, `pp-tbr-unsafe-${projectId}-${label.replace(/[^a-z0-9]+/gi, '-')}`);
    const itemDir = path.join(archive, 'wiki', 'tbr', 'items');
    const itemPath = path.join(itemDir, itemFile);
    mutate(itemDir, itemPath, archive);
    const ws = tmp();
    write(path.join(ws, 'wiki/index.md'), '# wiki next\n');
    const result = syncProjectArchive({ workspace: ws, pidexRoot, projectId: `pp-tbr-unsafe-${projectId}-${label.replace(/[^a-z0-9]+/gi, '-')}` });
    assert.equal(result.ok, false, `${label} aborts publication`);
    assert.match(result.error, expected, `${label} fails closed with TBR taxonomy`);
    assert.equal(existsSync(path.join(archive, 'wiki', 'tbr', 'items', itemFile)), true, `${label} leaves previous archive authoritative`);
  }

  const { archive, itemFile } = seedArchiveWithTbr(pidexRoot, 'pp-tbr-unsafe-symlink');
  const outside = tmp();
  write(path.join(outside, 'symlinked-item.md'), 'outside\n');
  rmSync(path.join(archive, 'wiki', 'tbr', 'items'), { recursive: true, force: true });
  symlinkSync(outside, path.join(archive, 'wiki', 'tbr', 'items'), 'dir');
  const ws = tmp();
  write(path.join(ws, 'wiki/index.md'), '# wiki next\n');
  const result = syncProjectArchive({ workspace: ws, pidexRoot, projectId: 'pp-tbr-unsafe-symlink' });
  assert.equal(result.ok, false, 'symlinked retained TBR items directory aborts publication');
  assert.match(result.error, /TBR_PATH_INVALID/);
});

test('archive sync acquires the project TBR lock before the archive lock and fails closed on contention', () => {
  const pidexRoot = tmp();
  const projectId = 'pp-tbr-lock-order';
  const { archive } = seedArchiveWithTbr(pidexRoot, projectId);
  const stateDir = syncStateDir(pidexRoot);
  const held = acquireProjectTbrLock({ stateDir, project: archive, lockTimeoutMs: 5000 });
  assert.equal(held.held, true, 'test holder acquires the shared project TBR lock');
  try {
    const result = syncProjectArchive({ workspace: tmp(), pidexRoot, projectId, lockTimeoutMs: 100 });
    assert.equal(result.ok, false, 'contended project TBR lock fails closed');
    assert.match(result.error, /REVIEW_TBR_LOCK_(UNAVAILABLE|UNCERTAIN)/);
    assert.equal(existsSync(projectArchiveLockPath({ pidexRoot, projectId })), false, 'archive lock is never created when the project TBR lock is contended');
  } finally { releaseProjectTbrLock(held.lock); }
  const ws = tmp();
  write(path.join(ws, 'wiki/index.md'), '# wiki again\n');
  assert.equal(syncProjectArchive({ workspace: ws, pidexRoot, projectId }).ok, true, 'sync proceeds once the project TBR lock is released');
  assert.equal(existsSync(projectTbrLockPath({ stateDir, project: archive })), false, 'project TBR lock is released after the sync');
});

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
