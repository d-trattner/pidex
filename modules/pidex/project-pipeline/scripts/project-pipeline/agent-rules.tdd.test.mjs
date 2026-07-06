import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.');

function context(agent, phase, extra = []) {
  return execFileSync(process.execPath, ['scripts/modules/context.mjs', '--pidex-root', root, '--agent', agent, '--phase', phase, '--project', root, ...extra], { cwd: root, encoding: 'utf8' });
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
