#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'windows-audit.mjs');

function runAudit(args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function testJsonReportShape() {
  const report = JSON.parse(runAudit(['--json']));
  assert.equal(report.audit, 'pidex-windows-compatibility');
  assert.equal(report.implementation, 'node');
  assert.equal(report.read_only, true);
  assert.ok(report.environment.kind);
  assert.ok(report.commands.node.available, 'node should be available because this test runs on node');
  assert.ok(report.path_shape.repo_root);
  assert.ok(Array.isArray(report.known_unsupported_or_risky_entrypoints));
  assert.ok(Array.isArray(report.findings));
}

function testRiskyEntrypointGuidance() {
  const report = JSON.parse(runAudit(['--json']));
  const entries = new Map(report.known_unsupported_or_risky_entrypoints.map((entry) => [entry.path, entry]));
  assert.equal(entries.get('install.sh')?.status, 'linux-owned');
  assert.match(entries.get('install.sh')?.windows_guidance || '', /install\.windows\.ps1/);
  assert.equal(entries.get('dashboard/start.sh')?.status, 'linux-owned');
  assert.match(entries.get('dashboard/start.sh')?.windows_guidance || '', /start\.windows/);
}

function testTextModeContainsHeadings() {
  const output = runAudit();
  assert.match(output, /PIDEX Windows compatibility audit \(read-only\)/);
  assert.match(output, /Support summary:/);
  assert.match(output, /Commands:/);
  assert.match(output, /Findings:/);
}

function main() {
  testJsonReportShape();
  testRiskyEntrypointGuidance();
  testTextModeContainsHeadings();
  console.log('windows-audit.mjs tests passed');
}

main();
