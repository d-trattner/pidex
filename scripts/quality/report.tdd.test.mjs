#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalize_plan, build_expected_observed, parse_git_status_rules, select_since_last_review, summarize, write_markdown } from './report.mjs';

assert.equal(normalize_plan('4'), 'plan-004');
assert.equal(normalize_plan('plan-4'), 'plan-004');
assert.equal(normalize_plan('004-dashboard'), 'plan-004');
assert.equal(normalize_plan('provider-limits-native'), 'provider-limits-native');

let trace = build_expected_observed({ metrics: [{ plan: '4', timestamp: '2026-01-01T00:00:00Z', agent: 'pidex-security', route_to: 'pidex-implementer', gate: 'none', _source_path: 'x' }], orchestrator_events: [], pipeline_events: [], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 2);
assert.equal(trace.findings.some((f) => f.operator_type === 'OpGate'), false);

trace = build_expected_observed({ metrics: [{ plan: '4', timestamp: '2026-01-01T00:00:00Z', agent: 'pidex-planner', route_to: 'pidex-critic', gate: 'G9', _source_path: 'x' }, { plan: '4', timestamp: '2026-01-01T00:01:00Z', agent: 'pidex-critic', _source_path: 'x' }], orchestrator_events: [], pipeline_events: [], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 4);
assert.equal(trace.observed_required, 0);
assert.equal(trace.gap_count, 4);
assert.ok(trace.findings.some((f) => f.operator_type === 'OpGate' && f.type === 'missing_operator' && f.contract_id === 'operator.OpGate.user-gate-evidence'));

trace = build_expected_observed({ metrics: [{ plan: '4', timestamp: '2026-01-01T00:00:00Z', agent: 'pidex-uat', gate: 'G9', _source_path: 'x' }], orchestrator_events: [{ operator_type: 'OpGate', plan_key: 'plan-004', gate: 'g9' }], pipeline_events: [], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 2);
assert.equal(trace.observed_required, 1);
assert.equal(trace.findings.some((f) => f.operator_type === 'OpGate'), false);

let changes = parse_git_status_rules(' M rules/pidex-qa/index.md\n?? rules/pidex-qa/new-rule.md\n M rules/pidex-qa/ledgered.md\n M README.md\n', '/tmp/project', [{ rule_path: 'rules/pidex-qa/ledgered.md' }]);
assert.deepEqual(changes.map((c) => c.path), ['rules/pidex-qa/index.md', 'rules/pidex-qa/new-rule.md']);
assert.deepEqual(select_since_last_review(['plan-003', 'plan-002', 'plan-001'], { reviewed_plans: ['plan-001', 'plan-003'] }), ['plan-002']);

let summary = summarize({ metrics: [], pipeline_events: [], orchestrator_events: [], rule_actions: [{ plan_key: 'plan-004', action: 'add', status: 'monitoring', rule_path: 'rules/pidex-qa/example.md', owning_agent: 'pidex-qa', approval_source: 'user', expected_impact_dimension: 'gate-clarity', expected_direction: 'increase' }], routing_artifacts: [], rules: [], untracked_rule_changes: [], pidex_root_rule_actions: [], pidex_root_untracked_rule_changes: [] }, ['plan-004']);
assert.equal(summary.operator_trace.observed_operator_events.OpRuleAction, 1);
assert.equal(summary.rule_actions_as_operators[0].operator_type, 'OpRuleAction');

trace = build_expected_observed({ metrics: [], pipeline_events: [{ plan: '4', event_type: 'pipeline_completed', _source_path: 'x' }], orchestrator_events: [], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 1);
assert.ok(trace.findings.some((f) => f.operator_type === 'OpQualityReview' && f.type === 'instrumentation_missing' && f.contract_id === 'operator.OpQualityReview.terminal-pdq'));

trace = build_expected_observed({ metrics: [], pipeline_events: [{ plan: '4', event_type: 'pipeline_completed', _source_path: 'x' }], orchestrator_events: [{ operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'manual_evidence', target_operator: 'OpQualityReview', reason: 'terminal-event-backfill', approved_by: 'operator' }], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 1);
assert.equal(trace.observed_required, 1);
assert.equal(trace.gap_count, 0);
assert.equal(trace.valid_skip_count, 1);
assert.ok(trace.findings.some((f) => f.operator_type === 'OpQualityReview' && f.type === 'valid_skip'));

summary = summarize({ metrics: [], pipeline_events: [], orchestrator_events: [{ operator_type: 'OpUserCorrection', plan_key: 'plan-004', severity: 'medium', logical_decision: { correction_type: 'routing', summary: 'wrong next agent' } }, { operator_type: 'OpReleaseDecision', plan_key: 'plan-004', source_artifact: 'x', reason: 'approved', logical_decision: { release_action: 'push-tag' }, physical_action: { release_action: 'push-tag', outcome: 'completed' } }, { operator_type: 'OpContextPack', plan_key: 'plan-004', agent: 'pidex-qa', physical_action: { estimated_token_class: 'large', budget_warning: true } }, { operator_type: 'OpPreflight', plan_key: 'unknown-plan', logical_decision: { task_class: 'bugfix' }, physical_action: { grill_decision_pending: true } }, { operator_type: 'OpReview', plan_key: 'plan-004', agent: 'pidex-qa', physical_action: { verdict: 'APPROVED', finding_counts: { critical: 1 } } }], rule_actions: [], routing_artifacts: [], rules: [], untracked_rule_changes: [], pidex_root_rule_actions: [], pidex_root_untracked_rule_changes: [] }, ['plan-004']);
assert.deepEqual(summary.user_corrections_by_type, { routing: 1 });
assert.deepEqual(summary.user_corrections_by_severity, { medium: 1 });
assert.deepEqual(summary.release_decisions_by_action, { 'push-tag': 1 });
assert.deepEqual(summary.release_decisions_by_outcome, { completed: 1 });
assert.deepEqual(summary.context_packs_by_size, { large: 1 });
assert.equal(summary.context_pack_budget_warnings, 1);
assert.deepEqual(summary.preflights_by_task_class, { bugfix: 1 });
assert.equal(summary.preflight_grill_pending, 1);
assert.deepEqual(summary.reviews_by_agent, { 'pidex-qa': 1 });
assert.deepEqual(summary.reviews_by_verdict, { APPROVED: 1 });
assert.deepEqual(summary.review_finding_counts, { critical: 1 });

summary = summarize({ metrics: [], pipeline_events: [], orchestrator_events: [{ operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'skip_step', target_operator: 'OpPreflight', reason: 'continuation-existing-plan', approved_by: 'operator' }, { operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'expectation_correction', target_operator: 'OpQualityReview', reason: 'expectation-wrong', approved_by: 'operator', proposed_expectation: { required_if: 'auto_pdq_enabled' } }], rule_actions: [], routing_artifacts: [], rules: [], untracked_rule_changes: [], pidex_root_rule_actions: [], pidex_root_untracked_rule_changes: [] }, ['plan-004']);
assert.equal(summary.operator_decisions.length, 2);
assert.deepEqual(summary.operator_decisions_by_type, { skip_step: 1, expectation_correction: 1 });
assert.deepEqual(summary.operator_decisions_by_reason, { 'continuation-existing-plan': 1, 'expectation-wrong': 1 });
assert.equal(summary.valid_skips.length, 1);
assert.equal(summary.expectation_corrections.length, 1);

trace = build_expected_observed({ metrics: [{ plan: '4', timestamp: '2026-05-20T21:30:00Z', agent: 'pidex-qa', _source_path: 'x' }], pipeline_events: [{ plan: '4', event_type: 'pipeline_started', timestamp: '2026-05-20T21:30:00Z' }], orchestrator_events: [{ operator_type: 'OpPreflight', plan_key: 'unknown-plan' }, { operator_type: 'OpSpawn', plan_key: 'plan-004', agent: 'pidex-qa' }, { operator_type: 'OpContextPack', plan_key: 'plan-004', agent: 'pidex-qa' }, { operator_type: 'OpReview', plan_key: 'plan-004', agent: 'pidex-qa' }], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 4);
assert.equal(trace.observed_required, 3);
assert.equal(trace.critical_missing_operators, 0);
assert.ok(trace.findings.some((f) => f.operator_type === 'OpPreflight' && f.type === 'operator_unobserved' && f.contract_id === 'operator.OpPreflight.finalized-preflight'));

trace = build_expected_observed({ metrics: [{ plan: '4', timestamp: '2026-05-20T21:30:00Z', agent: 'pidex-qa', _source_path: 'x' }], pipeline_events: [{ plan: '4', event_type: 'pipeline_started', timestamp: '2026-05-20T21:30:00Z' }], orchestrator_events: [{ operator_type: 'OpPreflight', plan_key: 'plan-004' }, { operator_type: 'OpSpawn', plan_key: 'plan-004', agent: 'pidex-qa' }, { operator_type: 'OpContextPack', plan_key: 'plan-004', agent: 'pidex-qa' }, { operator_type: 'OpReview', plan_key: 'plan-004', agent: 'pidex-qa' }], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 4);
assert.equal(trace.observed_required, 4);
assert.equal(trace.findings.length, 0);

trace = build_expected_observed({ metrics: [{ plan: '4', timestamp: '2026-05-20T21:30:00Z', agent: 'pidex-qa', gate: 'G9', route_to: 'pidex-devops', _source_path: 'x' }], pipeline_events: [], orchestrator_events: [{ operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'manual_evidence', target_operator: 'OpReview', target_step: 'pidex-qa', reason: 'manual-review-done-outside-pidex', approved_by: 'operator' }, { operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'skip_step', target_operator: 'OpGate', target_step: 'G9', reason: 'no-ui-change', approved_by: 'operator' }, { operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'override_route', target_operator: 'OpRoute', target_step: 'pidex-devops', reason: 'operator-approved-risk', approved_by: 'operator' }, { operator_type: 'OpSpawn', plan_key: 'plan-004', agent: 'pidex-qa' }, { operator_type: 'OpContextPack', plan_key: 'plan-004', agent: 'pidex-qa' }], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 5);
assert.equal(trace.observed_required, 5);
assert.equal(trace.gap_count, 0);
assert.equal(trace.valid_skip_count, 3);
assert.ok(trace.findings.some((f) => f.operator_type === 'OpReview' && f.type === 'valid_skip' && f.agent === 'pidex-qa'));
assert.ok(trace.findings.some((f) => f.operator_type === 'OpGate' && f.type === 'valid_skip' && f.gate === 'G9'));
assert.ok(trace.findings.some((f) => f.operator_type === 'OpRoute' && f.type === 'valid_skip' && f.expected_route_to === 'pidex-devops'));

trace = build_expected_observed({ metrics: [{ plan: '4', timestamp: '2026-05-20T21:30:00Z', agent: 'pidex-qa', _source_path: 'x' }], pipeline_events: [], orchestrator_events: [{ operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'manual_evidence', target_operator: 'OpSpawn', target_step: 'pidex-qa', reason: 'provider-quota-limited', approved_by: 'operator' }, { operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'manual_evidence', target_operator: 'OpContextPack', target_step: 'pidex-qa', reason: 'already-covered', approved_by: 'operator' }, { operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'manual_evidence', target_operator: 'OpReview', target_step: 'pidex-qa', reason: 'manual-review-done-outside-pidex', approved_by: 'operator' }], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 3);
assert.equal(trace.observed_required, 3);
assert.equal(trace.gap_count, 0);
assert.equal(trace.valid_skip_count, 3);

trace = build_expected_observed({ metrics: [], pipeline_events: [{ plan: '4', event_type: 'pipeline_started', timestamp: '2026-05-20T21:30:00Z' }], orchestrator_events: [{ operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'skip_step', target_operator: 'OpPreflight', reason: 'continuation-existing-plan', approved_by: 'operator' }], rule_actions: [] }, ['plan-004']);
assert.equal(trace.expected_required, 1);
assert.equal(trace.observed_required, 1);
assert.equal(trace.gap_count, 0);
assert.equal(trace.valid_skip_count, 1);

summary = summarize({ metrics: [{ plan: '4', timestamp: '2026-01-01T00:00:00Z', agent: 'pidex-planner', route_to: 'pidex-critic' }, { plan: '4', timestamp: '2026-01-01T00:01:00Z', agent: 'pidex-critic', route_to: 'pidex-implementer', agent_verdict: 'REJECTED' }, { plan: '4', timestamp: '2026-01-01T00:02:00Z', agent: 'pidex-implementer', route_to: 'pidex-critic' }, { plan: '4', timestamp: '2026-01-01T00:03:00Z', agent: 'pidex-critic', route_to: 'pidex-qa', gate: 'G9' }, { plan: '5', timestamp: '2026-01-01T00:04:00Z', agent: 'pidex-planner' }], pipeline_events: [{ plan: '4', event_type: 'pipeline_completed', timestamp: '2026-01-01T00:05:00Z' }], orchestrator_events: [{ operator_type: 'OpQualityReview', plan_key: 'plan-004' }], rule_actions: [{ timestamp: '2026-01-01T00:02:30Z', action: 'monitor', owning_agent: 'pidex-critic', expected_impact_dimension: 'review-quality', expected_direction: 'increase' }], routing_artifacts: [], rules: [], untracked_rule_changes: [{ path: 'rules/x.md' }], pidex_root_rule_actions: [], pidex_root_untracked_rule_changes: [] }, ['plan-004', 'plan-005']);
assert.equal(summary.coordination_specs['plan-004'].topology, 'review-loop');
assert.equal(summary.comparability.label, 'insufficient-data');
assert.equal(summary.rule_action_windows[0].label, 'insufficient-data');
assert.ok(summary.regression_detectors.some((r) => r.dimension === 'rule-lifecycle'));

const td = mkdtempSync(path.join(os.tmpdir(), 'pidex-report-md-'));
try { const out = path.join(td, 'report.md'); write_markdown({ generated_at: 'now', project_path: '/tmp/project', summary: { ...summary, recent_rule_actions: [{ action: 'monitor', status: 'monitoring', expected_impact_dimension: 'routing-correctness' }], untracked_rule_changes: [{ path: 'rules/pidex-qa/new.md', git_status: '??' }], pidex_root_untracked_rule_changes: [{ path: 'rules/pidex-planner/root-new.md', git_status: '??' }] } }, out); const text = readFileSync(out, 'utf8'); for (const needle of ['PIDEX Quality Report', 'Expected-vs-Observed Operator Trace', 'Rule-Action Ledger', 'Untracked Rule Changes', 'PIDEX Root Rule Hygiene', 'rules/pidex-qa/new.md', 'rules/pidex-planner/root-new.md', 'routing-correctness']) assert.match(text, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); } finally { rmSync(td, { recursive: true, force: true }); }
console.log('quality report.mjs tests passed');
