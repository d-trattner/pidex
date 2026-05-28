#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build_expected_observed, normalize_plan, parse_git_status_rules, select_since_last_review, summarize } from '../quality/report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pythonProbe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (pythonProbe.status !== 0) {
  console.log('python-node parity tests skipped: python3 not available');
  process.exit(0);
}
const oldCommit = '533ed2d';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-parity-'));

function gitShow(file) {
  return execFileSync('git', ['show', `${oldCommit}:${file}`], { cwd: root, encoding: 'utf8' });
}

function writeOldScript(rel, content) {
  const dest = path.join(tmp, 'old-root', rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, content, 'utf8');
  return dest;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).sort()) {
      if (['timestamp', 'generated_at', 'created_at', 'updated_at', 'last_hygiene_at', 'installed_at', 'uninstalled_at', 'operator_decisions', 'operator_decisions_by_type', 'operator_decisions_by_reason', 'valid_skips', 'expectation_corrections', 'valid_skip_count'].includes(k)) continue;
      if (String(k).startsWith('_source')) continue;
      out[k] = stable(v);
    }
    return out;
  }
  return value;
}

function runPythonReportFixture() {
  const reportPy = writeOldScript('scripts/quality/report.py', gitShow('scripts/quality/report.py'));
  const harness = path.join(tmp, 'old-root', 'scripts', 'quality', 'report_harness.py');
  writeFileSync(harness, `
import importlib.util, json, pathlib
spec = importlib.util.spec_from_file_location('report', ${JSON.stringify(reportPy)})
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
data = json.loads(${JSON.stringify(JSON.stringify(reportFixture))})
out = {
  'normalize': [mod.normalize_plan('4'), mod.normalize_plan('plan-4'), mod.normalize_plan('004-dashboard'), mod.normalize_plan('provider-limits-native')],
  'git_changes': mod.parse_git_status_rules(' M rules/pidex-qa/index.md\\n?? rules/pidex-qa/new-rule.md\\n M rules/pidex-qa/ledgered.md\\n M README.md\\n', pathlib.Path('/tmp/project'), [{'rule_path':'rules/pidex-qa/ledgered.md'}]),
  'since': mod.select_since_last_review(['plan-003','plan-002','plan-001'], {'reviewed_plans':['plan-001','plan-003']}),
  'trace': mod.build_expected_observed(data, ['plan-004','plan-005']),
  'summary': mod.summarize(data, ['plan-004','plan-005']),
}
print(json.dumps(out, sort_keys=True))
`, 'utf8');
  const cp = spawnSync('python3', [harness], { encoding: 'utf8' });
  assert.equal(cp.status, 0, cp.stderr || cp.stdout);
  return JSON.parse(cp.stdout);
}

function runNodeReportFixture() {
  return {
    normalize: [normalize_plan('4'), normalize_plan('plan-4'), normalize_plan('004-dashboard'), normalize_plan('provider-limits-native')],
    git_changes: parse_git_status_rules(' M rules/pidex-qa/index.md\n?? rules/pidex-qa/new-rule.md\n M rules/pidex-qa/ledgered.md\n M README.md\n', '/tmp/project', [{ rule_path: 'rules/pidex-qa/ledgered.md' }]),
    since: select_since_last_review(['plan-003','plan-002','plan-001'], { reviewed_plans: ['plan-001','plan-003'] }),
    trace: build_expected_observed(reportFixture, ['plan-004','plan-005']),
    summary: summarize(reportFixture, ['plan-004','plan-005']),
  };
}

const reportFixture = {
  metrics: [
    { plan: '4', timestamp: '2026-01-01T00:00:00Z', agent: 'pidex-planner', route_to: 'pidex-critic', input_tokens_estimate: 10, output_tokens_estimate: 5, cost_usd_estimate: 0.01, context_file: 'agents.output/planning.md' },
    { plan: '4', timestamp: '2026-01-01T00:01:00Z', agent: 'pidex-critic', route_to: 'pidex-implementer', agent_verdict: 'REJECTED' },
    { plan: '4', timestamp: '2026-01-01T00:02:00Z', agent: 'pidex-implementer', route_to: 'pidex-critic' },
    { plan: '4', timestamp: '2026-01-01T00:03:00Z', agent: 'pidex-critic', route_to: 'pidex-qa', gate: 'G9' },
    { plan: '5', timestamp: '2026-05-20T21:30:00Z', agent: 'pidex-qa', gate: 'none' },
  ],
  pipeline_events: [
    { plan: '4', event_type: 'pipeline_completed', timestamp: '2026-01-01T00:05:00Z' },
    { plan: '5', event_type: 'pipeline_started', timestamp: '2026-05-20T21:30:00Z' },
  ],
  orchestrator_events: [
    { operator_type: 'OpQualityReview', plan_key: 'plan-004' },
    { operator_type: 'OpPreflight', plan_key: 'plan-005', logical_decision: { task_class: 'bugfix' }, physical_action: { grill_decision_pending: true } },
    { operator_type: 'OpReview', plan_key: 'plan-004', agent: 'pidex-qa', physical_action: { verdict: 'APPROVED', finding_counts: { critical: 1 } } },
    { operator_type: 'OpUserCorrection', plan_key: 'plan-004', severity: 'medium', logical_decision: { correction_type: 'routing', summary: 'wrong next agent' } },
    { operator_type: 'OpReleaseDecision', plan_key: 'plan-004', logical_decision: { release_action: 'push-tag' }, physical_action: { release_action: 'push-tag', outcome: 'completed' } },
    { operator_type: 'OpContextPack', plan_key: 'plan-004', agent: 'pidex-qa', physical_action: { estimated_token_class: 'large', budget_warning: true, context_paths: [] } },
  ],
  rule_actions: [
    { timestamp: '2026-01-01T00:02:30Z', plan_key: 'plan-004', action: 'monitor', status: 'monitoring', rule_path: 'rules/pidex-qa/example.md', owning_agent: 'pidex-critic', approval_source: 'user', expected_impact_dimension: 'review-quality', expected_direction: 'increase' }
  ],
  routing_artifacts: [{ path: 'agents.output/x.md', role: 'planning' }],
  rules: [{ path: 'rules/pidex-qa/index.md', agent: 'pidex-qa' }],
  untracked_rule_changes: [{ path: 'rules/x.md', git_status: '??', owning_agent: 'x' }],
  pidex_root_rule_actions: [{ action: 'add', rule_path: 'rules/pidex-planner/root.md' }],
  pidex_root_untracked_rule_changes: [{ path: 'rules/pidex-planner/root-new.md', git_status: '??', owning_agent: 'pidex-planner' }],
};

