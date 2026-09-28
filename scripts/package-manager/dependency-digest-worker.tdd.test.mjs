import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { boundedSeedDependencyDigest, dependencyAuditReceipt, diagnosticEnvironment, diagnosticProcess, seedDependencyDigest } from './diagnose-checks.mjs';

function fixture() {
  const owned = mkdtempSync(path.join(os.tmpdir(), 'pidex digest ü # %-'));
  const source = path.join(owned, 'source');
  for (const dir of ['node_modules/nested', 'dashboard/ignored']) mkdirSync(path.join(source, dir), { recursive: true });
  writeFileSync(path.join(source, 'dashboard/package.json'), '{"name":"@pidex/dashboard"}');
  writeFileSync(path.join(source, 'dashboard/ignored/ü # %.txt'), 'content-only-placeholder');
  writeFileSync(path.join(source, 'node_modules/nested/large'), Buffer.alloc(2 * 1024 * 1024, 37));
  writeFileSync(path.join(source, 'node_modules/empty'), '');
  symlinkSync(path.join(source, 'dashboard'), path.join(source, 'node_modules/workspace'), 'junction');
  return { owned, source, close: () => rmSync(owned, { recursive: true, force: true }) };
}

// Independent construction of the pre-change framing. Positive fixtures only;
// rejection/containment checks are exercised against both actual APIs below.
function legacyFraming(source) {
  const root = path.join(source, 'node_modules'); const chunks = [];
  const add = value => chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name); const stat = lstatSync(file); const relative = path.relative(root, file);
      add(`${relative.length}:${relative}`);
      if (stat.isSymbolicLink()) add(`link:${readlinkSync(file)}`);
      else if (stat.isDirectory()) { add('directory'); walk(file); }
      else { add(`file:${stat.size}:`); add(readFileSync(file)); }
    }
  }
  walk(root); walk(path.join(source, 'dashboard'));
  return createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
}

test('bounded worker and observed sync digest preserve legacy bytes and include ignored workspace files', async () => {
  const f = fixture();
  try {
    const events = []; const expected = legacyFraming(f.source);
    assert.equal(seedDependencyDigest(f.source, { onProgress: event => events.push(event) }), expected);
    const logRoot = path.join(f.owned, 'audit');
    assert.equal(await boundedSeedDependencyDigest({ source: f.source, logRoot, timeoutMs: 10000 }), expected);
    const lines = readFileSync(path.join(logRoot, 'stdout.log'), 'utf8');
    const receipts = lines.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(receipts[0].event, 'start'); assert.equal(receipts.at(-1).digest, expected);
    assert.ok(receipts.some(event => event.operation === 'read-file' && event.currentFileBytes === 2 * 1024 * 1024));
    assert.equal(events.at(-1).operation, 'complete'); assert.ok(events.at(-1).bytes > 2 * 1024 * 1024);
    assert.equal(lines.includes(f.source), false); assert.equal(lines.includes('content-only-placeholder'), false);
    const process = JSON.parse(readFileSync(path.join(logRoot, 'process.json')));
    assert.equal(process.exitObserved, true); assert.ok(process.pid > 0); assert.equal(process.code, 0);
    assert.equal(process.cleanupScope, 'dedicated-hash-worker'); assert.equal(process.termination, null);
    await assert.rejects(boundedSeedDependencyDigest({ source: f.source, logRoot, timeoutMs: 10000 }), /EEXIST/);
    writeFileSync(path.join(f.source, 'dashboard/ignored/ü # %.txt'), 'changed');
    assert.notEqual(await boundedSeedDependencyDigest({ source: f.source, logRoot: path.join(f.owned, 'changed'), timeoutMs: 10000 }), expected);
  } finally { f.close(); }
});

