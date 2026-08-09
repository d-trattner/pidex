import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeModuleFixture } from './test-helpers.mjs';

const fixedTargets = [
  'scripts/quality/rule-inventory.tdd.test.mjs',
  'scripts/quality/rule-exposure.tdd.test.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.tdd.test.mjs',
  'scripts/quality/plan-042-preservation.tdd.test.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.tdd.test.mjs',
];

function fixedRunnerFixture(firstTargetSource) {
  const { root } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command = { validation_profile: 'node-test-fixed-v1', bin: 'node', args: ['--test', ...fixedTargets] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  for (const [index, target] of fixedTargets.entries()) {
    const file = path.join(root, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, index === 0 ? (typeof firstTargetSource === 'function' ? firstTargetSource(root) : firstTargetSource) : "import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  }
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '-m', 'fixture'], { cwd: root });
  const runnerDir = path.join(root, 'runner');
  mkdirSync(runnerDir);
  const sourceDir = path.join(process.cwd(), 'scripts/modules');
  copyFileSync(path.join(sourceDir, 'run-check.mjs'), path.join(runnerDir, 'run-check.mjs'));
  copyFileSync(path.join(sourceDir, 'lib.mjs'), path.join(runnerDir, 'lib.mjs'));
  return { root, runnerPath: path.join(runnerDir, 'run-check.mjs') };
}

function runFixedRunner({ root, runnerPath }, env = {}) {
  return spawnSync(process.execPath, [runnerPath, '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', root], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ...env },
  });
}

function evidenceRow(root) {
  const evidenceDir = path.join(root, 'state/modules/evidence');
  return JSON.parse(readFileSync(path.join(evidenceDir, readdirSync(evidenceDir)[0]), 'utf8').trim());
}

