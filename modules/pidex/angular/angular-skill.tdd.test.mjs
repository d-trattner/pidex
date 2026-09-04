import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const skillRoot = path.join(root, 'skills/angular-application');
const skill = readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const edgeCases = readFileSync(path.join(skillRoot, 'references/learned-edge-cases.md'), 'utf8');
const materialProfile = readFileSync(path.join(skillRoot, 'references/profiles/material.md'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, 'modules/pidex/angular/module.json'), 'utf8'));

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

test('Angular package exposes one adaptive base skill and two read-only capabilities', () => {
  assert.match(skill, /^---\nname: angular-application\ndescription: .{80,1024}\n/m);
  assert.ok(skill.split('\n').length <= 220);
  assert.ok(Buffer.byteLength(skill) <= 14 * 1024);
  assert.deepEqual(manifest.capabilities.map((item) => item.id), ['angular.source-check', 'angular.inspect']);
  assert.ok(manifest.capabilities.every((item) => item.mutability.length === 1 && item.mutability[0] === 'read-only'));
  assert.equal(files(path.join(skillRoot, 'references')).filter((file) => path.basename(file) === 'SKILL.md').length, 0);
});

test('skill keeps official base, Material and Nx profiles conditional and MCP excluded', () => {
  assert.match(skill, /If `pidex\.angular` is disabled, unavailable, or source verification fails, stop before applying this skill/);
  assert.match(skill, /Material is not a default dependency/);
  assert.match(skill, /Activate only when `nx\.json`, `nx`, or `@nx\/angular` is detected/);
  assert.match(skill, /Never use MCP, WebMCP, generated Angular\/Nx AI-config/);
  assert.match(skill, /PIDEX supplies no Angular build\/test\/lint\/affected executor/);
  assert.doesNotMatch(skill, /angular\.verify|--resolve-nx/);
  assert.doesNotMatch(skill, /npx\s+(?:@angular\/cli|nx|create-nx-workspace)@latest/);
  assert.match(materialProfile, /Material 3 theming, focus treatment, and harness adoption are additive checks/);
  assert.match(materialProfile, /must not replace, weaken, or omit any required interaction, mode transition, state, or focused test/);
  assert.match(materialProfile, /appearance modes use the current Material 3 Sass `mat\.theme` API with explicit `color-scheme`/);
  assert.match(materialProfile, /component harnesses with `TestbedHarnessEnvironment` rather than generic or private DOM interaction/);
  assert.match(materialProfile, /do not add `ChangeDetectionStrategy\.OnPush` solely because signals or Material are used/);
});

test('module ships no Angular command or benchmark execution substrate', () => {
  const runtime = files(path.join(root, 'modules/pidex/angular')).filter((file) => file.endsWith('.mjs') && !file.endsWith('.tdd.test.mjs')).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(runtime, /node:child_process|\bspawn(?:Sync)?\s*\(|\bexec(?:File|Sync)?\s*\(/);
  for (const removed of ['verify.mjs', 'managed-process.mjs', 'verification-contract.mjs', 'nx-cli.mjs', 'benchmark-contract.mjs']) assert.equal(files(path.join(root, 'modules/pidex/angular')).some((file) => path.basename(file) === removed), false);
});

test('learned edge-case layer contains no untested technical rule', () => {
  assert.match(edgeCases, /no PIDEX benchmark or real-project edge case has been admitted yet/);
  assert.match(edgeCases, /documented failure with the official baseline/);
  assert.match(skill, /evidence-backed-edge-cases: '0'/);
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
