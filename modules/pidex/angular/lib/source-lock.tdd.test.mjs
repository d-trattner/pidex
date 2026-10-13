import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAngularSourceLock } from './source-lock.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-source-'));
  cpSync(path.join(repo, 'modules/pidex/angular'), path.join(root, 'modules/pidex/angular'), { recursive: true });
  cpSync(path.join(repo, 'skills/angular-application'), path.join(root, 'skills/angular-application'), { recursive: true });
  return root;
}

test('source lock verifies exact Angular, Material and Nx closure', () => {
  const result = verifyAngularSourceLock({ pidexRoot: repo });
  assert.equal(result.status, 'verified');
  assert.ok(result.members > 40);
  assert.match(result.aggregate_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.coordinates.angular.core, '22.1.4');
  assert.equal(result.coordinates.material.material, '22.1.4');
  assert.equal(result.coordinates.nx.nx, '23.2.0');
});

test('source lock rejects changed, missing, extra, mirror-mismatched and nested skill files', () => {
  for (const kind of ['changed', 'crlf', 'missing', 'extra', 'mirror', 'nested']) {
    const root = fixture();
    try {
      const lock = JSON.parse(readFileSync(path.join(root, 'modules/pidex/angular/config/source-lock.json'), 'utf8'));
      const member = path.join(root, lock.members[0].path);
      if (kind === 'changed') writeFileSync(member, Buffer.concat([readFileSync(member), Buffer.from('x')]));
      if (kind === 'crlf') {
        const entry = path.join(root, 'skills/angular-application/references/official-angular/angular-developer.md');
        writeFileSync(entry, readFileSync(entry, 'utf8').replace(/\r?\n/g, '\r\n'));
        assert.throws(() => verifyAngularSourceLock({ pidexRoot: root }), /ANGULAR_SOURCE_MEMBER_DIGEST:skills\/angular-application\/references\/official-angular\/angular-developer\.md/);
      }
      if (kind === 'missing') rmSync(member);
      if (kind === 'extra') writeFileSync(path.join(root, 'skills/angular-application/references/official-nx/extra.md'), 'x');
      if (kind === 'mirror') writeFileSync(path.join(root, 'skills/angular-application/references/upstream/UPSTREAM.json'), '{}\n');
      if (kind === 'nested') writeFileSync(path.join(root, 'skills/angular-application/references/official-nx/SKILL.md'), 'bad');
      assert.throws(() => verifyAngularSourceLock({ pidexRoot: root }), /ANGULAR_SOURCE_/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('real Git checkout preserves every locked byte with Windows-style autocrlf', () => {
  // Each mode gets a fresh index/worktree. Reusing one index while switching
  // autocrlf modes can leave platform-dependent conversion state under load.
  for (const lineEnding of ['\n', '\r\n']) {
    for (const autocrlf of ['true', 'input', 'false']) verifyCheckoutMode(lineEnding, autocrlf);
  }
});

// Git worktree repair is intentionally not inferred from checkout-index/restore:
// the blob-authoritative repair path has dedicated coverage in
// scripts/maintenance/restore-angular-source-bytes.tdd.test.mjs.
function withGitFixture(lineEnding, run) {
  const root = fixture();
  try {
    cpSync(path.join(repo, '.gitattributes'), path.join(root, '.gitattributes'));
    const attributeText = readFileSync(path.join(root, '.gitattributes'), 'utf8').replace(/\r?\n/g, lineEnding);
    writeFileSync(path.join(root, '.gitattributes'), attributeText);
    assert.equal(attributeText.includes('\r\n'), lineEnding === '\r\n');
    writeFileSync(path.join(root, 'ordinary.txt'), 'first\nsecond\n');
    const config = path.join(root, 'empty-git-config'); writeFileSync(config, '');
    // Only this disposable repository is configured; no network, commits,
    // global configuration changes or product-hook bypasses are involved.
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_NOSYSTEM: '1', GIT_ATTR_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config };
    const git = (args, expectedStatus = 0) => {
      const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
      assert.equal(result.status, expectedStatus, result.stderr || String(result.error));
      return result.stdout;
    };
    const lockPath = 'modules/pidex/angular/config/source-lock.json';
    const mirrorPath = 'skills/angular-application/references/upstream/UPSTREAM.json';
    const lock = JSON.parse(readFileSync(path.join(root, lockPath), 'utf8'));
    const paths = [...lock.members.map(member => member.path), lockPath, mirrorPath];
    const original = new Map(paths.map(file => [file, readFileSync(path.join(root, file))]));
    git(['init', '--quiet']);
    git(['-c', 'core.autocrlf=false', 'add', '--', '.']);
    const attributes = git(['check-attr', 'text', '--', ...paths]).trim().split(/\r?\n/);
    assert.equal(attributes.length, paths.length);
    for (const line of attributes) assert.match(line, /: text: unset$/);
    run({ root, git, paths, original });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function verifyCheckoutMode(lineEnding, autocrlf) {
  withGitFixture(lineEnding, ({ root, git, paths, original }) => {
    for (const file of [...paths, 'ordinary.txt']) rmSync(path.join(root, file));
    git(['-c', `core.autocrlf=${autocrlf}`, '-c', 'core.eol=crlf', 'checkout-index', '--all', '--force']);
    if (autocrlf === 'true') assert.equal(readFileSync(path.join(root, 'ordinary.txt'), 'utf8'), 'first\r\nsecond\r\n', 'positive control really exercises CRLF conversion');
    for (const file of paths) assert.deepEqual(readFileSync(path.join(root, file)), original.get(file), `${JSON.stringify(lineEnding)} ${autocrlf}: ${file}`);
    assert.equal(verifyAngularSourceLock({ pidexRoot: root }).status, 'verified');
  });
}
