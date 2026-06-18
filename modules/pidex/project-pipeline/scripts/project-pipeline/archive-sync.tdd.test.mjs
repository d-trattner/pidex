import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyArchivePath, syncProjectArchive } from './archive-sync.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-pipeline-archive-')); }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }

test('classifyArchivePath blocks executable and secret-like paths case-insensitively', () => {
  assert.equal(classifyArchivePath('agents.output/qa/report.md').ok, true);
  for (const rel of ['agents.output/x.js', 'wiki/tool.TS', 'wiki/.SSH/key.txt', 'agents.output/Credentials/info.md', 'wiki/../x.md']) {
    assert.equal(classifyArchivePath(rel).ok, false, rel);
  }
});

test('syncProjectArchive mirrors allowed agents.output and wiki files', () => {
  const workspace = tmp();
  const archive = tmp();
  write(path.join(workspace, 'agents.output/qa/report.md'), '# QA\n');
  write(path.join(workspace, 'wiki/index.md'), '# Wiki\n');
  const result = syncProjectArchive({ workspace, archiveRoot: archive });
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
  assert.equal(syncProjectArchive({ workspace, archiveRoot: archive }).ok, true);
  assert.equal(existsSync(path.join(archive, 'wiki/remove.md')), true);
  // Rebuild workspace without remove.md
  const workspace2 = tmp();
  write(path.join(workspace2, 'wiki/keep.md'), 'keep\n');
  assert.equal(syncProjectArchive({ workspace: workspace2, archiveRoot: archive }).ok, true);
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
  const result = syncProjectArchive({ workspace, archiveRoot: archive });
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
  const result = syncProjectArchive({ workspace, archiveRoot: archive, limits: { maxFileBytes: 5 } });
  assert.equal(result.ok, true);
  assert.equal(existsSync(path.join(archive, 'wiki/small.md')), false);
  assert.equal(result.skipped.some((item) => item.reason === 'max-file-bytes-exceeded'), true);
});
