import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scripts, '../../../../..');
function fixture(fn) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'history Node ü # % '));
  const state = path.join(base, 'state'); mkdirSync(state);
  const env = { ...process.env, PIDEX_STATE_DIR: state, RUNNING_PI_STATE_DIR: '', NODE_OPTIONS: '', NODE_TEST_CONTEXT: '', HOME: base, USERPROFILE: base };
  try { return fn({ base, state, env }); } finally { rmSync(base, { recursive: true, force: true }); }
}
function cli(name, args, env, cwd = root, directory = scripts) {
  return spawnSync(process.execPath, [path.join(directory, `${name}.mjs`), ...args], { cwd, env, encoding: 'utf8', timeout: 15000 });
}
function ok(result) { assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); return result.stdout; }
function seed(state, rows) { writeFileSync(path.join(state, 'history.jsonl'), rows.map((r) => JSON.stringify(r)).join('\r\n') + '\r\n'); }
const row = (cwd, ts, extra = {}) => ({ cwd, ts, event: 'direct-start', mode: 'direct', ...extra });

test('history capability appends real JSON with jq absent from PATH', { skip: process.platform === 'win32' }, () => fixture(({ base, state, env }) => {
  const bin = path.join(base, 'bin'); mkdirSync(bin);
  for (const command of ['bash', 'dirname', 'mkdir', 'date', 'git']) {
    const found = spawnSync('/bin/sh', ['-c', `command -v ${command}`], { encoding: 'utf8' }).stdout.trim();
    assert.ok(found); symlinkSync(found, path.join(bin, command));
  }
  symlinkSync(process.execPath, path.join(bin, 'node'));
  const project = path.join(base, 'project'); mkdirSync(project);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', 'analysis-metrics-history.history-append', '--agent', 'orchestrator', '--phase', 'planning', '--project', project, '--', '--event', 'direct-start', '--mode', 'direct', '--epic', "user's flow"], { cwd: root, env: { ...env, PATH: bin, PIDEX_ROOT: root }, encoding: 'utf8', timeout: 15000 });
  ok(result);
  assert.equal(JSON.parse(readFileSync(path.join(state, 'history.jsonl'), 'utf8')).epic, "user's flow");
  assert.match(result.stderr, /module capability evidence:/);
}));

test('Node capabilities keep list evidence and denied append bytes unchanged', () => fixture(({ base, state, env }) => {
  const project = path.join(base, 'project'); mkdirSync(project); seed(state, [row('/kept', '1')]);
  const call = (kind, args) => spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', `analysis-metrics-history.history-${kind}`, '--agent', 'orchestrator', '--phase', 'planning', '--project', project, '--', ...args], { cwd: root, env: { ...env, PIDEX_ROOT: root }, encoding: 'utf8', timeout: 15000 });
  const listed = call('list', ['--json']); assert.equal(ok(listed), ok(cli('list', ['--json'], env))); assert.match(listed.stderr, /module capability evidence:/);
  const file = path.join(state, 'history.jsonl'); const before = readFileSync(file, 'utf8');
  for (const args of [['--event', 'direct-start', '--unknown', 'value'], ['--event', 'direct-start', '--epic', 'line one\nline two'], ['--event', 'direct-start', '--epic', '../escape'], ['--event', 'direct-start', '--cwd', '/unicode-é']]) {
    const rejected = call('append', args); assert.equal(rejected.status, 2); assert.match(rejected.stderr, /passthrough args rejected/); assert.equal(readFileSync(file, 'utf8'), before);
  }
}));

