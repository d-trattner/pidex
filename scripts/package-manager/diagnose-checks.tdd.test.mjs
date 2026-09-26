import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectDiagnostics, dependencyDigest, diagnosticEnvironment, diagnosticProcess, runDiagnosticCandidate, seedDependencyDigest } from './diagnose-checks.mjs';

function candidateFixture(firstScript) {
  const owned = mkdtempSync(path.join(os.tmpdir(), 'pidex diagnostic # fixture-'));
  const source = path.join(owned, 'source'); mkdirSync(source);
  const git = args => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  writeFileSync(path.join(source, '.gitignore'), 'node_modules/\ndashboard/ignored/\n');
  mkdirSync(path.join(source, 'dashboard'));
  writeFileSync(path.join(source, 'dashboard/package.json'), JSON.stringify({ name: '@pidex/dashboard' }));
  writeFileSync(path.join(source, 'first.mjs'), firstScript);
  writeFileSync(path.join(source, 'fresh.mjs'), `import { existsSync } from 'node:fs'; import path from 'node:path'; if (existsSync(path.join(process.env.TEMP, 'marker'))) process.exit(9); console.log('fresh fixture');`);
  writeFileSync(path.join(source, 'package.json'), JSON.stringify({ scripts: { 'check:bootstrap': 'node first.mjs', 'check:runtime': 'node fresh.mjs', 'check:quality': 'node fresh.mjs', 'check:release': 'node fresh.mjs' } }));
  git(['-c', 'init.templateDir=', 'init']); git(['add', '.']);
  git(['-c', 'user.name=Diagnostic fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']);
  mkdirSync(path.join(source, 'node_modules')); writeFileSync(path.join(source, 'node_modules', 'fixture'), 'unchanged');
  mkdirSync(path.join(source, 'dashboard/ignored'));
  symlinkSync(path.join(source, 'dashboard'), path.join(source, 'node_modules/workspace'), 'junction');
  return { owned, commit: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), from: 1, to: 4 };
}

function campaign(overrides = {}) {
  const calls = [];
  return { calls, options: { commands: [{ ordinal: 1 }, { ordinal: 2 }],
    prepare: async command => { calls.push(`prepare:${command.ordinal}`); return command; },
    execute: async command => ({ kind: 'exit', code: command.ordinal === 1 ? 1 : 0 }),
    verify: async fixture => { calls.push(`verify:${fixture.ordinal}`); },
    record: async results => { calls.push(`record:${results.length}`); }, ...overrides } };
}

test('real candidate clones isolate failed suites and refuse result-root reuse', async () => {
  const fixture = candidateFixture(`import { writeFileSync } from 'node:fs'; import path from 'node:path'; writeFileSync(path.join(process.env.TEMP, 'marker'), 'failure residue'); process.exit(3);`);
  try {
    const result = await runDiagnosticCandidate(fixture);
    assert.equal(result.status, 'FAIL', result.reason); assert.deepEqual(result.results.map(row => row.code), [3, 0, 0, 0]);
    await assert.rejects(() => runDiagnosticCandidate(fixture), /EEXIST/);
    assert.equal(JSON.parse(readFileSync(path.join(fixture.owned, 'diagnostic', 'result.json'))).diagnosticOnly, true);
  } finally { rmSync(fixture.owned, { recursive: true, force: true }); }
});

test('real source or shared-dependency mutation halts before the next suite', async () => {
  for (const file of ['package.json', 'node_modules/fixture', 'node_modules/workspace/ignored/marker']) {
    const fixture = candidateFixture(`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(file)}, 'changed');`);
    try {
      const result = await runDiagnosticCandidate(fixture);
      assert.equal(result.status, 'HOLD'); assert.equal(result.results.length, 1);
      assert.match(result.reason, file === 'package.json' ? /identity\/worktree changed/ : /dependencies changed/);
      assert.equal(existsSync(path.join(fixture.owned, 'diagnostic', 'suite-002')), false);
    } finally { rmSync(fixture.owned, { recursive: true, force: true }); }
  }
});

