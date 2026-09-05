import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applySkillResourceAction, planSkillResourceAction, skillResourceStatus } from './skill-resources.mjs';
import { loadModuleSystem, validateSystem } from './lib.mjs';

const roots = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-skill-resources-')); roots.push(root);
  mkdirSync(path.join(root, 'modules', 'pidex'), { recursive: true });
  for (const name of ['core', 'dotnet', 'dapper', 'serilog', 'sqlserver']) cpSync(path.join(process.cwd(), 'modules', 'pidex', name), path.join(root, 'modules', 'pidex', name), { recursive: true });
  mkdirSync(path.join(root, 'config'), { recursive: true });
  writeFileSync(path.join(root, 'config', 'modules.json'), '{"modules":{}}\n');
  mkdirSync(path.join(root, 'agents'), { recursive: true });
  return root;
}
test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

test('root Pi package does not discover default-off nested skills', () => {
  const descriptor = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json')));
  assert.deepEqual(descriptor.pi.skills, ['./skills']);
  for (const name of ['dotnet-backend', 'dapper-data-access', 'serilog-observability', 'sql-server']) assert.equal(existsSync(path.join(process.cwd(), 'skills', name, 'SKILL.md')), false);
});

test('four nested skill packages are valid and default off', () => {
  const root = fixture(); const system = loadModuleSystem(root); const validation = validateSystem(system);
  assert.deepEqual(validation.errors, []);
  const status = skillResourceStatus(root);
  assert.deepEqual(status.map((x) => x.module), ['pidex.dapper', 'pidex.dotnet', 'pidex.serilog', 'pidex.sqlserver']);
  assert.ok(status.every((x) => !x.enabled && existsSync(x.package)));
});

test('module validation rejects escaping and duplicate skill ownership', () => {
  const root = fixture();
  const dotnetManifest = path.join(root, 'modules/pidex/dotnet/module.json');
  const dotnet = JSON.parse(readFileSync(dotnetManifest));
  dotnet.skill_package.path = '../outside'; writeFileSync(dotnetManifest, JSON.stringify(dotnet));
  assert.match(validateSystem(loadModuleSystem(root)).errors.join('\n'), /invalid skill_package path/);

  const duplicateRoot = fixture();
  const dapperManifest = path.join(duplicateRoot, 'modules/pidex/dapper/module.json');
  const dapper = JSON.parse(readFileSync(dapperManifest)); dapper.skill_package.skills = ['dotnet-backend'];
  writeFileSync(dapperManifest, JSON.stringify(dapper));
  assert.match(validateSystem(loadModuleSystem(duplicateRoot)).errors.join('\n'), /declared and packaged skills differ/);

  const hiddenRoot = fixture();
  const hidden = path.join(hiddenRoot, 'modules/pidex/dotnet/pi-package/skills/hidden/deep'); mkdirSync(hidden, { recursive: true });
  writeFileSync(path.join(hidden, 'SKILL.md'), '---\nname: hidden-skill\ndescription: hidden\n---\n');
  assert.match(validateSystem(loadModuleSystem(hiddenRoot)).errors.join('\n'), /declared and packaged skills differ/);
});

test('add-on activation installs base first and changes no sibling', () => {
  const root = fixture(); const calls = [];
  const result = applySkillResourceAction({ pidexRoot: root, action: 'enable', moduleId: 'pidex.dapper', runPi: (command, packageRoot) => { calls.push([command, path.basename(path.dirname(packageRoot))]); return { ok: true }; } });
  assert.deepEqual(result.actions.map((x) => x.moduleId), ['pidex.dotnet', 'pidex.dapper']);
  assert.deepEqual(calls.map((x) => x[0]), ['install', 'install']);
  const local = JSON.parse(readFileSync(path.join(root, 'config', 'modules.local.json')));
  assert.equal(local.modules['pidex.dotnet'].enabled, true); assert.equal(local.modules['pidex.dapper'].enabled, true); assert.equal(local.modules['pidex.serilog'], undefined);
});