test('append preserves string fields, UTC seconds, repeated fields, reserved ts and prior bytes without tools', () => fixture(({ state, env }) => {
  const args = ['--event', 'direct-start', '--epic', 'é 😀 " \\ \n', '--number', '12', '--flag', 'false', '--foo-bar', 'first', '--foo-bar', 'last', '--__proto__', 'safe'];
  assert.equal(ok(cli('append', args, { ...env, PATH: '' })), '');
  const file = path.join(state, 'history.jsonl'); const first = readFileSync(file, 'utf8'); const saved = JSON.parse(first);
  assert.match(saved.ts, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(saved.epic, args[3]); assert.equal(saved.number, '12'); assert.equal(saved.flag, 'false'); assert.equal(saved.foo_bar, 'last'); assert.equal(saved.__proto__, 'safe');
  ok(cli('append', ['--event', 'old', '--event', 'new', '--ts', 'legacy override'], env));
  const result = readFileSync(file, 'utf8'); assert.ok(result.startsWith(first)); assert.ok(result.endsWith('\n'));
  const second = JSON.parse(result.slice(first.length)); assert.equal(second.event, 'new');
  assert.match(second.ts, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, 'reserved ts cannot replace generated timestamp');
  for (const bad of [[], ['--event'], ['--event', ''], ['oops'], ['--event', 'x', '--epic'], ['--event', 'x', '--bad.key', 'v']]) {
    assert.notEqual(cli('append', bad, env).status, 0); assert.equal(readFileSync(file, 'utf8'), result);
  }
}));

test('list keeps newest exact cwd, stable ties, temp exclusion and JSON/text formats', () => fixture(({ state, env }) => {
  seed(state, [row('/z', '1', { epic: 'old' }), row('/z', '3'), row('/a', '3', { epic: 42, mode: false }), row('/a', '3', { event: 'direct-complete', epic: 'winner', mode: null }), row('/temp', '9'), row('/temp/child', '9'), row('/temporary', '2'), row('', '9'), { ts: '8' }]);
  const e = { ...env, TMPDIR: '/temp/' };
  const expected = [
    { cwd: '/z', last_event: 'direct-start', last_ts: '3', last_epic: '', last_mode: 'direct' },
    { cwd: '/a', last_event: 'direct-complete', last_ts: '3', last_epic: 'winner', last_mode: null },
    { cwd: '/temporary', last_event: 'direct-start', last_ts: '2', last_epic: '', last_mode: 'direct' },
  ];
  assert.equal(ok(cli('list', ['--json'], { ...e, PATH: '' })), JSON.stringify(expected, null, 2) + '\n');
  assert.equal(ok(cli('list', ['--limit', '2'], e)), 'A) /z\n   last touched: 3 (direct, direct-start)\nB) /a\n   last touched: 3 (—, direct-complete)\n   epic: winner\n');
  for (const [limit, count] of [['0', 0], ['1.5', 2], ['-1', 2], ['null', 3]]) assert.equal(JSON.parse(ok(cli('list', ['--json', '--limit', limit], e))).length, count);
  for (const limit of ['bad', 'true', '"2"']) assert.notEqual(cli('list', ['--json', '--limit', limit], e).status, 0);
  assert.equal(cli('list', ['--project', '/a'], e).status, 2, 'unsupported legacy flag must not become a filter');
}));

test('list distinguishes absent/empty/whitespace and reads a strict JSON stream without mutating it', () => fixture(({ state, env }) => {
  const file = path.join(state, 'history.jsonl');
  for (const args of [[], ['--json']]) assert.equal(ok(cli('list', args, env)), '');
  writeFileSync(file, ''); assert.equal(ok(cli('list', ['--json'], env)), '');
  writeFileSync(file, ' \r\n\t'); assert.equal(ok(cli('list', ['--json'], env)), '[]\n');
  const stream = JSON.stringify(row('/a', '1', { epic: { nested: ['}', '\\"'] } }), null, 2) + JSON.stringify(row('/b', '2'));
  writeFileSync(file, stream); assert.equal(JSON.parse(ok(cli('list', ['--json'], env))).length, 2); assert.equal(readFileSync(file, 'utf8'), stream);
  writeFileSync(file, '\ufeff' + stream); assert.equal(JSON.parse(ok(cli('list', ['--json'], env))).length, 2, 'UTF-8 BOM remains readable');
  for (const invalid of ['{"cwd":', '{} garbage', 'nullnull', '[]', '12', '{"cwd":12}']) {
    writeFileSync(file, invalid); assert.notEqual(cli('list', ['--json'], env).status, 0); assert.equal(readFileSync(file, 'utf8'), invalid);
  }
}));

test('list retains jq value ordering, structured text and ten-label boundary', () => fixture(({ state, env }) => {
  seed(state, [row('/a', { a: 1 }, { mode: [1], epic: false }), row('/b', [1]), row('/c', null)]);
  assert.deepEqual(JSON.parse(ok(cli('list', ['--json'], env))).map((r) => r.cwd), ['/a', '/b', '/c']);
  assert.match(ok(cli('list', [], env)), /last touched: \{\n  "a": 1\n\} \(\[\n  1\n\], direct-start\)/);
  seed(state, Array.from({ length: 11 }, (_, i) => row(`/project${i}`, String(i))));
  assert.equal(JSON.parse(ok(cli('list', ['--json', '--limit', '20'], env))).length, 11);
  const text = cli('list', ['--limit', '20'], env); assert.equal(text.status, 1);
  assert.equal(text.stdout.split('\n').filter((line) => /^[A-J]\)/.test(line)).length, 10);
}));