test('ordinary failure is retained while independent suites run once, never retried', async () => {
  const { calls, options } = campaign(); const result = await collectDiagnostics(options);
  assert.equal(result.status, 'FAIL'); assert.deepEqual(result.results.map(row => row.code), [1, 0]);
  assert.deepEqual(calls, ['prepare:1', 'record:1', 'verify:1', 'prepare:2', 'record:2', 'verify:2']);
});
test('spawn, timeout, signal, cleanup and identity uncertainty stop collection', async () => {
  for (const kind of ['spawn-error', 'timeout', 'signal', 'cleanup-uncertain']) {
    const { options } = campaign({ execute: async () => ({ kind, code: null }) });
    const result = await collectDiagnostics(options);
    assert.equal(result.status, 'HOLD'); assert.equal(result.results.length, 1);
  }
  const { options } = campaign({ verify: async () => { throw new Error('identity changed'); } });
  const result = await collectDiagnostics(options); assert.equal(result.status, 'HOLD'); assert.equal(result.results.length, 1);
});
test('setup failures and campaign deadline stop before another suite starts', async () => {
  const setup = campaign({ prepare: async () => { throw new Error('clone failed'); } });
  assert.equal((await collectDiagnostics(setup.options)).status, 'HOLD');
  let time = 0;
  const budget = campaign({ now: () => time++, budgetMs: 1 });
  const result = await collectDiagnostics(budget.options);
  assert.equal(result.status, 'HOLD'); assert.deepEqual(budget.calls, []);
});
test('diagnostic environment strips credentials, ambient config and real home', () => {
  const env = diagnosticEnvironment({ PATH: 'tools', SystemRoot: 'windows', OPENAI_API_KEY: 'test_placeholder_not_a_credential', NODE_OPTIONS: '--require ambient', HOME: 'real-home', PIDEX_ROOT: 'installed', PIDEX_HOME_ROOT: 'installed-home', PIDEX_STATE_DIR: 'real-state', NPM_CONFIG_USERCONFIG: 'real-npmrc' }, '/fixture/source', '/fixture');
  assert.equal(env.PATH, 'tools'); assert.equal(env.SystemRoot, 'windows');
  for (const key of ['OPENAI_API_KEY', 'NODE_OPTIONS', 'NPM_CONFIG_USERCONFIG']) assert.equal(env[key], undefined);
  assert.equal(env.HOME, path.join('/fixture', 'home'));
  assert.equal(env.PIDEX_ROOT, '/fixture/source'); assert.equal(env.PIDEX_HOME_ROOT, '/fixture/source');
  assert.equal(env.PIDEX_STATE_DIR, path.join('/fixture', 'state'));
});
test('dependency guard detects byte changes, external links and shared hardlinks', () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'pidex-diag-deps-'));
  const root = path.join(fixture, 'deps'); mkdirSync(root);
  try {
    const file = path.join(root, 'package'); writeFileSync(file, 'first'); const before = dependencyDigest(root);
    writeFileSync(file, 'other'); assert.notEqual(dependencyDigest(root), before);
    const outside = path.join(fixture, 'outside'); mkdirSync(outside);
    symlinkSync(outside, path.join(root, 'link'), 'junction');
    assert.throws(() => dependencyDigest(root), /escapes seed/); rmSync(path.join(root, 'link'));
    linkSync(file, path.join(fixture, 'hardlink')); assert.throws(() => dependencyDigest(root), /copied files/);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
test('only the named seed workspace is admitted, hashed and contained', () => {
  const fixture = candidateFixture('process.exit(0)');
  const source = path.join(fixture.owned, 'source');
  try {
    assert.throws(() => dependencyDigest(path.join(source, 'node_modules')), /escapes seed/);
    const before = seedDependencyDigest(source);
    writeFileSync(path.join(source, 'dashboard/ignored/marker'), 'changed despite gitignore');
    assert.notEqual(seedDependencyDigest(source), before);
    const foreign = path.join(fixture.owned, 'foreign'); mkdirSync(foreign);
    symlinkSync(foreign, path.join(source, 'dashboard/outside'), 'junction');
    assert.throws(() => seedDependencyDigest(source), /escapes seed/);
    rmSync(path.join(source, 'dashboard/outside'));
    writeFileSync(path.join(source, 'dashboard/package.json'), JSON.stringify({ name: 'unexpected' }));
    assert.throws(() => seedDependencyDigest(source), /workspace identity/);
  } finally { rmSync(fixture.owned, { recursive: true, force: true }); }
});

test('real subprocess logs ordinary failure and bounds timeout without retry', async () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'pidex-diag-process-'));
  try {
    const failed = path.join(fixture, 'failed'); mkdirSync(failed);
    const result = await diagnosticProcess({ bin: process.execPath, args: ['-e', 'console.log("fixture output"); process.exit(3)'], cwd: fixture, env: process.env, logRoot: failed, timeoutMs: 5000 });
    assert.equal(result.kind, 'exit'); assert.equal(result.code, 3); assert.match(readFileSync(path.join(failed, 'stdout.log'), 'utf8'), /fixture output/);
    const timed = path.join(fixture, 'timed'); mkdirSync(timed);
    const timeout = await diagnosticProcess({ bin: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: fixture, env: process.env, logRoot: timed, timeoutMs: 1000 });
    assert.equal(timeout.kind, 'timeout'); assert.ok(existsSync(path.join(timed, 'stderr.log')));
    const missing = path.join(fixture, 'missing'); mkdirSync(missing);
    const noBinary = await diagnosticProcess({ bin: path.join(fixture, 'missing-binary'), args: [], cwd: fixture, env: process.env, logRoot: missing, timeoutMs: 1000 });
    assert.equal(noBinary.kind, 'spawn-error');
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
