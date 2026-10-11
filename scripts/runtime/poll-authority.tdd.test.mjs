import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { recordPipelineEvent } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';
import { canonicalProjectIdentity, projectPlanSelectionLock } from '../../modules/pidex/analysis-metrics-history/lib/project-key.mjs';
import { pollReviewAuthority } from './test-support/poll-review-authority.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-host-recovery-busy-'));
  const project = path.join(root, 'project'); fs.mkdirSync(project);
  const stateDir = path.join(root, 'state');
  const authority = { project, stateDir, planId: 'plan-003' };
  recordPipelineEvent({ project, stateDir, plan: 'plan-003', pipelineId: 'busy-proof', event: 'pipeline_started' });
  const lock = projectPlanSelectionLock(stateDir, canonicalProjectIdentity(project).projectKey, 'plan-003');
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  return {root, authority, lock};
}

async function holder(t, f) {
  const driver = path.join(f.root, 'holder.mjs');
  fs.writeFileSync(driver, `import {reserveReviewStartAsync} from ${JSON.stringify(new URL('../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs', import.meta.url).href)};
const result = await reserveReviewStartAsync({...${JSON.stringify(f.authority)}, pipelineId:'busy-proof', identity:{runFamilyId:'busy-proof',planId:'plan-003',reviewGate:'security',reviewMode:'initial',attemptId:'busy-attempt'},start(accepted){process.once('message', message => {if(message.phase !== 'release') throw new Error('unexpected parent message');accepted();});process.send({phase:'held',pid:process.pid});return {};}});
process.send({phase:'released',result});process.disconnect();`);
  const child = fork(driver, [], {stdio:['ignore','pipe','pipe','ipc'], execArgv:[]});
  let stderr = ''; child.stderr.on('data', b => { stderr += b.toString(); }); child.stdout.resume();
  const closed = once(child, 'close');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await closed; });
  const [ready] = await once(child, 'message');
  assert.equal(ready.phase, 'held', stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.lock, 'owner.json'), 'utf8')).pid, child.pid);
  return {child, closed};
}

// Real cross-process start identities require Linux /proc; never substitute an
// opaque owner or weaken dead-owner proof on unsupported platforms.
test('poll survives real live async-start lock >1s, then reads accepted authority', {skip: process.platform !== 'linux', timeout:12000}, async t => {
  const deadline = Date.now() + 12000;
  const f = fixture(t); const h = await holder(t, f);
  // No timer can release this lock while the synchronous resolver is waiting.
  assert.equal(pollReviewAuthority(f.authority), null);
  assert.equal(h.child.exitCode, null);
  h.child.send({phase:'release'});
  let accepted;
  while (Date.now() < deadline) {
    accepted = pollReviewAuthority(f.authority)?.rows;
    if (accepted) break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.ok(accepted, 'accepted authority within existing 12s test deadline');
  const [code] = await h.closed; assert.equal(code, 0);
  assert.equal(accepted.filter(r => r.event_type === 'spawn_accepted').length, 1);
  assert.equal(accepted.findLast(r => r.event_type === 'spawn_accepted').metadata.attemptId, 'busy-attempt');
});

test('dead critical-section owner remains UNCERTAIN, lock never taken over', {skip: process.platform !== 'linux', timeout:12000}, async t => {
  const f = fixture(t); const h = await holder(t, f);
  const before = fs.readFileSync(path.join(f.lock, 'owner.json'), 'utf8');
  h.child.kill('SIGKILL'); await h.closed;
  assert.throws(() => pollReviewAuthority(f.authority), /REVIEW_SELECTION_LOCK_UNCERTAIN/);
  assert.equal(fs.readFileSync(path.join(f.lock, 'owner.json'), 'utf8'), before);
});

for (const [name, content] of [['partial JSON', '{'], ['empty writer window', ''], ['invalid owner', '{}']]) {
  test(`${name} remains UNCERTAIN without changing owner`, t => {
    const f = fixture(t); fs.mkdirSync(f.lock);
    fs.writeFileSync(path.join(f.lock, 'owner.json'), content);
    assert.throws(() => pollReviewAuthority(f.authority), /REVIEW_SELECTION_LOCK_UNCERTAIN/);
    assert.equal(fs.readFileSync(path.join(f.lock, 'owner.json'), 'utf8'), content);
  });
}

test('missing owner remains UNCERTAIN after existing lock deadline', {timeout:12000}, t => {
  const f = fixture(t); fs.mkdirSync(f.lock);
  assert.throws(() => pollReviewAuthority(f.authority), /REVIEW_SELECTION_LOCK_UNCERTAIN/);
  assert.equal(fs.existsSync(f.lock), true);
  assert.equal(fs.existsSync(path.join(f.lock, 'owner.json')), false);
});

test('authority corruption is not a retryable lock', t => {
  const f = fixture(t);
  const original = pollReviewAuthority(f.authority);
  fs.writeFileSync(original.stream, '{');
  assert.throws(() => pollReviewAuthority(f.authority), SyntaxError);
});