test('list compares nested timestamps by keys, values and array length without losing equal-row order', () => fixture(({ state, env }) => {
  seed(state, [row('/number-low', 1), row('/number-high', 2), row('/array-short', [1]), row('/array-long', [1, 2]), row('/array-diff', [2]), row('/object-low', { a: 1 }), row('/object-high', { a: 2 }), row('/object-key', { b: 0 }), row('/equal', { a: [1, 2] }, { event: 'old' }), row('/equal', { a: [1, 2] }, { event: 'new' })]);
  const results = JSON.parse(ok(cli('list', ['--json', '--limit', 'null'], env)));
  assert.deepEqual(results.map((r) => r.cwd), ['/object-key', '/equal', '/object-high', '/object-low', '/array-diff', '/array-long', '/array-short', '/number-high', '/number-low']);
  assert.equal(results[1].last_event, 'new');
}));

test('history rejects an invalid bridge operation and filesystem failures without success output', () => fixture(({ state, env }) => {
  const invalid = cli('shell', ['unknown', state, '', ''], env);
  assert.equal(invalid.status, 2); assert.equal(invalid.stdout, '');
  mkdirSync(path.join(state, 'history.jsonl'));
  for (const [kind, args] of [['list', ['--json']], ['append', ['--event', 'direct-start']]]) {
    const result = cli(kind, args, env); assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
  }
}));

test('history state precedence and default root are isolated from cwd and inherited roots', () => fixture(({ base, env }) => {
  const copy = path.join(base, 'fixture repo ü # %');
  const dest = path.join(copy, 'modules/pidex/analysis-metrics-history/scripts/history');
  cpSync(scripts, dest, { recursive: true });
  cpSync(path.join(root, 'modules/pidex/analysis-metrics-history/lib/state-root.mjs'), path.join(copy, 'modules/pidex/analysis-metrics-history/lib/state-root.mjs'));
  for (const [canonical, legacy, selected] of [['', '', path.join(copy, 'state')], ['', 'legacy', path.join(base, 'legacy')], ['canonical', 'legacy', path.join(base, 'canonical')]]) {
    const e = { ...env, PIDEX_STATE_DIR: canonical, RUNNING_PI_STATE_DIR: legacy };
    ok(cli('append', ['--event', 'direct-start', '--cwd', 'C:\\work\\space ü'], e, base, dest));
    const entries = JSON.parse(ok(cli('list', ['--json'], e, base, dest)));
    assert.equal(entries[0].cwd, 'C:\\work\\space ü'); assert.match(readFileSync(path.join(selected, 'history.jsonl'), 'utf8'), /direct-start/);
  }
}));

test('Git Bash history wrappers convert MSYS state and temp paths at the native boundary', { skip: process.platform !== 'win32' }, () => fixture(({ base, state, env }) => {
  const temp = path.join(base, 'temp'); mkdirSync(temp); const cwd = path.join(base, 'workspace');
  const call = (name, args) => spawnSync('bash', ['-c', 'export PIDEX_STATE_DIR="$(cygpath -u "$1")"; export TMPDIR="$(cygpath -u "$2")"; shift 2; exec bash "$@"', 'history-msys', state, temp, path.join(scripts, `${name}.sh`).replaceAll('\\', '/'), ...args], { env, encoding: 'utf8', timeout: 15000 });
  ok(call('append', ['--event', 'direct-start', '--cwd', cwd]));
  assert.equal(JSON.parse(readFileSync(path.join(state, 'history.jsonl'), 'utf8')).cwd, cwd);
  assert.equal(ok(call('list', ['--json'])), ok(cli('list', ['--json'], { ...env, TMPDIR: temp })));
}));

test('legacy shell entrypoints preserve argv and exit semantics', () => fixture(({ base, state, env }) => {
  const call = (name, args) => spawnSync('bash', [path.join(scripts, `${name}.sh`).replaceAll('\\', '/'), ...args], { env, encoding: 'utf8', timeout: 15000 });
  const cwd = path.join(base, 'work ü # %');
  assert.equal(ok(call('append', ['--event', 'direct-start', '--cwd', cwd, '--epic', "user's \"flow\""])), '');
  assert.equal(ok(call('list', ['--json'])), ok(cli('list', ['--json'], env)));
  assert.equal(call('append', []).status, 2);
  assert.equal(JSON.parse(readFileSync(path.join(state, 'history.jsonl'), 'utf8')).cwd, cwd);
}));
