import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { validateNodeTestFixedRuntime } from './lib.mjs';
import { addFixtureAgentRule, makeModuleFixture } from './test-helpers.mjs';

test('validates a correct module fixture', () => {
  const { root, project } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(JSON.parse(out).ok, true);
});

test('accepts relative project paths and resolves them to absolute paths', () => {
  const { root } = makeModuleFixture();
  const script = path.resolve('scripts/modules/validate.mjs');
  const out = execFileSync(process.execPath, [script, '--pidex-root', root, '--project', '.'], { cwd: root, encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.project, root);
});

test('rejects core-required modules in config', () => {
  const { root, project } = makeModuleFixture();
  writeFileSync(path.join(root, 'config/modules.json'), JSON.stringify({ modules: { 'pidex.core': { enabled: false } } }, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /core-required module must not be configurable/);
});

test('allows disabled release-safety for pidex self-release context because public-readiness is fixed core', () => {
  const { root } = makeModuleFixture({ releaseEnabled: false });
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', root], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 0);
  assert.equal(JSON.parse(proc.stdout).ok, true);
});

test('rejects command file args escaping pidex root', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['../outside.mjs'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /command file arg escapes PIDEX root/);
});

test('rejects risky interpreter flags in module commands', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['-e', 'console.log(1)'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /risky interpreter flag is not allowed/);
});

test('rejects passthrough capability without policy', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /passthrough commands must define passthrough_policy/);
});

test('rejects passthrough capability with invalid policy regex', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['['] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /invalid passthrough allowed pattern/);
});

test('rejects passthrough policy with non-boolean absolute path setting', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^--json$'], allow_absolute_project_paths: 'yes' };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /allow_absolute_project_paths must be boolean/);
});

test('validates module-scoped agent_rules with confined markdown path', () => {
  const { root, project } = makeModuleFixture();
  addFixtureAgentRule(root);
  const out = execFileSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(JSON.parse(out).ok, true);
});

test('rejects unsafe module-scoped agent_rules schema and ids', () => {
  const cases = [
    { name: 'bad authority', rule: { authority: 'global' }, pattern: /invalid agent_rule authority/ },
    { name: 'orchestrator', rule: { agent: 'orchestrator' }, pattern: /orchestrator agent_rules are not allowed/ },
    { name: 'unknown agent', rule: { agent: 'pidex-missing' }, pattern: /unknown agent_rule agent/ },
    { name: 'unknown phase', rule: { phases: ['made-up'] }, pattern: /invalid agent_rule phase/ },
    { name: 'unscoped id', rule: { id: 'qa-rule' }, pattern: /agent_rule id must start with module id prefix/ },
    { name: 'html summary', rule: { summary: '<script>alert(1)</script>' }, pattern: /invalid agent_rule summary/ },
    { name: 'bidi summary rtl override', rule: { summary: 'safe\u202Egnidaeh' }, pattern: /invalid agent_rule summary/ },
    { name: 'bidi summary isolate', rule: { summary: 'safe\u2066hidden' }, pattern: /invalid agent_rule summary/ },
    { name: 'bad mode', rule: { applies_when: { mode: 'release\nmode' } }, pattern: /invalid agent_rule applies_when.mode/ },
  ];
  for (const item of cases) {
    const { root, project } = makeModuleFixture();
    addFixtureAgentRule(root, { rule: item.rule });
    const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(proc.status, 0, item.name);
    assert.match(proc.stdout, item.pattern, item.name);
  }
});

