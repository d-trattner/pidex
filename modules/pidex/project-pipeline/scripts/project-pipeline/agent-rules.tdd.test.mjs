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
