import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const skillRoot = path.join(root, 'skills/angular-application');
const skill = readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, 'modules/pidex/angular/module.json'), 'utf8'));

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

test('Angular package exposes one bounded skill over three module capabilities', () => {
  assert.match(skill, /^---\nname: angular-application\ndescription: .{80,1024}\n/m);
  assert.ok(skill.split('\n').length <= 220);
  assert.ok(Buffer.byteLength(skill) <= 14 * 1024);
  assert.deepEqual(manifest.capabilities.map((item) => item.id), ['angular.source-check', 'angular.inspect', 'angular.verify']);
  assert.equal(files(path.join(skillRoot, 'references')).filter((file) => path.basename(file) === 'SKILL.md').length, 0);
});

test('skill gates optimization on module status and keeps Material/Nx conditional without MCP', () => {
  assert.match(skill, /If `pidex\.angular` is disabled, unavailable, or source verification fails, stop using this skill's optimization rules/);
  assert.match(skill, /Material is not a dependency default/);
  assert.match(skill, /Activate when `nx\.json`, `nx`, or `@nx\/angular` is detected/);
  assert.match(skill, /Never use MCP, WebMCP, generated Angular\/Nx AI-config/);
  assert.match(skill, /official `angular-new-app` source coordinate remains attributed but its MCP-bearing file is not packaged or executable/);
  assert.doesNotMatch(skill, /\]\(references\/official-angular\/angular-new-app\.md\)/);
  assert.doesNotMatch(skill, /npx\s+(?:@angular\/cli|nx|create-nx-workspace)@latest/);
});

test('all Markdown links in Angular skill resolve inside the skill root', () => {
  for (const file of files(skillRoot).filter((item) => item.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g)) {
      if (/^https?:/.test(match[1])) continue;
      const target = path.resolve(path.dirname(file), match[1]);
      assert.ok(target === skillRoot || target.startsWith(`${skillRoot}${path.sep}`));
      assert.equal(existsSync(target), true, `${path.relative(root, file)} -> ${match[1]}`);
    }
  }
});
