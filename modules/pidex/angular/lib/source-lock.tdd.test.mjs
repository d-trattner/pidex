import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  for (const kind of ['changed', 'missing', 'extra', 'mirror', 'nested']) {
    const root = fixture();
    try {
      const lock = JSON.parse(readFileSync(path.join(root, 'modules/pidex/angular/config/source-lock.json'), 'utf8'));
      const member = path.join(root, lock.members[0].path);
      if (kind === 'changed') writeFileSync(member, Buffer.concat([readFileSync(member), Buffer.from('x')]));
      if (kind === 'missing') rmSync(member);
      if (kind === 'extra') writeFileSync(path.join(root, 'skills/angular-application/references/official-nx/extra.md'), 'x');
      if (kind === 'mirror') writeFileSync(path.join(root, 'skills/angular-application/references/upstream/UPSTREAM.json'), '{}\n');
      if (kind === 'nested') writeFileSync(path.join(root, 'skills/angular-application/references/official-nx/SKILL.md'), 'bad');
      assert.throws(() => verifyAngularSourceLock({ pidexRoot: root }), /ANGULAR_SOURCE_/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
