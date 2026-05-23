#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts/provider-limits/probe.mjs');

function run(args = [], cwd = root) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

// Use the real repo paths for a non-mutating latest smoke. It may write latest.json
// under PIDEX state, matching the legacy helper behavior.
const latest = run(['latest']);
assert.ok(Array.isArray(latest.profiles));
assert.ok(Array.isArray(latest.records));
assert.equal('recommended_profile' in latest, false);

// Validate use rejects unknown profiles without relying on network.
const bad = spawnSync(process.execPath, [script, 'use', '__missing_profile__'], { encoding: 'utf8', cwd: root });
assert.notEqual(bad.status, 0);
assert.match(bad.stderr, /unknown profile/);

console.log('provider-limits probe.mjs tests passed');