function applyControlledMutation(runnerPath, mode) {
  const source = readFileSync(runnerPath, 'utf8');
  const replacements = {
    a7: [
      ['spawnSync(process.execPath, execArgs,', "spawnSync('node', execArgs,"],
    ],
    'a7-argv': [
      ['const execArgs = command.args.map((arg) => String(arg).replaceAll(\'__PIDEX_PROJECT__\', project));', "const execArgs = command.args.filter((_, index) => index !== 1).map((arg) => String(arg).replaceAll('__PIDEX_PROJECT__', project));"],
    ],
    'a7-cwd': [
      ['cwd: preflight.root', 'cwd: path.dirname(process.execPath)'],
    ],
    'a7-shell': [
      ['shell: false', 'shell: true'],
    ],
    'a7-stdin': [
      ["stdio: ['ignore', 'pipe', 'pipe']", "stdio: ['pipe', 'pipe', 'pipe']"],
    ],
    a8: [
      ['const postflight = validateNodeTestFixedRuntime(project, command);', 'const postflight = { root: preflight.root, error: null };'],
      ["if (postflight.error || postflight.root !== preflight.root || postflightHead !== preflightHead || !trackedSnapshotMatches(preflight.root, preflight.snapshot)) runtimeError = postflight.error || (postflight.root !== preflight.root ? 'POSTFLIGHT_ROOT_DRIFT' : (postflightHead !== preflightHead ? 'POSTFLIGHT_HEAD_DRIFT' : 'POSTFLIGHT_DRIFT'));", 'if (postflight.error) runtimeError = postflight.error;'],
    ],
    a9: [
      ['const passed = proc.status === 0 && !proc.signal && !proc.error && !runtimeError;', 'const passed = !runtimeError;'],
    ],
    a10: [
      ['const passed = proc.status === 0 && !proc.signal && !proc.error && !runtimeError;', 'const passed = !runtimeError;'],
    ],
    a11: [
      ['const passed = proc.status === 0 && !proc.signal && !proc.error && !runtimeError;', 'const passed = !runtimeError;'],
      ['process.exit(passed && !evidenceError ? 0 : (proc.status && proc.status !== 0 ? proc.status : 1));', 'process.exit(passed ? 0 : (proc.status && proc.status !== 0 ? proc.status : 1));'],
    ],
  };
  for (const [from, to] of replacements[mode]) assert.match(source, new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  writeFileSync(runnerPath, replacements[mode].reduce((next, [from, to]) => next.replace(from, to), source));
}

function induceRunnerFailure(runnerPath, mode) {
  const source = readFileSync(runnerPath, 'utf8');
  const replacement = mode === 'spawn'
    ? ['spawnSync(process.execPath, execArgs,', "spawnSync('/definitely-missing-node', execArgs,"]
    : mode === 'null'
      ? ['const postflight = validateNodeTestFixedRuntime(project, command);', 'proc = { ...proc, status: null, signal: null, error: null };\n    const postflight = validateNodeTestFixedRuntime(project, command);']
      : ['appendJsonLine(file, evidence);', "throw new Error('forced append failure');"];
  assert.match(source, new RegExp(replacement[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  writeFileSync(runnerPath, source.replace(...replacement));
}

test('A-T7 fixed runner uses process.execPath despite PATH shadowing', () => {
  const fixture = fixedRunnerFixture("import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  const fakeBin = path.join(fixture.root, 'fake-bin');
  mkdirSync(fakeBin);
  writeFileSync(path.join(fakeBin, 'node'), '#!/bin/sh\nexit 89\n', { mode: 0o755 });
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a7') applyControlledMutation(fixture.runnerPath, 'a7');
  const proc = runFixedRunner(fixture, { PATH: `${fakeBin}:${process.env.PATH}` });
  assert.equal(proc.status, 0, proc.stderr);
  assert.equal(evidenceRow(fixture.root).status, 'passed');
});

test('A-T7 fixed runner retains fixed argv, canonical cwd, shell-free parent, and ignored stdin', () => {
  const markerName = 'runner-boundary.json';
  const fixture = fixedRunnerFixture((root) => `import { writeFileSync } from 'node:fs'; import { test } from 'node:test'; test('records runner cwd', () => writeFileSync(${JSON.stringify(path.join(root, markerName))}, process.cwd()));\n`);
  const marker = path.join(fixture.root, markerName);
  const mode = process.env.RUN_CHECK_CONTROLLED_MUTATION;
  if (['a7-argv', 'a7-cwd', 'a7-shell', 'a7-stdin'].includes(mode)) applyControlledMutation(fixture.runnerPath, mode);
  const runnerSource = readFileSync(fixture.runnerPath, 'utf8');
  assert.match(runnerSource, /spawnSync\(process\.execPath, execArgs, \{ cwd: preflight\.root, shell: false, encoding: 'utf8', stdio: \['ignore', 'pipe', 'pipe'\]/, 'runner must use exact fixed shell-free stdin options');
  const proc = runFixedRunner(fixture);
  assert.equal(proc.status, 0, proc.stderr);
  assert.equal(existsSync(marker), true, 'fixed argv must execute first fixed target');
  assert.equal(readFileSync(marker, 'utf8'), fixture.root, 'child cwd must be canonical Git worktree');
});

test('A-T8 runner rejects selected tracked-target drift after immediate postflight', () => {
  const fixture = fixedRunnerFixture("import { writeFileSync } from 'node:fs'; import { test } from 'node:test'; test('mutates selected target', () => writeFileSync(new URL(import.meta.url), 'drift\\n'));\n");
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a8') applyControlledMutation(fixture.runnerPath, 'a8');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /TARGET_DIRTY|TARGET_HEAD_MISMATCH|POSTFLIGHT_DRIFT/);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T8 runner rejects an immediate postflight HEAD change', () => {
  const fixture = fixedRunnerFixture("import { execFileSync } from 'node:child_process'; import { test } from 'node:test'; test('changes HEAD', () => execFileSync('git', ['-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '--allow-empty', '-m', 'postflight head drift']));\n");
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a8') applyControlledMutation(fixture.runnerPath, 'a8');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /POSTFLIGHT_HEAD_DRIFT/);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T8 runner rejects selected stage-0 mode drift after immediate postflight', () => {
  const fixture = fixedRunnerFixture(`import { execFileSync } from 'node:child_process'; import { test } from 'node:test'; test('stages mode drift', () => execFileSync('git', ['update-index', '--chmod=+x', ${JSON.stringify(fixedTargets[0])}]));\n`);
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a8') applyControlledMutation(fixture.runnerPath, 'a8');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /POSTFLIGHT_DRIFT/);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T8 runner rejects selected stage-0 content drift after immediate postflight', () => {
  const fixture = fixedRunnerFixture(`import { execFileSync } from 'node:child_process'; import { test } from 'node:test'; test('stages content drift', () => { const hash = execFileSync('git', ['hash-object', '-w', '--stdin'], { input: 'stage-only\\n', encoding: 'utf8' }).trim(); execFileSync('git', ['update-index', '--add', '--cacheinfo', '100644,' + hash + ',' + ${JSON.stringify(fixedTargets[0])}]); });\n`);
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a8') applyControlledMutation(fixture.runnerPath, 'a8');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /POSTFLIGHT_DRIFT/);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T8 runner rejects selected realpath replacement after immediate postflight', () => {
  const fixture = fixedRunnerFixture("import { symlinkSync, unlinkSync } from 'node:fs'; import { test } from 'node:test'; test('replaces selected path with link', () => { unlinkSync(process.argv[1]); symlinkSync(process.cwd(), process.argv[1]); });\n");
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a8') applyControlledMutation(fixture.runnerPath, 'a8');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /TARGET_LINK|TARGET_ESCAPE|POSTFLIGHT_DRIFT/);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T9 runner makes spawn error failed nonzero authority', () => {
  const fixture = fixedRunnerFixture("import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  induceRunnerFailure(fixture.runnerPath, 'spawn');
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a9') applyControlledMutation(fixture.runnerPath, 'a9');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T10 runner makes null child exit failed nonzero authority', () => {
  const fixture = fixedRunnerFixture("import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  induceRunnerFailure(fixture.runnerPath, 'null');
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a10') applyControlledMutation(fixture.runnerPath, 'a10');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T10 runner makes signal child exit failed nonzero authority', () => {
  const fixture = fixedRunnerFixture("import { test } from 'node:test'; test('signals', () => process.kill(process.pid, 'SIGTERM'));\n");
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a10') applyControlledMutation(fixture.runnerPath, 'a10');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T10 runner makes nonzero child exit failed nonzero authority', () => {
  const fixture = fixedRunnerFixture("import { test } from 'node:test'; test('fails', () => process.exit(7));\n");
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a10') applyControlledMutation(fixture.runnerPath, 'a10');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.equal(evidenceRow(fixture.root).status, 'failed');
});

test('A-T11 runner makes standard evidence append failure failed nonzero authority', () => {
  const fixture = fixedRunnerFixture("import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  induceRunnerFailure(fixture.runnerPath, 'append');
  if (process.env.RUN_CHECK_CONTROLLED_MUTATION === 'a11') applyControlledMutation(fixture.runnerPath, 'a11');
  const proc = runFixedRunner(fixture);
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /EVIDENCE_WRITE_FAILED/);
  const evidenceDir = path.join(fixture.root, 'state/modules/evidence');
  assert.equal(existsSync(evidenceDir) ? readdirSync(evidenceDir).length : 0, 0);
});

test('node-test-fixed-v1 uses current Node from canonical Git worktree and rejects postflight drift', () => {
  const { root } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const targets = [
    'scripts/quality/rule-inventory.tdd.test.mjs',
    'scripts/quality/rule-exposure.tdd.test.mjs',
    'modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.tdd.test.mjs',
    'scripts/quality/plan-042-preservation.tdd.test.mjs',
    'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.tdd.test.mjs',
  ];
  manifest.capabilities[0].command = { validation_profile: 'node-test-fixed-v1', bin: 'node', args: ['--test', ...targets] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  for (const target of targets) {
    const file = path.join(root, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  }
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '-m', 'fixture'], { cwd: root });
  const fakeBin = path.join(root, 'fake-bin');
  mkdirSync(fakeBin);
  writeFileSync(path.join(fakeBin, 'node'), '#!/bin/sh\nexit 89\n', { mode: 0o755 });
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', root], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
  });
  assert.equal(proc.status, 0, proc.stderr);
  assert.doesNotMatch(proc.stderr, /EVIDENCE_WRITE_FAILED|POSTFLIGHT_DRIFT/);
});

test('node-test-fixed-v1 rejects unrelated tracked-byte drift before passed evidence', () => {
  const { root } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const targets = [
    'scripts/quality/rule-inventory.tdd.test.mjs', 'scripts/quality/rule-exposure.tdd.test.mjs',
    'modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.tdd.test.mjs',
    'scripts/quality/plan-042-preservation.tdd.test.mjs', 'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.tdd.test.mjs',
  ];
  manifest.capabilities[0].command = { validation_profile: 'node-test-fixed-v1', bin: 'node', args: ['--test', ...targets] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const unrelated = path.join(root, 'unrelated.mjs');
  writeFileSync(unrelated, 'clean\n');
  for (const [index, target] of targets.entries()) {
    const file = path.join(root, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, index === 0
      ? `import { writeFileSync } from 'node:fs'; import { test } from 'node:test'; test('mutates unrelated tracked file', () => writeFileSync(${JSON.stringify(unrelated)}, 'drift\\n'));\n`
      : "import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  }
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '-m', 'fixture'], { cwd: root });
  try {
    const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', root], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(readFileSync(unrelated, 'utf8'), 'drift\n');
    assert.notEqual(proc.status, 0);
    assert.match(proc.stderr, /POSTFLIGHT_DRIFT/);
    assert.equal(execFileSync('git', ['diff', '--cached'], { cwd: root, encoding: 'utf8' }), '');
    const file = path.join(root, 'state/modules/evidence', readdirSync(path.join(root, 'state/modules/evidence'))[0]);
    assert.equal(JSON.parse(readFileSync(file, 'utf8').trim()).status, 'failed');
  } finally {
    writeFileSync(unrelated, 'clean\n');
  }
});

test('node-test-fixed-v1 rejects index-only drift before passed evidence', () => {
  const { root } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const targets = [
    'scripts/quality/rule-inventory.tdd.test.mjs', 'scripts/quality/rule-exposure.tdd.test.mjs',
    'modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.tdd.test.mjs',
    'scripts/quality/plan-042-preservation.tdd.test.mjs', 'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.tdd.test.mjs',
  ];
  manifest.capabilities[0].command = { validation_profile: 'node-test-fixed-v1', bin: 'node', args: ['--test', ...targets] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const unrelated = path.join(root, 'unrelated.mjs');
  writeFileSync(unrelated, 'clean\n');
  for (const [index, target] of targets.entries()) {
    const file = path.join(root, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, index === 0
      ? `import { execFileSync } from 'node:child_process'; import { writeFileSync } from 'node:fs'; import { test } from 'node:test'; test('stages then restores unrelated tracked file', () => { writeFileSync(${JSON.stringify(unrelated)}, 'index drift\\n'); execFileSync('git', ['add', '--', 'unrelated.mjs']); writeFileSync(${JSON.stringify(unrelated)}, 'clean\\n'); });\n`
      : "import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  }
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '-m', 'fixture'], { cwd: root });
  try {
    const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', root], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(readFileSync(unrelated, 'utf8'), 'clean\n');
    assert.notEqual(proc.status, 0);
    assert.match(proc.stderr, /POSTFLIGHT_DRIFT/);
    assert.notEqual(execFileSync('git', ['diff', '--cached'], { cwd: root, encoding: 'utf8' }), '');
    const file = path.join(root, 'state/modules/evidence', readdirSync(path.join(root, 'state/modules/evidence'))[0]);
    assert.equal(JSON.parse(readFileSync(file, 'utf8').trim()).status, 'failed');
  } finally {
    execFileSync('git', ['reset', '--', 'unrelated.mjs'], { cwd: root });
  }
});

test('run-check requires absolute project root', () => {
  const { root } = makeModuleFixture();
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', 'relative'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /--project must be absolute/);
});

test('run-check executes command and writes structured evidence', () => {
  const { root, project } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, /fixture reference ok/);
  const evidenceDir = path.join(root, 'state/modules/evidence');
  assert.equal(existsSync(evidenceDir), true);
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(row.type, 'module_capability_evidence');
  assert.equal(row.module_id, 'pidex.release-safety');
  assert.equal(row.capability_id, 'release.reference-integrity');
  assert.equal(row.status, 'passed');
});

test('run-check substitutes __PIDEX_PROJECT__ in manifest commands', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['scripts/release/reference-integrity.mjs', '__PIDEX_PROJECT__', '__PIDEX_PROJECT__/pidex/state'];
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log(process.argv.slice(2).join('\\n'));\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.command.args, ['scripts/release/reference-integrity.mjs', '__PIDEX_PROJECT__', '__PIDEX_PROJECT__/pidex/state']);
  assert.deepEqual(row.executed_command.args, ['scripts/release/reference-integrity.mjs', project, `${project}/pidex/state`]);
});

test('run-check appends passthrough args only when manifest allows it', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^[A-Za-z0-9_.:/=@-]+$'] };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log(process.argv.slice(2).join(' '));\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', 'show', '--json'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, /show --json/);
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.passthrough_args, ['show', '--json']);
  assert.deepEqual(row.executed_command.args.slice(-2), ['show', '--json']);
});

test('run-check redacts sensitive passthrough evidence', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^[A-Za-z0-9_.:/=@-]+$'] };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log('ok');\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--token', 'secret-value', '--api-key=abc123'], { cwd: process.cwd(), encoding: 'utf8' });
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.passthrough_args, ['--token', '[REDACTED]', '--api-key=[REDACTED]']);
});

test('run-check scrubs secret-like passthrough values even without sensitive flag names', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^[A-Za-z0-9_-]+$'] };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log('ok');\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', 'sk-proj-' + 'a'.repeat(48)], { cwd: process.cwd(), encoding: 'utf8' });
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.passthrough_args, ['[REDACTED]']);
});

test('run-check allows explicit safe absolute roots in passthrough policy', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^[A-Za-z0-9_./:-]+$'], allow_absolute_project_paths: true, allowed_absolute_roots: ['__PIDEX_ROOT__'] };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log(process.argv.slice(2).join(' '));\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', root, project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('run-check allows contextual multiline task values without broadening other args', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^--task$'], allowed_value_patterns: { '--task': ['^[\\s\\S]{1,20000}$'] } };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log(process.argv.slice(2).join('\\n'));\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const task = 'Render title "PIDEX Managed Preview Auto Gate 2".\nInclude colorful panel.';
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--task', task], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, /PIDEX Managed Preview Auto Gate 2/);
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--xml'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
});

test('run-check rejects absolute passthrough paths outside project', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^/.*$'], allow_absolute_project_paths: true };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '/etc/passwd'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /rejected by capability policy/);
});

test('run-check rejects parent traversal passthrough args', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^.*$'], allow_absolute_project_paths: true };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '../state'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /rejected by capability policy/);
});

test('run-check rejects passthrough args that violate manifest policy', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^--json$'] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--xml'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /rejected by capability policy/);
});

