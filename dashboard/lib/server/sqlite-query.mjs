#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function fail(message) {
  process.stdout.write(JSON.stringify({ error: message }));
  process.exit(1);
}

if (process.argv.length !== 5) {
  fail('usage: sqlite-query.mjs <db-path> <sql> <params-json>');
}

const [, , dbPath, sql, paramsJson] = process.argv;
let params;
try {
  params = JSON.parse(paramsJson);
  if (!Array.isArray(params)) fail('params must be JSON array');
} catch {
  fail('invalid params json');
}

if (!existsSync(dbPath)) {
  process.stdout.write(JSON.stringify([]));
  process.exit(0);
}

function normalizeValue(value) {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }
  return value;
}

try {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params).map((row) => {
      const fixed = {};
      for (const [key, value] of Object.entries(row)) {
        fixed[key] = normalizeValue(value);
      }
      return fixed;
    });
    process.stdout.write(JSON.stringify(rows));
  } finally {
    db.close();
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
