import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
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

function runGuard(dir, mode = 'fail', env = process.env) {
  return execFileSync(process.execPath, [guard, '--mode', mode, '--pidex-root', dir], { cwd: dir, encoding: 'utf8', stderr: 'pipe', env });
}

function fakeGitEnv(dir, source) {
  const bin = mkdtempSync(path.join(dir, 'fake-bin-'));
  const git = path.join(bin, 'git');
  writeFileSync(git, `#!/usr/bin/env node\n${source}\n`);
  chmodSync(git, 0o755);
  return { ...process.env, PATH: `${bin}:${process.env.PATH}` };
}

function stagedRecord(file, mode = '100644', objectId = 'a'.repeat(40), stage = '0') {
  return Buffer.from(`${mode} ${objectId} ${stage}\t${file}\0`);
}

function fakeGitBytes(bytes) {
  return `process.stdout.write(Buffer.from(${JSON.stringify([...bytes])}));`;
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
  assert.throws(() => runGuard(dir), (error) => {
    assert.match(error.message, /forbidden hard-coded module implementation/);
    for (const file of executableEvidenceFiles) assert.match(error.stderr, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return true;
  });

  const symlinkFile = 'ext/reports/symlink.md';
  writeFileSync(path.join(dir, 'untracked-caller.md'), 'Caller source: modules/pidex/example/scripts/tool.mjs\n');
  mkdirSync(path.join(dir, 'ext/reports'), { recursive: true });
  symlinkSync('../../untracked-caller.md', path.join(dir, symlinkFile));
  execFileSync('git', ['add', symlinkFile], { cwd: dir });
  assert.throws(() => runGuard(dir), /tracked text checkout is not regular/);
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

test('fails closed on Git producer errors, nonzero exits, and malformed raw output', () => {
  const dir = fixture();
  const valid = stagedRecord('README.md');
  const cases = [
    [{ ...process.env, PATH: '' }, /git ls-files --stage failed/],
    [fakeGitEnv(dir, "process.stderr.write('producer failed'); process.exit(3);"), /git ls-files --stage failed/],
    [fakeGitEnv(dir, fakeGitBytes(valid.subarray(0, -1))), /Malformed git index output/],
    [fakeGitEnv(dir, fakeGitBytes(Buffer.concat([valid, Buffer.from([0])]))), /Malformed git index output/],
  ];
  for (const [env, expected] of cases) assert.throws(() => runGuard(dir, 'fail', env), expected);
});

test('rejects malformed metadata, nonzero stages, duplicate paths, and byte-order drift across every record', () => {
  const dir = fixture();
  const sha = 'a'.repeat(40);
  const malformed = [
    Buffer.from(`100644  0\tREADME.md\0`),
    Buffer.from(`100644 ${sha} 0 extra\tREADME.md\0`),
    stagedRecord('README.md', '100644', sha, '1'),
    Buffer.from(`100644 ${sha} 0README.md\0`),
    Buffer.concat([stagedRecord('README.md'), stagedRecord('README.md', '100644', 'b'.repeat(40))]),
    Buffer.concat([stagedRecord('z.md'), stagedRecord('a.md', '100644', 'b'.repeat(40))]),
  ];
  for (const bytes of malformed) {
    assert.throws(() => runGuard(dir, 'fail', fakeGitEnv(dir, fakeGitBytes(bytes))), /Malformed git index record/);
  }
});

test('accepts SHA-1 and SHA-256 index records', () => {
  const dir = fixture();
  const bytes = Buffer.concat([stagedRecord('a.png'), stagedRecord('b.png', '100644', 'b'.repeat(64))]);
  const out = JSON.parse(runGuard(dir, 'fail', fakeGitEnv(dir, fakeGitBytes(bytes))));
  assert.equal(out.ok, true);
});

test('fails invalid UTF-8 text candidates but ignores ordinary invalid UTF-8 binary paths', () => {
  const dir = fixture();
  const candidate = Buffer.concat([Buffer.from(`100644 ${'a'.repeat(40)} 0\tbad`), Buffer.from([0xff]), Buffer.from('.md\0')]);
  assert.throws(() => runGuard(dir, 'fail', fakeGitEnv(dir, fakeGitBytes(candidate))), /invalid UTF-8 tracked candidate/);
  const binary = Buffer.concat([Buffer.from(`100644 ${'a'.repeat(40)} 0\tbad`), Buffer.from([0xff]), Buffer.from('.png\0')]);
  const out = JSON.parse(runGuard(dir, 'fail', fakeGitEnv(dir, fakeGitBytes(binary))));
  assert.equal(out.ok, true);
});

test('fails decoded traversal, missing checkout paths, and symlinked tracked text without following them', () => {
  const dir = fixture();
  assert.throws(() => runGuard(dir, 'fail', fakeGitEnv(dir, fakeGitBytes(stagedRecord('../outside.md')))), /unsafe tracked path/);

  writeTracked(dir, 'missing.md', 'plain text\n');
  unlinkSync(path.join(dir, 'missing.md'));
  assert.throws(() => runGuard(dir), /tracked text checkout is not regular/);

  const linked = fixture();
  writeFileSync(path.join(linked, 'outside.md'), 'modules/pidex/example/scripts/tool.mjs\n');
  symlinkSync('outside.md', path.join(linked, 'linked.md'));
  execFileSync('git', ['add', 'linked.md'], { cwd: linked });
  assert.throws(() => runGuard(linked), /tracked text checkout is not regular/);
});

test('escapes real tracked control-bearing violation paths and preserves valid UTF-8 Git names deterministically', () => {
  const dir = fixture();
  const unsafe = 'bad\tname\n.md';
  writeTracked(dir, unsafe, 'Forbidden: modules/pidex/example/scripts/tool.mjs\n');
  assert.throws(() => runGuard(dir), (error) => {
    assert.match(error.stderr, /"bad\\tname\\n\.md": modules\/pidex\/example\/scripts\/tool\.mjs/);
    assert.doesNotMatch(error.stderr, new RegExp(`${unsafe}: modules/pidex/example/scripts/tool\\.mjs`));
    return true;
  });

  const valid = fixture();
  writeTracked(valid, 'space \tand\nname.md', 'plain text\n');
  assert.equal(runGuard(valid), runGuard(valid));
});
