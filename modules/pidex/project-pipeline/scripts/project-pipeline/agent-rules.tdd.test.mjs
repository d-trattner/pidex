import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.');

function context(agent, phase, extra = []) {
  return execFileSync(process.execPath, ['scripts/modules/context.mjs', '--pidex-root', root, '--agent', agent, '--phase', phase, '--project', root, ...extra], { cwd: root, encoding: 'utf8' });
}

function renderedRules(agent, phase) {
  return execFileSync(process.execPath, ['scripts/modules/render-rules.mjs', '--pidex-root', root, '--agent', agent, '--phase', phase, '--project', root, '--mode', 'project-pipeline'], { cwd: root, encoding: 'utf8' });
}

test('Project Pipeline browser-smoke module rules validate in real manifest', () => {
  const out = execFileSync(process.execPath, ['scripts/modules/validate.mjs', '--project', root], { cwd: root, encoding: 'utf8' });
  assert.equal(JSON.parse(out).ok, true);
});

test('Project Pipeline QA browser-smoke rules appear only for project-pipeline mode', () => {
  const noMode = context('pidex-qa', 'qa');
  assert.doesNotMatch(noMode, /pidex\.project-pipeline\.browser-smoke\.qa-request/);

  const withMode = context('pidex-qa', 'qa', ['--mode', 'project-pipeline']);
  assert.match(withMode, /## Module rules for this phase/);
  assert.match(withMode, /pidex\.project-pipeline\.browser-smoke\.qa-request/);
  assert.match(withMode, /pidex\.project-pipeline\.browser-smoke\.qa-verdict/);
  assert.match(withMode, /source: rules\/pidex-qa\/browser-smoke-request\.md/);
  assert.match(withMode, /mode=project-pipeline/);
  assert.match(withMode, /capability=project-pipeline\.browser-smoke/);
  assert.doesNotMatch(withMode, /# Project Pipeline browser-smoke request rules for QA/);
  assert.doesNotMatch(withMode, /browser-smoke-bridge\.mjs/);
});

test('Project Pipeline browser-smoke request rules render canonical request schema', () => {
  const qa = renderedRules('pidex-qa', 'qa');
  assert.match(qa, /"schema": 1/);
  assert.match(qa, /"requester": "pidex-qa"/);
  assert.match(qa, /"project_id": "<canonical Project Pipeline registry project_id from the phase prompt>"/);
  assert.match(qa, /MUST exactly match the canonical Project Pipeline registry project_id shown in the phase prompt/);
  assert.match(qa, /"preview": \{/);
  assert.match(qa, /"managed": true/);
  assert.match(qa, /"contains": "<expected visible body text>"/);
  assert.match(qa, /"exists": "\.status-card"/);
  assert.match(qa, /"type": "url"/);
  assert.match(qa, /"path_contains": "\/"/);
  assert.match(qa, /Use `path_contains` or `path_equals` for `url` checks/);
  assert.match(qa, /"errors": "none"/);
  assert.match(qa, /Do not invent alternate schema keys/);
  assert.match(qa, /do NOT use `request_type`, `project`, `expected`, `expected_text`, `selector`, or `level`/);

  const uat = renderedRules('pidex-uat', 'uat');
  assert.match(uat, /"requester": "pidex-uat"/);
  assert.match(uat, /"project_id": "<canonical Project Pipeline registry project_id from the phase prompt>"/);
  assert.match(uat, /Do not derive it from the app name, folder name, package name/);
  assert.match(uat, /"exists": "\.status-card"/);
  assert.match(uat, /"type": "url"/);
  assert.match(uat, /"path_contains": "\/"/);
  assert.match(uat, /Use `path_contains` or `path_equals` for `url` checks/);
  assert.match(uat, /"errors": "none"/);
  assert.match(uat, /Do not invent alternate schema keys/);
  assert.match(uat, /do NOT use `request_type`, `project`, `expected`, `expected_text`, `selector`, or `level`/);
});

test('Project Pipeline browser-smoke schema2 consumer rules preserve schema1 and constrain rich evidence', () => {
  for (const [agent, phase, requester] of [['pidex-qa', 'qa', 'pidex-qa'], ['pidex-uat', 'uat', 'pidex-uat']]) {
    const rules = renderedRules(agent, phase);
    assert.match(rules, /Schema 1 remains available for simple checks/);
    assert.match(rules, /MUST use schema 2 when acceptance needs rich acceptance such as Weborder Plan036 viewports, interactions, or layout assertions/);
    assert.doesNotMatch(rules, /Plan056/);
    assert.match(rules, /Canonical closed schema 2 template/);
    assert.match(rules, new RegExp(`"schema": 2[\\s\\S]*?"requester": "${requester}"`));
    assert.match(rules, /"id": "desktop-1280"[\s\S]*?"width": 1280[\s\S]*?"height": 800/);
    assert.match(rules, /"id": "desktop-1440"[\s\S]*?"width": 1440[\s\S]*?"height": 900/);
    for (const operation of ['selector_present', 'auth_state', 'hover', 'focus', 'keyboard', 'scroll_into_view', 'aria_describedby', 'dimension', 'bounding_box', 'console']) assert.match(rules, new RegExp(`"type": "${operation}"`));
    assert.match(rules, /Actions precede checks; separate viewport states may cover hover and keyboard\/focus/);
    assert.match(rules, /Derive safe selectors and numeric bounds from acceptance and project evidence; never invent URL, credentials, JavaScript, or project specification/);
    assert.match(rules, /No sandbox browser or install fallback/);
    const template = rules.match(/Canonical closed schema 2 template:\n\n```json\n([\s\S]*?)\n```/)[1];
    const schema2 = JSON.parse(template);
    assert.deepEqual(Object.keys(schema2).sort(), ['created_at', 'phase_run_id', 'preview', 'project_id', 'request_id', 'requester', 'schema', 'timeout_ms', 'viewports']);
    assert.equal(schema2.viewports.every((viewport) => JSON.stringify(Object.keys(viewport).sort()) === JSON.stringify(['actions', 'capture', 'checks', 'height', 'id', 'preconditions', 'route', 'width'])), true);
    assert.deepEqual(schema2.viewports.map((viewport) => viewport.route), ['/safe-route-from-acceptance', '/safe-route-from-acceptance']);
    assert.deepEqual(new Set(schema2.viewports.flatMap((viewport) => [...viewport.preconditions, ...viewport.actions, ...viewport.checks]).map((operation) => operation.type)), new Set(['selector_present', 'auth_state', 'hover', 'focus', 'keyboard', 'scroll_into_view', 'aria_describedby', 'dimension', 'bounding_box', 'console']));
    assert.doesNotMatch(template, /"url"|credentials|javascript|install|project specification/i);
  }
});

test('Project Pipeline browser-smoke schema2 verdict rules stop non-feature states and require exact routes', () => {
  for (const [agent, phase, output] of [['pidex-qa', 'qa', 'agents.output/qa/browser-smoke-verdict.md'], ['pidex-uat', 'uat', 'agents.output/uat/browser-smoke-verdict.md']]) {
    const rules = renderedRules(agent, phase);
    assert.match(rules, /Schema 2 `BLOCKED_INFRA`, `AUTH_STATE_MISMATCH`, `PRECONDITION_FAILED`, and `REQUEST_UNSUPPORTED` stop upstream/);
    assert.match(rules, /Do not interpret schema 2 non-feature statuses as feature verdicts/);
    assert.match(rules, /Schema 2 `PASS` MUST finish with `route_to: orchestrator`/);
    assert.match(rules, /Schema 2 `FAILED_FEATURE` MUST finish with `route_to: pidex-implementer`/);
    assert.match(rules, new RegExp(`context_file: ${output.replace('.', '\\.')}`));
    assert.doesNotMatch(rules, /proceed with limitations/i);
  }
});

test('Project Pipeline browser-smoke rules are scoped by agent and phase', () => {
  const qa = context('pidex-qa', 'qa', ['--mode', 'project-pipeline']);
  assert.doesNotMatch(qa, /devops-reachability/);
  assert.doesNotMatch(qa, /uat-request/);

  const uat = context('pidex-uat', 'uat', ['--mode', 'project-pipeline']);
  assert.match(uat, /pidex\.project-pipeline\.browser-smoke\.uat-request/);
  assert.match(uat, /pidex\.project-pipeline\.browser-smoke\.uat-verdict/);
  assert.doesNotMatch(uat, /qa-request/);

  const devops = context('pidex-devops', 'devops', ['--mode', 'project-pipeline']);
  assert.match(devops, /pidex\.project-pipeline\.browser-smoke\.devops-reachability/);
  assert.doesNotMatch(devops, /qa-request/);
  assert.doesNotMatch(devops, /uat-request/);
});