test('run-check rejects passthrough args unless manifest allows it', () => {
  const { root, project } = makeModuleFixture();
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--json'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /does not allow passthrough/);
});

test('run-check rejects unknown capability', () => {
  const { root, project } = makeModuleFixture();
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'missing.capability', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /unknown capability/);
});

test('run-check rejects disabled capability', () => {
  const { root, project } = makeModuleFixture({ releaseEnabled: false });
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /capability unavailable: module_disabled/);
});

test('B-T1 process-rules declares only exact passive-exposure-platform capability metadata', () => {
  const manifest = JSON.parse(readFileSync('modules/pidex/process-rules/module.json', 'utf8'));
  assert.equal(manifest.id, 'pidex.process-rules');
  assert.deepEqual(manifest.dependencies, ['pidex.core']);
  assert.equal(manifest.capabilities.length, 1);
  assert.deepEqual(manifest.capabilities[0], {
    id: 'process-rules.plan049-passive-exposure-platform',
    kind: 'check',
    phases: ['maintenance', 'qa', 'devops'],
    scope: 'install',
    importance: 'recommended',
    allowed_agents: ['orchestrator', 'pidex-qa', 'pidex-devops', 'pidex-pi'],
    supported_platforms: ['linux', 'wsl2', 'windows-native', 'windows-git-bash'],
    mutability: ['read-only'],
    command: {
      validation_profile: 'node-test-fixed-v1',
      bin: 'node',
      args: ['--test', ...fixedTargets],
    },
  });
});