test('repeated enable is idempotent and add-on disable preserves base', () => {
  const root = fixture(); const calls = [];
  const runPi = (command, packageRoot) => { calls.push([command, packageRoot]); return { ok: true }; };
  applySkillResourceAction({ pidexRoot: root, action: 'enable', moduleId: 'pidex.dapper', runPi });
  const repeated = applySkillResourceAction({ pidexRoot: root, action: 'enable', moduleId: 'pidex.dapper', runPi });
  assert.equal(repeated.changed, false); assert.equal(calls.length, 2);
  applySkillResourceAction({ pidexRoot: root, action: 'disable', moduleId: 'pidex.dapper', runPi });
  const local = JSON.parse(readFileSync(path.join(root, 'config', 'modules.local.json')));
  assert.equal(local.modules['pidex.dotnet'].enabled, true); assert.equal(local.modules['pidex.dapper'].enabled, false);
});

test('base removal blocks enabled dependents and cascade removes dependents first', () => {
  const root = fixture(); writeFileSync(path.join(root, 'config', 'modules.local.json'), JSON.stringify({ modules: { 'pidex.dotnet': { enabled: true }, 'pidex.dapper': { enabled: true }, 'pidex.serilog': { enabled: true } } }));
  const system = loadModuleSystem(root);
  assert.throws(() => planSkillResourceAction(system, 'disable', 'pidex.dotnet'), /enabled dependents/);
  assert.deepEqual(planSkillResourceAction(system, 'disable', 'pidex.dotnet', true).map((x) => x.moduleId), ['pidex.serilog', 'pidex.dapper', 'pidex.dotnet']);
});

test('failed Pi operation rolls back prior package registration and leaves state unchanged', () => {
  const root = fixture(); const calls = [];
  assert.throws(() => applySkillResourceAction({ pidexRoot: root, action: 'enable', moduleId: 'pidex.dapper', runPi: (command, packageRoot) => { calls.push([command, packageRoot]); return calls.length === 2 ? { ok: false, error: 'fake' } : { ok: true }; } }), /fake/);
  assert.deepEqual(calls.map((x) => x[0]), ['install', 'install', 'remove', 'remove']);
  assert.equal(existsSync(path.join(root, 'config', 'modules.local.json')), false);
});

test('unsafe local module-state link fails and rolls back package registration', () => {
  const root = fixture(); const outside = path.join(root, 'outside.json'); writeFileSync(outside, '{"modules":{}}');
  symlinkSync(outside, path.join(root, 'config', 'modules.local.json'));
  const calls = [];
  assert.throws(() => applySkillResourceAction({ pidexRoot: root, action: 'enable', moduleId: 'pidex.dotnet', runPi: (command, packageRoot) => { calls.push([command, packageRoot]); return { ok: true }; } }), /unsafe modules.local.json/);
  assert.deepEqual(calls.map((x) => x[0]), ['install', 'remove']);
  assert.equal(readFileSync(outside, 'utf8'), '{"modules":{}}');
});

test('skill references resolve and Dapper guidance keeps EF Core non-default', () => {
  const modules = ['dotnet', 'dapper', 'serilog', 'sqlserver'];
  for (const module of modules) {
    const packageRoot = path.join(process.cwd(), 'modules', 'pidex', module, 'pi-package');
    const descriptor = JSON.parse(readFileSync(path.join(packageRoot, 'package.json')));
    const skillDir = path.join(packageRoot, 'skills', descriptor.name.match(/pidex-(.+)-skill/)[1].replace('sqlserver', 'sql-server').replace('dotnet', 'dotnet-backend').replace('dapper', 'dapper-data-access').replace('serilog', 'serilog-observability'));
    const markdown = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    for (const match of markdown.matchAll(/\]\((references\/[^)]+)\)/g)) assert.ok(existsSync(path.join(skillDir, match[1])), `${module}: missing ${match[1]}`);
  }
  const dapper = readFileSync(path.join(process.cwd(), 'modules/pidex/dapper/pi-package/skills/dapper-data-access/SKILL.md'), 'utf8');
  assert.match(dapper, /Prefer Dapper over introducing EF Core/);
  assert.doesNotMatch(dapper, /prefer EF Core|EF Core.*default/i);
});

test('dry-run performs no Pi operation or state write', () => {
  const root = fixture(); let calls = 0;
  const result = applySkillResourceAction({ pidexRoot: root, action: 'enable', moduleId: 'pidex.sqlserver', dryRun: true, runPi: () => { calls++; return { ok: true }; } });
  assert.equal(calls, 0); assert.equal(result.changed, false); assert.equal(existsSync(path.join(root, 'config', 'modules.local.json')), false);
});