test('rejects unsafe module-scoped agent_rules paths symlinks and size', () => {
  const pathCases = [
    { name: 'absolute path', path: '/tmp/rule.md', pattern: /agent_rule path must be relative/ },
    { name: 'traversal path', path: '../rule.md', pattern: /agent_rule path must not contain traversal/ },
    { name: 'non markdown', path: 'rules/pidex-devops/rule.txt', pattern: /agent_rule path must be markdown/ },
  ];
  for (const item of pathCases) {
    const { root, project } = makeModuleFixture();
    addFixtureAgentRule(root, { path: item.path });
    const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(proc.status, 0, item.name);
    assert.match(proc.stdout, item.pattern, item.name);
  }

  const { root: hugeRoot, project: hugeProject } = makeModuleFixture();
  addFixtureAgentRule(hugeRoot, { content: `# huge\n${'x'.repeat(17 * 1024)}` });
  const huge = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', hugeRoot, '--project', hugeProject], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(huge.status, 0);
  assert.match(huge.stdout, /agent_rule file exceeds max size/);

  const { root: linkRoot, project: linkProject } = makeModuleFixture();
  addFixtureAgentRule(linkRoot);
  const moduleDir = path.join(linkRoot, 'modules/pidex/release-safety');
  symlinkSync(path.join(moduleDir, 'rules/pidex-devops/pre-release.md'), path.join(moduleDir, 'rules/pidex-devops/link.md'));
  const manifestPath = path.join(moduleDir, 'module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.agent_rules[0].path = 'rules/pidex-devops/link.md';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const link = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', linkRoot, '--project', linkProject], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(link.status, 0);
  assert.match(link.stdout, /agent_rule path must not include symlinks/);
});

test('rejects duplicate module-scoped agent_rule ids across modules', () => {
  const { root, project } = makeModuleFixture();
  addFixtureAgentRule(root);
  const manifestPath = path.join(root, 'modules/pidex/core/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.agent_rules = [{ id: 'pidex.release-safety.pre-release-devops', agent: 'pidex-devops', phases: ['pre-release'], path: 'rules/core.md', authority: 'module-scoped' }];
  mkdirSync(path.join(root, 'modules/pidex/core/rules'), { recursive: true });
  writeFileSync(path.join(root, 'modules/pidex/core/rules/core.md'), '# core\n');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /duplicate agent_rule id/);
});

test('accepts only explicit node-test-fixed-v1 fixed test vectors while preserving legacy commands', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command = {
    validation_profile: 'node-test-fixed-v1',
    bin: 'node',
    args: [
      '--test',
      'scripts/quality/rule-inventory.tdd.test.mjs',
      'scripts/quality/rule-exposure.tdd.test.mjs',
      'modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.tdd.test.mjs',
      'scripts/quality/plan-042-preservation.tdd.test.mjs',
      'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.tdd.test.mjs',
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const accepted = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stdout);

  const fixed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const mutation of [
    (command) => { command.validation_profile = 'unknown-v1'; },
    (command) => { command.bin = 'bash'; },
    (command) => { command.args[0] = '--eval'; },
    (command) => { command.args.reverse(); },
    (command) => { command.args[1] = '../outside.test.mjs'; },
    (command) => { command.passthrough = true; },
  ]) {
    const changed = JSON.parse(JSON.stringify(fixed));
    mutation(changed.capabilities[0].command);
    writeFileSync(manifestPath, JSON.stringify(changed, null, 2));
    const rejected = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
  }
});

const RUNTIME_TARGETS = [
  'scripts/quality/rule-inventory.tdd.test.mjs',
  'scripts/quality/rule-exposure.tdd.test.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/rule-exposure-tracer.tdd.test.mjs',
  'scripts/quality/plan-042-preservation.tdd.test.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.tdd.test.mjs',
];

function makeRuntimeFixture() {
  const { root } = makeModuleFixture();
  for (const target of RUNTIME_TARGETS) {
    const file = path.join(root, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "import { test } from 'node:test'; test('fixture', () => {});\n");
  }
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '-m', 'fixture'], { cwd: root });
  return { root, command: { validation_profile: 'node-test-fixed-v1', bin: 'node', args: ['--test', ...RUNTIME_TARGETS] } };
}

function runtimeError(root, command) {
  return validateNodeTestFixedRuntime(root, command).error || '';
}

test('A-T2 preserves legacy validation and A-T3 rejects unknown profile without inference', () => {
  const { root } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const legacy = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', root], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(legacy.status, 0, legacy.stdout);
  manifest.capabilities[0].command.validation_profile = 'unknown-v1';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const unknown = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', root], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stdout, /unknown command validation profile: unknown-v1/);
});

test('A-T4 rejects non-worktree, nested canonical root, and missing HEAD', () => {
  const plain = makeModuleFixture().root;
  const command = { validation_profile: 'node-test-fixed-v1', bin: 'node', args: ['--test', ...RUNTIME_TARGETS] };
  assert.match(runtimeError(plain, command), /GIT_UNAVAILABLE/);

  const fixture = makeRuntimeFixture();
  assert.match(runtimeError(path.join(fixture.root, 'modules'), fixture.command), /ROOT_INVALID/);

  const headless = makeModuleFixture().root;
  for (const target of RUNTIME_TARGETS) {
    const file = path.join(headless, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'fixture\n');
  }
  execFileSync('git', ['init'], { cwd: headless });
  assert.match(runtimeError(headless, command), /GIT_UNAVAILABLE/);
});