test('worker still rejects foreign links, hardlinks, root aliases and wrong workspace identity', async () => {
  for (const kind of ['foreign-link', 'hardlink', 'root-alias', 'workspace-identity']) {
    const f = fixture();
    try {
      const outside = path.join(f.owned, 'outside'); mkdirSync(outside);
      if (kind === 'foreign-link') symlinkSync(outside, path.join(f.source, 'node_modules/foreign'), 'junction');
      if (kind === 'hardlink') linkSync(path.join(f.source, 'node_modules/empty'), path.join(outside, 'hardlink'));
      if (kind === 'root-alias') { rmSync(path.join(f.source, 'node_modules'), { recursive: true, force: true }); symlinkSync(outside, path.join(f.source, 'node_modules'), 'junction'); }
      if (kind === 'workspace-identity') writeFileSync(path.join(f.source, 'dashboard/package.json'), '{"name":"wrong"}');
      assert.throws(() => seedDependencyDigest(f.source));
      const logRoot = path.join(f.owned, 'audit');
      await assert.rejects(boundedSeedDependencyDigest({ source: f.source, logRoot, timeoutMs: 10000 }), /did not complete: exit/);
      const result = JSON.parse(readFileSync(path.join(logRoot, 'process.json')));
      assert.equal(result.code, 2); assert.equal(result.exitObserved, true);
      const last = JSON.parse(readFileSync(path.join(logRoot, 'stdout.log'), 'utf8').trim().split('\n').at(-1));
      assert.equal(last.event, 'error'); assert.equal(last.digest, undefined);
    } finally { f.close(); }
  }
});

test('terminal receipt validation rejects empty, partial, malformed and inconsistent output', () => {
  const valid = { event: 'complete', scope: 'seed-dependency-digest', digest: 'a'.repeat(64), counts: { operation: 'complete', entries: 1, files: 1, directories: 0, links: 0, bytes: 10 } };
  assert.equal(dependencyAuditReceipt(JSON.stringify(valid) + '\r\n'), valid.digest);
  for (const text of ['', '{', 'null', JSON.stringify({ event: 'progress', operation: 'complete' }), JSON.stringify({ ...valid, digest: 'partial' }), JSON.stringify({ ...valid, counts: { ...valid.counts, entries: 2 } }), JSON.stringify({ ...valid, counts: { ...valid.counts, bytes: -1 } }), JSON.stringify(valid) + '\n{"event":"error"}', ' '.repeat(256 * 1024 + 1)]) {
    assert.throws(() => dependencyAuditReceipt(text), /dependency audit/);
  }
});

test('parent deadline terminates a child blocked in a synchronous loop, not a child timer', async () => {
  const f = fixture();
  try {
    const logRoot = path.join(f.owned, 'blocked'); mkdirSync(logRoot);
    const result = await diagnosticProcess({ bin: process.execPath,
      args: ['-e', 'require("node:fs").writeSync(1,"sync-loop-start\\n"); while(true) {}'],
      cwd: f.source, env: diagnosticEnvironment(process.env, f.source, logRoot), logRoot, timeoutMs: 1000 });
    assert.match(readFileSync(path.join(logRoot, 'stdout.log'), 'utf8'), /sync-loop-start/);
    assert.equal(result.kind, 'timeout'); assert.equal(result.exitObserved, true);
    assert.throws(() => process.kill(result.pid, 0), /ESRCH/);
  } finally { f.close(); }
});

// Execute the actual supervisor function with deterministic Windows event ordering.
// This is a control-flow test, NOT native taskkill or process-tree qualification.
function windowsDeadlineFixture({ leaf = true, killResult = { status: 128 }, platform = 'win32' } = {}) {
  const child = new EventEmitter(); child.pid = 123;
  const token = Symbol('test-only leaf capability'); const timers = []; const closed = []; let nextFd = 1;
  const run = runInNewContext(`(${diagnosticProcess.toString()})`, {
    DIGEST_WORKER_LEAF: token, path, Date,
    process: { platform, kill() {} },
    spawn: () => child, spawnSync: () => killResult,
    openSync: () => nextFd++, closeSync: fd => closed.push(fd),
    setTimeout: (fn, ms) => { const timer = { fn, ms, active: true }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.active = false; },
  });
  const promise = run({ bin: 'node', args: [], cwd: 'fixture', env: {}, logRoot: 'logs', timeoutMs: 1, leafProof: leaf === true ? token : leaf });
  const fire = ms => { const timer = timers.find(row => row.active && row.ms === ms); assert.ok(timer, `active timer ${ms}`); timer.active = false; timer.fn(); };
  return { child, promise, fire, closed };
}

