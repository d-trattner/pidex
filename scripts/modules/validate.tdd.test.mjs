import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
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
