import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build_expected_observed } from './report.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const report = path.join(root, 'scripts/quality/report.mjs');
const metric = (run_dir, extra = {}) => ({ project: '/fixture/project', plan: '051', agent: 'pidex-qa', timestamp: '2026-09-07T12:00:00Z', run_dir, ...extra });
const events = (run_dir, extra = {}) => ['OpSpawn', 'OpContextPack', 'OpReview'].map(operator_type => ({ project_path: '/fixture/project', plan_key: 'plan-051', agent: 'pidex-qa', run_dir, operator_type, ...extra }));
const trace = (metrics, orchestrator_events) => build_expected_observed({ metrics, orchestrator_events }, ['plan-051']);

test('PDQ CLI reads selected state, saved mode and default JSON output from one resolver', t => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-pdq-state-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const project = path.join(tmp, 'project space'); mkdirSync(project);
  const canonical = path.join(tmp, 'canonical space'); const legacy = path.join(tmp, 'legacy space');
  for (const [state, plan] of [[canonical, '51'], [legacy, '52']]) {
    for (const dir of ['metrics', 'pipeline-events', 'orchestrator-events', 'rule-actions', 'project-pipeline-modes']) mkdirSync(path.join(state, dir), { recursive: true });
    writeFileSync(path.join(state, 'metrics/fixture.jsonl'), JSON.stringify({ project, plan, agent: 'pidex-qa' }) + '\n');
    writeFileSync(path.join(state, 'pipeline-events/fixture.jsonl'), JSON.stringify({ project_path: project, plan, event_type: 'pipeline_completed' }) + '\n');
    writeFileSync(path.join(state, 'orchestrator-events/fixture.jsonl'), JSON.stringify({ project_path: project, plan_key: `plan-0${plan}`, operator_type: 'OpQualityReview' }) + '\n');
    writeFileSync(path.join(state, 'rule-actions/fixture.jsonl'), JSON.stringify({ project_path: project, action: 'monitor' }) + '\n');
    writeFileSync(path.join(state, 'project-pipeline-modes/fixture.json'), JSON.stringify({ project_root: project, mode: 'project-pipeline' }));
  }
  for (const [override, expected, plan] of [[canonical, canonical, 'plan-051'], ['', legacy, 'plan-052']]) {
    const md = path.join(tmp, 'explicit.md');
    const child = spawnSync(process.execPath, [report, '--project', project, '--md-out', md], { encoding: 'utf8', env: { ...process.env, PIDEX_STATE_DIR: override, RUNNING_PI_STATE_DIR: legacy } });
    assert.equal(child.status, 0, child.stderr);
    const output = JSON.parse(child.stdout);
    assert.equal(path.dirname(output.json), path.join(expected, 'quality'));
    assert.equal(output.markdown, md);
    const summary = JSON.parse(readFileSync(output.json, 'utf8')).summary;
    assert.deepEqual(summary.plans_reviewed, [plan]);
    assert.equal(summary.sample_size.pipeline_events, 1);
    assert.equal(summary.sample_size.orchestrator_events, 1);
    assert.equal(summary.sample_size.rule_actions, 1);
    assert.equal(summary.mode_coverage.saved_project_mode, 'project-pipeline');
  }
  const explicit = path.join(tmp, 'explicit.json');
  const child = spawnSync(process.execPath, [report, '--project', project, '--json-out', explicit, '--md-out', path.join(tmp, 'other.md')], { encoding: 'utf8', env: { ...process.env, PIDEX_STATE_DIR: canonical, RUNNING_PI_STATE_DIR: '' } });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).json, explicit);
  const decision = spawnSync(process.execPath, [path.join(root, 'scripts/quality/operator-decisions.mjs'), 'record', '--project', project, '--plan', '051', '--decision', 'manual_evidence', '--target-operator', 'OpReview', '--target-step', 'pidex-qa', '--reason', 'manual-review-done-outside-pidex', '--extra-json', JSON.stringify({ agent: 'pidex-qa', run_dir: 'known-run', project_mode: 'host-direct' })], { encoding: 'utf8', env: { ...process.env, PIDEX_STATE_DIR: canonical, RUNNING_PI_STATE_DIR: legacy } });
  assert.equal(decision.status, 0, decision.stderr);
  const decisionPath = JSON.parse(decision.stdout).path;
  assert.ok(decisionPath.startsWith(path.join(canonical, 'orchestrator-events') + path.sep));
  const stored = JSON.parse(readFileSync(decisionPath, 'utf8').trim());
  assert.equal(stored.run_dir, 'known-run'); assert.equal(stored.agent, 'pidex-qa');
});

