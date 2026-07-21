import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const guard = path.join(repoRoot, 'scripts/modules/reference-guard.mjs');

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pidex-reference-guard-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  return dir;
}

function writeTracked(dir, file, text) {
  const full = path.join(dir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
  execFileSync('git', ['add', file], { cwd: dir });
}

function runGuard(dir, mode = 'fail') {
  return execFileSync('node', [guard, '--mode', mode, '--pidex-root', dir], { cwd: dir, encoding: 'utf8', stderr: 'pipe' });
}

test('allows module manifest and module internal implementation references', () => {
  const dir = fixture();
  writeTracked(dir, 'modules/pidex/example/module.json', '{"command":{"args":["modules/pidex/example/scripts/tool.mjs"]}}\n');
  writeTracked(dir, 'modules/pidex/example/scripts/README.md', 'Run modules/pidex/example/scripts/tool.mjs internally.\n');
  const out = JSON.parse(runGuard(dir));
  assert.equal(out.ok, true);
});

test('allows thin compatibility wrapper', () => {
  const dir = fixture();
  writeTracked(dir, 'scripts/example/tool.mjs', "#!/usr/bin/env node\nimport { spawnSync } from 'node:child_process';\nimport path from 'node:path';\nconst target = path.join('modules/pidex/example/scripts/tool.mjs');\nconst cp = spawnSync(process.execPath, [target], { stdio: 'inherit' });\nprocess.exit(cp.status ?? 1);\n");
  const out = JSON.parse(runGuard(dir));
  assert.equal(out.ok, true);
});

test('allows exact external evidence Markdown paths', () => {
  const dir = fixture();
  writeTracked(dir, 'ext/claude-code-reviews/finding.md', 'Historical reference: modules/pidex/example/scripts/tool.mjs\n');
  writeTracked(dir, 'ext/reports/incident.md', 'Historical reference: modules/pidex/example/scripts/tool.mjs\n');
  const out = JSON.parse(runGuard(dir));
  assert.equal(out.ok, true);
});

test('fails executable Markdown and symlink caller sources in external evidence paths', () => {
  const dir = fixture();
  const executableEvidenceFiles = [
    'ext/claude-code-reviews/executable.md',
    'ext/reports/executable.md',
  ];
  for (const file of executableEvidenceFiles) {
    writeTracked(dir, file, 'Caller source: modules/pidex/example/scripts/tool.mjs\n');
    execFileSync('git', ['update-index', '--chmod=+x', '--', file], { cwd: dir });
  }
  const symlinkFile = 'ext/reports/symlink.md';
  writeFileSync(path.join(dir, 'untracked-caller.md'), 'Caller source: modules/pidex/example/scripts/tool.mjs\n');
  mkdirSync(path.join(dir, 'ext/reports'), { recursive: true });
  symlinkSync('../../untracked-caller.md', path.join(dir, symlinkFile));
  execFileSync('git', ['add', symlinkFile], { cwd: dir });

  assert.throws(() => runGuard(dir), (error) => {
    assert.match(error.message, /forbidden hard-coded module implementation/);
    for (const file of [...executableEvidenceFiles, symlinkFile]) {
      assert.match(error.stderr, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    return true;
  });
});

test('fails caller source and non-Markdown or neighboring ext paths', () => {
  const dir = fixture();
  writeTracked(dir, 'README.md', 'Do not run modules/pidex/example/scripts/tool.mjs directly.\n');
  writeTracked(dir, 'extensions/caller.mjs', "import 'modules/pidex/example/scripts/tool.mjs';\n");
  writeTracked(dir, 'ext/claude-code-reviews/finding.mjs', "import 'modules/pidex/example/scripts/tool.mjs';\n");
  writeTracked(dir, 'ext/reports/finding.txt', 'Reference: modules/pidex/example/scripts/tool.mjs\n');
  writeTracked(dir, 'ext/claude-code-review/finding.md', 'Reference: modules/pidex/example/scripts/tool.mjs\n');
  assert.throws(() => runGuard(dir), (error) => {
    assert.match(error.message, /forbidden hard-coded module implementation/);
    for (const file of ['README.md', 'extensions/caller.mjs', 'ext/claude-code-reviews/finding.mjs', 'ext/reports/finding.txt', 'ext/claude-code-review/finding.md']) {
      assert.match(error.stderr, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    return true;
  });
});

test('warn mode reports but does not fail caller-zone direct module implementation path', () => {
  const dir = fixture();
  writeTracked(dir, 'README.md', 'Do not run modules/pidex/example/scripts/tool.mjs directly.\n');
  const out = JSON.parse(runGuard(dir, 'warn'));
  assert.equal(out.ok, false);
  assert.equal(out.forbidden_module_path_files, 1);
});

test('fails caller-zone constructed module implementation path tokens', () => {
  const dir = fixture();
  writeTracked(dir, 'tool.mjs', "const moduleName = 'example';\nconst scriptPath = 'modules/pidex/' + moduleName + '/scripts/tool.mjs';\nconsole.log(scriptPath);\n");
  assert.throws(() => runGuard(dir), /constructed modules\/pidex\/\*\/scripts\/\*/);
});

test('fails caller-zone module implementation path tokens constructed across lines', () => {
  const dir = fixture();
  writeTracked(dir, 'tool.mjs', "const root = 'modules/pidex/' + moduleName;\nconst scriptPath = root + '/scripts/tool.mjs';\nconsole.log(scriptPath);\n");
  assert.throws(() => runGuard(dir), /constructed modules\/pidex\/\*\/scripts\/\* path tokens/);
});

test('does not combine separate module library and ordinary script path tokens', () => {
  const dir = fixture();
  writeTracked(dir, 'caller.mjs', "import 'modules/pidex/example/lib/stable.mjs';\nimport './scripts/tool.mjs';\n");
  const out = JSON.parse(runGuard(dir));
  assert.equal(out.ok, true);
});