test('failed taskkill followed by observed dedicated-worker exit stays timeout, never digest success', async () => {
  for (const killResult of [{ status: 128 }, { status: null, error: { code: 'ENOENT' } }, { status: null, signal: 'SIGTERM' }]) {
    const f = windowsDeadlineFixture({ killResult });
    f.fire(1);
    let settled = false; f.promise.then(() => { settled = true; }); await Promise.resolve();
    assert.equal(settled, false, 'must wait for real root close, not infer exit from taskkill');
    f.child.emit('close', 0, null);
    const result = await f.promise;
    assert.equal(result.kind, 'timeout'); assert.equal(result.exitObserved, true); assert.equal(result.code, 0);
    assert.equal(result.cleanupScope, 'dedicated-hash-worker');
    assert.equal(result.termination.status, killResult.status);
    assert.equal(result.termination.errorCode, killResult.error?.code ?? null);
    assert.equal(result.termination.signal, killResult.signal ?? null);
    assert.deepEqual(f.closed, [1, 2]);
  }
});

test('unknown trees and unobserved leaf exits stay cleanup-uncertain', async () => {
  for (const leaf of [false, 'dedicated-hash-worker', Symbol('fake capability')]) {
    const f = windowsDeadlineFixture({ leaf }); f.fire(1); f.child.emit('close', 0, null);
    const result = await f.promise;
    assert.equal(result.kind, 'cleanup-uncertain'); assert.equal(result.exitObserved, false);
    assert.equal(result.cleanupScope, 'process-tree');
  }
  const f = windowsDeadlineFixture(); f.fire(1); f.fire(5000);
  const result = await f.promise;
  assert.equal(result.kind, 'cleanup-uncertain'); assert.equal(result.exitObserved, false);
  f.child.emit('close', 0, null); assert.equal(f.closed.length, 2, 'late exit must not settle/close twice');
});

test('ordinary exit, confirmed taskkill and pre-deadline signal keep their classifications', async () => {
  const normal = windowsDeadlineFixture(); normal.child.emit('close', 3, null);
  assert.equal((await normal.promise).kind, 'exit'); assert.equal((await normal.promise).code, 3);
  const missing = windowsDeadlineFixture(); missing.child.emit('error', { code: 'ENOENT' });
  assert.equal((await missing.promise).kind, 'spawn-error'); assert.equal((await missing.promise).exitObserved, false);
  const signalled = windowsDeadlineFixture(); signalled.child.emit('close', null, 'SIGTERM');
  assert.equal((await signalled.promise).kind, 'signal');
  for (const leaf of [true, false]) {
    const f = windowsDeadlineFixture({ leaf, killResult: { status: 0 } }); f.fire(1); f.child.emit('close', 1, null);
    const result = await f.promise; assert.equal(result.kind, 'timeout'); assert.equal(result.exitObserved, true);
  }
});

test('private leaf capability depends on the unchanged no-spawn worker and pure digest closure', () => {
  for (const [name, digest] of [
    ['dependency-digest-worker.mjs', '21ed30f496b2a124770904e23212298b19418d569e0c282415f3d48d67feebad'],
    ['dependency-digest.mjs', '235e1227cad44104bffa8f159158bbb06229986e4d1ba3a0b389a71809ba9c9c'],
  ]) assert.equal(createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex'), digest,
    'Worker closure changed: re-audit no descendants before retaining the private leaf proof');
});

test('external deadline kills an actual hash worker; partial output never returns a digest', async () => {
  const f = fixture();
  try {
    const logRoot = path.join(f.owned, 'timed');
    await assert.rejects(boundedSeedDependencyDigest({ source: f.source, logRoot, timeoutMs: 1 }), /did not complete: timeout/);
    const result = JSON.parse(readFileSync(path.join(logRoot, 'process.json')));
    assert.equal(result.kind, 'timeout'); assert.equal(result.exitObserved, true); assert.ok(result.pid > 0);
    assert.equal(result.cleanupScope, 'dedicated-hash-worker');
    if (process.platform === 'win32') assert.equal(result.termination.tool, 'taskkill.exe');
    assert.throws(() => process.kill(result.pid, 0), /ESRCH/);
    await assert.rejects(boundedSeedDependencyDigest({ source: f.source, logRoot: path.join(f.owned, 'expired'), timeoutMs: 0 }), /deadline exhausted/);
  } finally { f.close(); }
});
