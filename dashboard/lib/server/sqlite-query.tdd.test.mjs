#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sqlite-query.mjs');

function run(args) {
  const result = spawnSync(process.execPath, ['--no-warnings', script, ...args], { encoding: 'utf8' });
  return result;
}

function testMissingDbReturnsEmptyArray() {
  const result = run([path.join(os.tmpdir(), 'pidex-missing-db.sqlite'), 'select 1', '[]']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), []);
}

function testQueryRowsAndBlobDecode() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-sqlite-query-'));
  try {
    const dbPath = path.join(dir, 'test.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec("create table rows(id integer primary key, name text, data blob); insert into rows(name, data) values ('alpha', X'6869'), ('beta', X'627965')");
    db.close();

    const result = run([dbPath, 'select name, data from rows where name = ?', JSON.stringify(['alpha'])]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout), [{ name: 'alpha', data: 'hi' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testInvalidParamsReturnError() {
  const result = run(['x.sqlite', 'select 1', '{}']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /params|invalid/);
}

testMissingDbReturnsEmptyArray();
testQueryRowsAndBlobDecode();
testInvalidParamsReturnError();
console.log('sqlite-query.mjs tests passed');