function runHygiene(script, project, args = []) {
  const cp = spawnSync(script.endsWith('.py') ? 'python3' : process.execPath, [script, 'audit', '--project', project, '--output-dir', path.join(project, 'out'), '--json-only', '--stale-days', '1', ...args], { encoding: 'utf8' });
  assert.equal(cp.status, 0, cp.stderr || cp.stdout);
  const line = cp.stdout.split(/\r?\n/).find((l) => l.startsWith('PIDEX_WIKI_HYGIENE_RESULT='));
  assert.ok(line, cp.stdout);
  const result = JSON.parse(line.slice('PIDEX_WIKI_HYGIENE_RESULT='.length));
  return JSON.parse(readFileSync(result.report_json, 'utf8'));
}

function makeWikiProject(name) {
  const project = path.join(tmp, name);
  mkdirSync(path.join(project, 'wiki', 'decisions'), { recursive: true });
  mkdirSync(path.join(project, 'wiki', 'concepts'), { recursive: true });
  writeFileSync(path.join(project, 'wiki', 'index.md'), '---\ntitle: Home\nupdated: 2000-01-01\n---\n# Home\n\n[Missing](missing.md)\n[[Decision One]]\n[[concepts/Thing]]\n', 'utf8');
  writeFileSync(path.join(project, 'wiki', 'log.md'), '# Log\n', 'utf8');
  writeFileSync(path.join(project, 'wiki', 'decisions', 'decision-one.md'), '---\ntitle: Decision One\ntype: decision\nstatus: active\nupdated: 2000-01-01\n---\n# Decision One\n\n## Navigation\n\n[[../index]]\nTODO pending\n', 'utf8');
  writeFileSync(path.join(project, 'wiki', 'concepts', 'thing.md'), '---\ntitle: Thing\ntype: concept\nupdated: 2000-01-01\n---\n# Thing\n\n[[../index]]\n', 'utf8');
  writeFileSync(path.join(project, 'wiki', 'concepts', 'thing-copy.md'), '---\ntitle: Thing\ntype: concept\nupdated: 2000-01-01\n---\n# Thing\n', 'utf8');
  spawnSync('git', ['init'], { cwd: project, stdio: 'ignore' });
  return project;
}

try {
  const old = runPythonReportFixture();
  const node = runNodeReportFixture();
  assert.deepEqual(stable(node), stable(old));

  const oldHygiene = writeOldScript('scripts/wiki/hygiene.py', gitShow('scripts/wiki/hygiene.py'));
  const oldProject = makeWikiProject('old-project');
  const nodeProject = path.join(tmp, 'node-project');
  cpSync(oldProject, nodeProject, { recursive: true });
  const oldAudit = stable(runHygiene(oldHygiene, oldProject));
  const nodeAudit = stable(runHygiene(path.join(root, 'scripts/wiki/hygiene.mjs'), nodeProject));
  // Paths differ because projects are separate temp directories; compare semantic report fields.
  assert.deepEqual(nodeAudit.summary, oldAudit.summary);
  assert.deepEqual(nodeAudit.graph_conventions, oldAudit.graph_conventions);
  assert.deepEqual(nodeAudit.findings.map((f) => ({ severity: f.severity, category: f.category, file: f.file, line: f.line, recommendation: f.recommendation })), oldAudit.findings.map((f) => ({ severity: f.severity, category: f.category, file: f.file, line: f.line, recommendation: f.recommendation })));
  assert.deepEqual(nodeAudit.inventory.map((i) => ({ path: i.path, title: i.title, classification: i.classification, linked_from_count: i.linked_from_count, outgoing_links_count: i.outgoing_links_count })), oldAudit.inventory.map((i) => ({ path: i.path, title: i.title, classification: i.classification, linked_from_count: i.linked_from_count, outgoing_links_count: i.outgoing_links_count })));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('python-node parity tests passed');