test('PDQ import without override uses default state without running the CLI', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `const {STATE,ROOT}=await import(${JSON.stringify(new URL('./report.mjs', import.meta.url).href)}); console.log(JSON.stringify({STATE,ROOT}));`], { encoding: 'utf8', env: { ...process.env, PIDEX_STATE_DIR: '', RUNNING_PI_STATE_DIR: '' } });
  assert.equal(child.status, 0, child.stderr);
  const out = JSON.parse(child.stdout); assert.equal(out.STATE, path.join(out.ROOT, 'state'));
});

test('one event set cannot cover two distinct attempts of one agent', () => {
  const out = trace([metric('run-a'), metric('run-b')], events('run-a'));
  assert.equal(out.expected_required, 6); assert.equal(out.observed_required, 3); assert.equal(out.gap_count, 3);
});
test('both attempts correctly evidenced, including retry/resume/lane identities', () => {
  for (const mode of ['host-direct', 'hardened-pipeline', 'project-pipeline']) {
    const rows = ['primary', 'retry', 'resume', 'secondary'].map(id => metric(id, { project_mode: mode }));
    const out = trace(rows, rows.flatMap(row => events(row.run_dir, { project_mode: mode })));
    assert.equal(out.observed_required, 12); assert.equal(out.gap_count, 0);
  }
});
test('legacy identity absence never proves run completeness', () => {
  assert.equal(trace([metric(undefined)], events(undefined)).observed_required, 0);
});
test('identity does not cross project, plan, role or execution-mode scope', () => {
  for (const extra of [{ project_path: '/other' }, { plan_key: 'plan-052' }, { agent: 'pidex-security' }, { project_mode: 'project-pipeline' }]) {
    assert.equal(trace([metric('a', { project_mode: 'host-direct' })], events('a', extra)).observed_required, 0);
  }
});
test('identical metric/event duplicates collapse, conflicting identities stay unproven', () => {
  const m = metric('a'); const ev = events('a');
  const repeated = trace([m, { ...m }], [...ev, ...ev.map(e => ({ ...e, _source_line: 99 }))]);
  assert.equal(repeated.expected_required, 3); assert.equal(repeated.observed_required, 3);
  const conflict = trace([m], [...ev, { ...ev[2], physical_action: { verdict: 'CHANGES_REQUESTED' } }]);
  assert.equal(conflict.observed_required, 2); assert.equal(conflict.gap_count, 1);
  assert.match(conflict.findings[0].reason, /ambiguous/);
  assert.equal(trace([m, { ...m, exit_code: 1 }], ev).observed_required, 0);
});
test('route and gate evidence binds exact role, execution and target', () => {
  const m = metric('a', { route_to: 'pidex-devops', gate: 'G9' });
  const extra = [
    { ...events('a')[0], operator_type: 'OpRoute', logical_decision: { route_to: 'pidex-implementer' } },
    { ...events('a')[0], operator_type: 'OpGate', gate: 'G4' },
  ];
  assert.equal(trace([m], [...events('a'), ...extra]).observed_required, 3);
  extra[0].logical_decision.route_to = 'pidex-devops'; extra[1].gate = 'g9';
  assert.equal(trace([m], [...events('a'), ...extra]).observed_required, 5);
});
test('manual decisions require run scope and cannot multiply over independent steps', () => {
  const decision = { project_path: '/fixture/project', plan_key: 'plan-051', agent: 'pidex-qa', operator_type: 'OpDecision', target_operator: 'OpReview', target_step: 'pidex-qa', reason: 'manual-review-done-outside-pidex', decision_type: 'manual_evidence', approved_by: 'operator' };
  assert.equal(trace([metric('a'), metric('b')], [decision]).observed_required, 0);
  assert.equal(trace([metric('a'), metric('b')], [{ ...decision, run_dir: 'a' }]).observed_required, 1);
});
