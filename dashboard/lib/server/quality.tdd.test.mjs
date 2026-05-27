#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getQualityLatest, getQualityProjects, summarizeQualityReport } from './quality.ts';

const summary = summarizeQualityReport({
  generated_at: '2026-01-02T00:00:00Z',
  project_path: '/tmp/example',
  summary: {
    confidence: 'descriptive-only',
    plans_reviewed: ['plan-001'],
    operator_trace: {
      gap_count: 3,
      critical_missing_operators: 1,
      findings: [
        { type: 'instrumentation_missing', operator_type: 'OpQualityReview', plan_key: 'plan-001', confidence: 'probably-unlogged', severity: 'low', reason: 'missing review' },
        { type: 'operator_unobserved', operator_type: 'OpPreflight', severity: 'info' },
        { type: 'missing_operator', operator_type: 'OpGate', severity: 'high' },
      ],
    },
    rule_action_windows: [
      { rule_path: 'rules/example.md', action: 'add', owning_agent: 'pidex-critic', expected_impact_dimension: 'review-quality', expected_direction: 'improve', before_count: 7, after_count: 8, label: 'directionally-improving', before_rejections: 2, after_rejections: 1 },
    ],
    regression_detectors: [{ dimension: 'operator-trace', severity: 'high' }],
    comparability: { label: 'insufficient-data', sample_size: 1 },
  },
  _path: '/tmp/pidex/state/quality/report.json',
});
assert.equal(summary.project, 'example');
assert.equal(summary.trace_gaps, 3);
assert.equal(summary.critical_missing_operators, 1);
assert.deepEqual(summary.trace.by_type, { instrumentation_missing: 1, operator_unobserved: 1, missing_operator: 1 });
assert.deepEqual(summary.trace.by_operator, { OpQualityReview: 1, OpPreflight: 1, OpGate: 1 });
assert.equal(summary.trace.findings[0].plan_key, 'plan-001');
assert.equal(summary.rule_impact[0].rule_path, 'rules/example.md');
assert.equal(summary.rule_impact[0].confidence, 'medium');
assert.equal(summary.comparability?.label, 'insufficient-data');

const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-quality-readmodel-'));
try {
  mkdirSync(path.join(root, 'state', 'quality'), { recursive: true });
  writeFileSync(path.join(root, 'state', 'quality', 'review-state.json'), JSON.stringify({ reviewed_plans: ['plan-001', 'plan-002'], last_review_at: '2026-01-03T00:00:00Z' }), 'utf8');
  writeFileSync(path.join(root, 'state', 'quality', 'old.json'), JSON.stringify({ generated_at: '2026-01-01T00:00:00Z', project_path: '/tmp/alpha', summary: { confidence: 'medium', plans_reviewed: ['plan-000'], operator_trace: { gap_count: 0, critical_missing_operators: 0, findings: [] } } }), 'utf8');
  writeFileSync(path.join(root, 'state', 'quality', 'new.json'), JSON.stringify({ generated_at: '2026-01-02T00:00:00Z', project_path: '/tmp/alpha', summary: { confidence: 'descriptive-only', plans_reviewed: ['plan-001'], operator_trace: { gap_count: 1, critical_missing_operators: 0, findings: [{ type: 'instrumentation_missing', operator_type: 'OpQualityReview', severity: 'low' }] }, regression_detectors: [], comparability: { label: 'partially-comparable' } } }), 'utf8');
  const latest = await getQualityLatest('?project=alpha', root);
  assert.equal(latest.latest?.generated_at, '2026-01-02T00:00:00Z');
  assert.equal(latest.latest?.review_state.reviewed_plans_count, 2);
  const projects = await getQualityProjects('', root);
  assert.equal(projects.projects.length, 1);
  assert.equal(projects.projects[0].confidence, 'descriptive-only');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('quality read model tests passed');
