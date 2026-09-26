import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkInventory } from './check-inventory.mjs';
import { CHECK_STAGES } from './run-check-stages.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
// Deliberately narrow guard for the known single-line anti-pattern, not a claim
// of exhaustive data-flow analysis. HTTP/router pathname usage is legitimate.
const unsafePath = /\b(?:join|resolve|dirname|readFile(?:Sync)?)\([^;\n]*\.pathname\b/;

test('known URL pathname-to-filesystem mistakes are rejected across tracked sources', () => {
  const files = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  const offenders = files.filter(file => /^(scripts|extensions|modules|dashboard)\/.*\.(?:mjs|ts|tsx)$/.test(file))
    .filter(file => file !== 'scripts/package-manager/windows-portability.tdd.test.mjs')
    .filter(file => unsafePath.test(readFileSync(path.join(root, file), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('pathname guard rejects old patterns but permits URL and filesystem APIs', () => {
  for (const source of ['path.dirname(new URL(import.meta.url).pathname)', 'join(rootRouteRoot.pathname, file)', 'readFile(url.pathname)']) assert.ok(unsafePath.test(source));
  for (const source of ['path.dirname(fileURLToPath(import.meta.url))', 'readFile(new URL(file, import.meta.url))', 'location.pathname === item.to']) assert.equal(unsafePath.test(source), false);
});

test('URL conversion preserves drive, UNC, spaces and encoded characters', () => {
  assert.equal(fileURLToPath('file:///C:/Users/Test%20User/project%23%25/', { windows: true }), 'C:\\Users\\Test User\\project#%\\');
  assert.equal(fileURLToPath('file://server/share/project%20name/', { windows: true }), '\\\\server\\share\\project name\\');
  assert.equal(fileURLToPath('file:///tmp/project%20%23%25/', { windows: false }), '/tmp/project #%/');
});

test('inventory covers every stage command in exact acceptance order, without execution', () => {
  const inventory = checkInventory(scripts);
  assert.deepEqual(inventory.map(item => item.command), CHECK_STAGES.flatMap(stage => scripts[stage].split(' && ')));
  assert.deepEqual(inventory.map(item => item.ordinal), inventory.map((_, index) => index + 1));
  assert.ok(inventory.every(item => item.approval === 'not-authorized-by-inventory'));
  for (const stage of CHECK_STAGES) assert.deepEqual(inventory.filter(item => item.stage === stage).map(item => item.stageOrdinal), scripts[stage].split(' && ').map((_, index) => index + 1));
});

test('inventory fails closed on missing stages and unsupported shell grammar', () => {
  for (const command of ['', 'node a.mjs; node b.mjs', 'node a.mjs || true', 'node "a b.mjs"', 'node a.mjs\nnode b.mjs', 'node a.mjs > out', 'node $(evil)']) {
    assert.throws(() => checkInventory({ ...scripts, [CHECK_STAGES[0]]: command }));
  }
});