test('B-T2 process-rules fixed dispatch remains exact and excludes passthrough', () => {
  const manifest = JSON.parse(readFileSync('modules/pidex/process-rules/module.json', 'utf8'));
  const command = manifest.capabilities.find(({ id }) => id === 'process-rules.plan049-passive-exposure-platform')?.command;
  assert.deepEqual(command, {
    validation_profile: 'node-test-fixed-v1',
    bin: 'node',
    args: ['--test', ...fixedTargets],
  });
});

test('B-T3 fixed-profile fixture preserves checkout and records induced child failure', () => {
  const fixture = fixedRunnerFixture("import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  const manifestPath = path.join(fixture.root, 'modules/pidex/process-rules/module.json');
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  copyFileSync(path.join(process.cwd(), 'modules/pidex/process-rules/module.json'), manifestPath);
  for (const agent of ['orchestrator', 'pidex-qa', 'pidex-pi']) writeFileSync(path.join(fixture.root, 'agents', `${agent}.md`), `# ${agent}\n`);
  const invoke = () => spawnSync(process.execPath, [fixture.runnerPath, '--pidex-root', fixture.root, '--capability', 'process-rules.plan049-passive-exposure-platform', '--agent', 'orchestrator', '--phase', 'maintenance', '--project', fixture.root], { cwd: process.cwd(), encoding: 'utf8' });
  const success = invoke();
  assert.equal(success.status, 0, success.stderr);
  assert.equal(evidenceRow(fixture.root).status, 'passed');
  writeFileSync(path.join(fixture.root, fixedTargets[0]), "import { test } from 'node:test'; test('fails', () => process.exit(7));\n");
  const failure = invoke();
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /TARGET_DIRTY|POSTFLIGHT_DRIFT/);
  assert.equal(execFileSync('git', ['diff', '--cached'], { cwd: fixture.root, encoding: 'utf8' }), '');
});

test('node-test-fixed-v1 rejects foreign valid Git worktree before child spawn or evidence append', () => {
  const canonical = fixedRunnerFixture("import { test } from 'node:test'; test('fixed fixture', () => {});\n");
  const marker = 'foreign-child-ran';
  const foreign = fixedRunnerFixture((root) => `import { writeFileSync } from 'node:fs'; import { test } from 'node:test'; test('foreign target', () => writeFileSync(${JSON.stringify(path.join(root, marker))}, 'ran'));\n`);
  const proc = spawnSync(process.execPath, [canonical.runnerPath, '--pidex-root', canonical.root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', foreign.root], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /ROOT_INVALID/);
  assert.equal(existsSync(path.join(foreign.root, marker)), false, 'foreign fixed targets must not execute');
  assert.equal(existsSync(path.join(canonical.root, 'state/modules/evidence')), false, 'root rejection must not append evidence');
});

test('run-check propagates command failure and writes failed evidence', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['scripts/release/fail.mjs'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 7);
  assert.match(proc.stderr, /fixture failure/);
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(row.status, 'failed');
  assert.equal(row.exit_code, 7);
});