test('A-T5 rejects stage-0, content, and regular-leaf violations', () => {
  const absent = makeRuntimeFixture();
  unlinkSync(path.join(absent.root, RUNTIME_TARGETS[0]));
  assert.match(runtimeError(absent.root, absent.command), /TARGET_/);

  const untracked = makeRuntimeFixture();
  execFileSync('git', ['rm', '--cached', '--', RUNTIME_TARGETS[0]], { cwd: untracked.root });
  assert.match(runtimeError(untracked.root, untracked.command), /TARGET_UNTRACKED/);

  const unmerged = makeRuntimeFixture();
  const hash = execFileSync('git', ['rev-parse', `HEAD:${RUNTIME_TARGETS[0]}`], { cwd: unmerged.root, encoding: 'utf8' }).trim();
  execFileSync('git', ['update-index', '--index-info'], { cwd: unmerged.root, input: `100644 ${hash} 1\t${RUNTIME_TARGETS[0]}\n100644 ${hash} 2\t${RUNTIME_TARGETS[0]}\n`, encoding: 'utf8' });
  assert.match(runtimeError(unmerged.root, unmerged.command), /TARGET_UNTRACKED/);

  const nonRegularMode = makeRuntimeFixture();
  execFileSync('git', ['update-index', '--add', '--cacheinfo', `120000,${hash},${RUNTIME_TARGETS[0]}`], { cwd: nonRegularMode.root });
  assert.match(runtimeError(nonRegularMode.root, nonRegularMode.command), /TARGET_UNTRACKED/);

  const dirty = makeRuntimeFixture();
  writeFileSync(path.join(dirty.root, RUNTIME_TARGETS[0]), 'drift\n');
  assert.match(runtimeError(dirty.root, dirty.command), /TARGET_DIRTY/);

  const directory = makeRuntimeFixture();
  const leaf = path.join(directory.root, RUNTIME_TARGETS[0]);
  unlinkSync(leaf);
  mkdirSync(leaf);
  assert.match(runtimeError(directory.root, directory.command), /TARGET_TYPE/);
});

test('A-T6 rejects lexical escape, portable Node-visible links, root-self, and realpath escape', () => {
  const fixture = makeRuntimeFixture();
  for (const target of ['../outside.test.mjs', '/tmp/outside.test.mjs', '', 'scripts/quality/../quality/rule-inventory.tdd.test.mjs']) {
    assert.notEqual(runtimeError(fixture.root, { ...fixture.command, args: ['--test', target] }), '', target || 'root-self');
  }

  const linkedLeaf = makeRuntimeFixture();
  const leaf = path.join(linkedLeaf.root, RUNTIME_TARGETS[0]);
  unlinkSync(leaf);
  symlinkSync(path.join(linkedLeaf.root, RUNTIME_TARGETS[1]), leaf);
  assert.match(runtimeError(linkedLeaf.root, linkedLeaf.command), /TARGET_LINK/);

  const linkedComponent = makeRuntimeFixture();
  renameSync(path.join(linkedComponent.root, 'scripts'), path.join(linkedComponent.root, 'scripts-real'));
  symlinkSync(path.join(linkedComponent.root, 'scripts-real'), path.join(linkedComponent.root, 'scripts'));
  assert.match(runtimeError(linkedComponent.root, linkedComponent.command), /TARGET_LINK/);

  const escaped = makeRuntimeFixture();
  const escapedLeaf = path.join(escaped.root, RUNTIME_TARGETS[0]);
  unlinkSync(escapedLeaf);
  symlinkSync('/tmp', escapedLeaf);
  assert.match(runtimeError(escaped.root, escaped.command), /TARGET_LINK|TARGET_ESCAPE/);

  rmSync(path.join(escaped.root, 'state'), { recursive: true, force: true });
});

test('rejects command bins outside the stage 1 allowlist', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.bin = 'python';
  manifest.capabilities[0].command.args = ['scripts/release/reference-integrity.mjs'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /command bin is not allowed/);
});
