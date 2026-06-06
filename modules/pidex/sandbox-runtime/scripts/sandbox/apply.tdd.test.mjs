import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applySandboxPatch, sourceDirtyLines, validatePatchText } from './apply.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-apply-test-')); }
function git(cwd, args) { const p = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout.trim(); }
function initRepo() { const dir = tmp(); git(dir, ['init']); git(dir, ['config', 'user.email', 't@example.invalid']); git(dir, ['config', 'user.name', 'T']); writeFileSync(path.join(dir, 'a.txt'), 'a\n'); git(dir, ['add', '-A']); git(dir, ['commit', '-m', 'base']); return dir; }

test('validatePatchText catches IronWorm-inspired high-risk patterns', () => {
  const findings = validatePatchText('diff --git a/.github/workflows/publish.yml b/.github/workflows/publish.yml\n+ echo $ACTIONS_ID_TOKEN_REQUEST_TOKEN\n+ console.log(toJSON(secrets))\n');
  assert.equal(findings.some((f) => f.reason === 'github-actions-oidc-token'), true);
  assert.equal(findings.some((f) => f.reason === 'github-actions-secrets-json'), true);
});

test('applySandboxPatch blocks dirty host before apply', () => {
  const repo = initRepo();
  writeFileSync(path.join(repo, 'dirty.txt'), 'dirty\n');
  const patch = path.join(tmp(), 'empty.patch');
  writeFileSync(patch, '');
  const result = applySandboxPatch({ project: repo, patch });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'host-worktree-dirty');
});

test('sourceDirtyLines ignores orchestrator runtime artifacts but not source files', () => {
  assert.deepEqual(sourceDirtyLines('?? agents.output/x.md\n?? pidex/state/x.jsonl\n?? pidex/context/CONTEXT.md\n M README.md\n'), [' M README.md']);
});

test('applySandboxPatch rejects forbidden changed-files paths', () => {
  const repo = initRepo();
  const dir = tmp();
  const patch = path.join(dir, 'empty.patch');
  const changed = path.join(dir, 'changed.txt');
  writeFileSync(patch, '');
  writeFileSync(changed, 'A\tsecrets/token.txt\n');
  const result = applySandboxPatch({ project: repo, patch, changedFiles: changed });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'patch-validation-failed');
});
