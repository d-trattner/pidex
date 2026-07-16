import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { inspectBashForGitHookRisk, inspectProjectBoundaryToolCall } from './index.ts';

test('forced staging is blocked independently of platform Git hooks', () => {
  for (const command of [
    'git add -f -- pidex/state/wiki-hygiene.json',
    'git add --force agents.output/report.md',
    'git -C C:/work/project add -f .',
  ]) {
    assert.match(inspectBashForGitHookRisk(command)?.block || '', /blocks git add/);
  }
  assert.equal(inspectBashForGitHookRisk('git add -- wiki/index.md'), undefined);

  const boundary = inspectProjectBoundaryToolCall(
    { toolName: 'bash', input: { command: 'git add -f -- pidex/state/wiki-hygiene.json' } },
    { cwd: process.cwd() },
  );
  assert.equal(boundary?.block, true);
  assert.match(boundary?.reason || '', /parent and child sessions/);
});

test('wiki hygiene guidance never offers runtime state for commit', () => {
  const files = [
    'skills/pidex/SKILL.md',
    'agents/pidex-wiki-hygienist.md',
    'rules/pidex-wiki-hygienist/index.md',
    'rules/shared/no-force-add-ignored-files.md',
    'readme/wiki-hygiene.md',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /git add -f pidex\/state|ask whether to commit the hygiene state|hygiene state file.*commit candidate/i, file);
  }
});
