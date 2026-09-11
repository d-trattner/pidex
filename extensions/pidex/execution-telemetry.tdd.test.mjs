import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build_expected_observed } from '../../scripts/quality/report.mjs';

const temporary = mkdtempSync(path.join(os.tmpdir(), 'pidex-execution-telemetry-'));
process.env.PIDEX_STATE_DIR = temporary;
process.env.PIDEX_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { recordAgentMetric, recordOperatorEvents } = await import('./index.ts');
const rows = file => readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));

test('actual host telemetry producers share run_dir across all run-specific operators', t => {
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  const result = runDir => ({ runDir, agent: 'pidex-qa', exitCode: 0, stderr: '', finalText: '<!-- ROUTING\nroute_to: pidex-devops\ncontext_file: agents.output/qa/051.md\nverdict: APPROVED\n-->' });
  const first = result(path.join(temporary, 'run-a'));
  const metricFile = recordAgentMetric(first, project, 'Plan 051');
  const eventFile = recordOperatorEvents(first, project, 'Plan 051');
  const second = result(path.join(temporary, 'run-b'));
  recordAgentMetric(second, project, 'Plan 051');
  const firstEvents = rows(eventFile);
  assert.deepEqual(firstEvents.map(row => row.operator_type), ['OpContextPack', 'OpSpawn', 'OpReview', 'OpRoute']);
  assert.ok(firstEvents.every(row => row.run_dir === first.runDir));
  let trace = build_expected_observed({ metrics: rows(metricFile), orchestrator_events: firstEvents }, ['plan-051']);
  assert.equal(trace.expected_required, 8); assert.equal(trace.observed_required, 4);
  recordOperatorEvents(second, project, 'Plan 051');
  trace = build_expected_observed({ metrics: rows(metricFile), orchestrator_events: rows(eventFile) }, ['plan-051']);
  assert.equal(trace.observed_required, 8); assert.equal(trace.gap_count, 0);
});
