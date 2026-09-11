import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beginHostCloseoutDispatch, recordPipelineEvent, confirmPipelineCloseout, resolvePlanReviewAuthority } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
import { foldCloseoutObligations } from './closeout-obligations.mjs';
const linux = { skip: process.platform !== 'linux' };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-closeout-obligations-'));
  const project = path.join(root, 'project'); fs.mkdirSync(project);
  const stateDir = path.join(root, 'state'); const pipelineId = 'obligations-001'; const planId = 'plan-001';
  const context = { project, stateDir, pipelineId, planId };
  const start = recordPipelineEvent({ ...context, plan: planId, event: 'pipeline_started' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, context, stream: start.outPath, begin: actor => beginHostCloseoutDispatch({ ...context, actor }), complete: () => confirmPipelineCloseout({ ...context, plan: planId, event: 'pipeline_completed' }) };
}
function result(f, agent, { verdict = 'COMPLETE', handoffs = 'none', artifactHandoffs = handoffs } = {}) {
  const relative = `agents.output/${agent}/001.md`; const route = agent === 'pidex-retrospective' ? 'pidex-pi' : 'orchestrator';
  const admitted = fs.readFileSync(f.stream, 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.event_type === 'pipeline_closeout_dispatch_started' && r.metadata.actor === agent).at(-1)?.metadata;
  const text = declared => `<!-- ROUTING\nverdict: ${verdict}\nroute_to: ${route}\npost_retro_handoffs: ${declared}\ncloseout_dispatch: ${admitted?.id}\ncloseout_obligations: ${admitted?.consumes.join(', ') || 'none'}\ncontext_file: ${relative}\n-->`;
  fs.mkdirSync(path.dirname(path.join(f.context.project, relative)), { recursive: true });
  fs.writeFileSync(path.join(f.context.project, relative), text(artifactHandoffs));
  return { agent, exitCode: 0, finalText: text(handoffs) };
}
function publish(f) { f.begin('pidex-retrospective').finish(result(f, 'pidex-retrospective', { handoffs: 'pidex-planner, pidex-architect' })); }

test('real regression: retro + PI DEFERRED cannot close declared planner/architect obligations', linux, t => {
  const f = fixture(t); publish(f);
  f.begin('pidex-pi').finish(result(f, 'pidex-pi', { verdict: 'DEFERRED', handoffs: 'pidex-planner, pidex-architect' }));
  const before = fs.readFileSync(f.stream);
  assert.throws(() => f.begin('pidex-pi'), /PIPELINE_CLOSEOUT_HANDOFF_NOT_REQUIRED/);
  assert.throws(f.complete, /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  assert.throws(() => recordPipelineEvent({ ...f.context, plan: 'plan-001', event: 'pipeline_completed' }), /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  assert.deepEqual(fs.readFileSync(f.stream), before);
  f.begin('pidex-planner').finish(result(f, 'pidex-planner'));
  assert.throws(f.complete, /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  f.begin('pidex-architect').finish(result(f, 'pidex-architect'));
  assert.equal(f.complete().confirmed, true); assert.equal(f.complete().alreadyRecorded, true);
});

test('publisher start is durable before return; concurrent retry and finalization refuse', linux, t => {
  const f = fixture(t); f.begin('pidex-retrospective'); const before = fs.readFileSync(f.stream);
  assert.throws(() => f.begin('pidex-retrospective'), /PIPELINE_CLOSEOUT_DISPATCH_PENDING/);
  assert.throws(() => f.begin('pidex-pi'), /PIPELINE_CLOSEOUT_DISPATCH_PENDING/);
  assert.throws(f.complete, /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  assert.deepEqual(fs.readFileSync(f.stream), before);
});

test('missing or conflicting publisher declaration keeps pending and cannot be silently retried', linux, t => {
  const f = fixture(t); const ticket = f.begin('pidex-retrospective');
  const value = result(f, 'pidex-retrospective', { handoffs: 'pidex-planner', artifactHandoffs: 'none' });
  assert.throws(() => ticket.finish(value), /PIPELINE_CLOSEOUT_ROUTING_MISMATCH/);
  assert.throws(f.complete, /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  assert.throws(() => f.begin('pidex-retrospective'), /PIPELINE_CLOSEOUT_DISPATCH_PENDING/);
});

test('failed or deferred handoff is not done; genuine later successful return satisfies it', linux, t => {
  const f = fixture(t); publish(f);
  f.begin('pidex-pi').finish(result(f, 'pidex-pi'));
  f.begin('pidex-planner').finish(result(f, 'pidex-planner', { verdict: 'DEFERRED' }));
  assert.throws(f.complete, /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  f.begin('pidex-planner').finish(result(f, 'pidex-planner'));
  f.begin('pidex-architect').finish({ agent: 'pidex-architect', exitCode: 1 });
  assert.throws(f.complete, /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  f.begin('pidex-architect').finish(result(f, 'pidex-architect'));
  assert.equal(f.complete().confirmed, true);
});

test('old planner work, another actor and another pipeline cannot satisfy later obligations', linux, t => {
  const f = fixture(t); assert.equal(f.begin('pidex-planner'), null); publish(f);
  const ticket = f.begin('pidex-planner');
  assert.throws(() => ticket.finish(result(f, 'pidex-architect')), /RETURN_IDENTITY_INVALID/);
  recordPipelineEvent({ ...f.context, plan: 'plan-001', event: 'pipeline_aborted' });
  recordPipelineEvent({ ...f.context, pipelineId: 'successor-001', plan: 'plan-001', event: 'pipeline_started' });
  const before = fs.readFileSync(f.stream);
  assert.throws(() => ticket.finish(result(f, 'pidex-planner')), /RETURN_IDENTITY_INVALID/);
  assert.deepEqual(fs.readFileSync(f.stream), before);
});

test('new retrospective cannot erase pending round; corrupt/replayed ledger refuses', linux, t => {
  const f = fixture(t); publish(f);
  assert.throws(() => f.begin('pidex-retrospective'), /OBLIGATIONS_PENDING/);
  const rows = resolvePlanReviewAuthority(f.context).rows;
  const end = rows.at(-1);
  assert.throws(() => foldCloseoutObligations([...rows, end], f.context), /HISTORY_INVALID/);
  assert.throws(() => foldCloseoutObligations(rows, { ...f.context, pipelineId: 'other' }), /HISTORY_INVALID/);
});

test('generic event API and both terminal CLI paths cannot forge or bypass obligations', linux, t => {
  const f = fixture(t); publish(f);
  assert.throws(() => recordPipelineEvent({ ...f.context, plan: 'plan-001', event: 'pipeline_closeout_dispatch_finished', metadata: {} }), /RESERVED_EVENT/);
  const cli = fileURLToPath(new URL('../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs', import.meta.url));
  const before = fs.readFileSync(f.stream);
  for (const flags of [[], ['--confirm-closeout']]) {
    const p = spawnSync(process.execPath, [cli, '--state-dir', f.context.stateDir, '--project', f.context.project, '--plan', 'plan-001', '--pipeline-id', f.context.pipelineId, '--event', 'pipeline_completed', ...flags], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(p.status, 0); assert.match(p.stderr, /PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING/);
  }
  assert.deepEqual(fs.readFileSync(f.stream), before);
});

test('real host boundary produces and fulfils obligations; no child on pending publisher', linux, async t => {
  const f = fixture(t); const runtime = path.join(f.root, 'runtime');
  for (const name of ['agents', 'config', 'scripts']) fs.mkdirSync(path.join(runtime, name), { recursive: true });
  fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pidex', version: '0.0.0' }));
  fs.writeFileSync(path.join(runtime, 'config/agents.json'), JSON.stringify({ defaults: { provider: 'pi' }, agents: {} }));
  const prior = process.env.PIDEX_ROOT; let boundary;
  try { process.env.PIDEX_ROOT = runtime; boundary = (await import('../../extensions/pidex/index.ts?closeout-producer-test')).executeHostAgentBoundary; }
  finally { if (prior === undefined) delete process.env.PIDEX_ROOT; else process.env.PIDEX_ROOT = prior; }
  const calls = [];
  const options = {
    agentCwd: f.context.project, reviewLifecycle: { stateDir: f.context.stateDir, pipelineId: f.context.pipelineId },
    loadConfig: () => ({ defaults: { provider: 'pi', model: 'openai-codex/gpt-5.6-terra', effort: 'medium' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    automaticRetrospectiveSource: () => ({ run: async () => ({ status: 'fixture_no_learning' }) }),
    runConfigured: async p => {
      calls.push(p.agent); assert.throws(f.complete, /OBLIGATIONS_PENDING/);
      assert.match(p.task, /PIDEX (CLOSEOUT CONTRACT|POST-RETRO HANDOFF)/);
      const response = result(f, p.agent, { verdict: p.agent === 'pidex-pi' ? 'DEFERRED' : 'COMPLETE', handoffs: 'none' });
      if (p.agent === 'pidex-retrospective') {
        const file = path.join(f.context.project, 'agents.output/pidex-retrospective/001.md');
        fs.writeFileSync(file, '# Planning Insights\n- Preserve invariants.\n# Architecture Patterns\n- Preserve boundaries.\n' + fs.readFileSync(file, 'utf8'));
      }
      return response;
    },
  };
  const run = agent => boundary({ agent, task: 'Plan 001 post-retro workflow' }, options);
  await run('pidex-retrospective'); await run('pidex-pi');
  await assert.rejects(run('pidex-retrospective'), /OBLIGATIONS_PENDING/);
  assert.equal(calls.length, 2); assert.throws(f.complete, /OBLIGATIONS_PENDING/);
  await run('pidex-planner'); await run('pidex-architect');
  assert.deepEqual(calls, ['pidex-retrospective', 'pidex-pi', 'pidex-planner', 'pidex-architect']);
  assert.equal(f.complete().confirmed, true);
});

test('a new invocation cannot reuse an old artifact/return nonce', linux, t => {
  const f = fixture(t); const old = f.begin('pidex-retrospective');
  const oldResult = result(f, 'pidex-retrospective');
  old.finish({ agent: 'pidex-retrospective', exitCode: 1 });
  const next = f.begin('pidex-retrospective');
  assert.throws(() => next.finish(oldResult), /RETURN_IDENTITY_INVALID/);
  assert.throws(f.complete, /OBLIGATIONS_PENDING/);
});

test('captured declarations survive moved source and reject snapshot tampering', linux, t => {
  const f = fixture(t); publish(f);
  const artifact = path.join(f.context.project, 'agents.output/pidex-retrospective/001.md'); fs.unlinkSync(artifact);
  const planner = f.begin('pidex-planner');
  assert.match(planner.instruction, /post_retro_handoffs/);
  assert.match(planner.instruction, /pidex-architect/);
  const rows = resolvePlanReviewAuthority(f.context).rows;
  const end = rows.find(r => r.event_type === 'pipeline_closeout_dispatch_finished');
  end.metadata.artifact.content += '\nchanged';
  assert.throws(() => foldCloseoutObligations(rows, f.context), /HISTORY_INVALID/);
});

test('populated canonical retro sections require handoffs despite a none declaration', linux, t => {
  const f = fixture(t); const ticket = f.begin('pidex-retrospective');
  const r = result(f, 'pidex-retrospective');
  const p = path.join(f.context.project, 'agents.output/pidex-retrospective/001.md');
  fs.writeFileSync(p, '# Planning Insights\n\n- Pin the finite-result invariant.\n\n# Roadmap Updates\n\nNone.\n\n# Architecture Patterns\n\n- Keep CLI diagnostics at the boundary.\n\n' + fs.readFileSync(p, 'utf8'));
  const completed = ticket.finish(r);
  assert.deepEqual(completed.pendingObligations.map(o => o.actor).sort(), ['pidex-architect', 'pidex-pi', 'pidex-planner']);
  f.begin('pidex-pi').finish(result(f, 'pidex-pi', { verdict: 'DEFERRED' }));
  assert.throws(f.complete, /OBLIGATIONS_PENDING/);
  f.begin('pidex-planner').finish(result(f, 'pidex-planner'));
  f.begin('pidex-architect').finish(result(f, 'pidex-architect'));
  assert.equal(f.complete().confirmed, true);
});

test('section policy respects empty markers, fences, numbering and additive declarations', linux, t => {
  const f = fixture(t); const ticket = f.begin('pidex-retrospective');
  const r = result(f, 'pidex-retrospective', { handoffs: 'pidex-planner' });
  const p = path.join(f.context.project, 'agents.output/pidex-retrospective/001.md');
  fs.writeFileSync(p, '```md\n# Architecture Patterns\n- Example only, not a real section.\n```\n# Planning Insights\nNone.\n## 2. Roadmap Updates\n- Capture a real follow-up.\n## Architecture Patterns\nNot applicable.\n' + fs.readFileSync(p, 'utf8'));
  assert.deepEqual(ticket.finish(r).pendingObligations.map(o => o.actor).sort(), ['pidex-pi', 'pidex-planner', 'pidex-roadmap']);
});

test('v1 remains declared-only; mixed-version return cannot upgrade old authority', linux, t => {
  const f = fixture(t); const ticket = f.begin('pidex-retrospective'); const r = result(f, 'pidex-retrospective');
  const p = path.join(f.context.project, 'agents.output/pidex-retrospective/001.md');
  fs.writeFileSync(p, '# Planning Insights\n- A real insight.\n' + fs.readFileSync(p, 'utf8')); ticket.finish(r);
  const rows = resolvePlanReviewAuthority(f.context).rows;
  const legacy = structuredClone(rows);
  for (const row of legacy) {
    if (!row.event_type.startsWith('pipeline_closeout_')) continue;
    assert.equal(row.metadata.schema, 'pidex-closeout-v2'); row.metadata.schema = 'pidex-closeout-v1';
    if (row.event_type === 'pipeline_closeout_dispatch_finished') row.metadata.requests = ['pidex-pi'];
  }
  assert.deepEqual([...foldCloseoutObligations(legacy, f.context).obligations.values()].map(o => o.actor), ['pidex-pi']);
  legacy.at(-1).metadata.schema = 'pidex-closeout-v2';
  assert.throws(() => foldCloseoutObligations(legacy, f.context), /HISTORY_INVALID/);
});

test('wrong closed-plan handoff reports requested and observed keys without adopting active authority', linux, t => {
  const f = fixture(t); f.complete(); recordPipelineEvent({ ...f.context, plan: 'plan-002', pipelineId: 'next-002', event: 'pipeline_started' });
  const next = resolvePlanReviewAuthority({ ...f.context, planId: 'plan-002' }); const before = fs.readFileSync(next.stream);
  assert.throws(() => f.begin('pidex-planner'), /REVIEW_AUTHORITY_NOT_FOUND: requested_plan=plan-001; observed_active_plans=plan-002/);
  assert.deepEqual(fs.readFileSync(next.stream), before);
});

test('compact semicolon ROUTING matches the same multiline artifact without relaxing identity', linux, t => {
  const f = fixture(t); const ticket = f.begin('pidex-retrospective'); const r = result(f, 'pidex-retrospective');
  r.finalText = r.finalText.replace(/\n/g, '; ').replace('ROUTING; ', 'ROUTING ').replace('; -->', ' -->');
  assert.equal(ticket.finish(r).status, 'dispatch_completed');
  const pi = f.begin('pidex-pi'); const p = result(f, 'pidex-pi', { verdict: 'DEFERRED' });
  p.finalText = p.finalText.replace(/\n/g, '; ').replace('ROUTING; ', 'ROUTING ').replace('; -->', ' -->');
  const valid = p.finalText;
  p.finalText = valid.replace(' -->', '; closeout_dispatch: 00000000-0000-0000-0000-000000000000 -->');
  assert.throws(() => pi.finish(p), /ROUTING_INVALID/);
  p.finalText = valid.replace(/closeout_dispatch: [a-f0-9-]+/, 'closeout_dispatch: 00000000-0000-0000-0000-000000000000');
  assert.throws(() => pi.finish(p), /ROUTING_MISMATCH|RETURN_IDENTITY_INVALID/);
  p.finalText = valid; pi.finish(p); assert.equal(f.complete().confirmed, true);
});

test('artifact symlink and budget/error return do not create completion', linux, t => {
  const f = fixture(t); const ticket = f.begin('pidex-retrospective');
  const r = result(f, 'pidex-retrospective');
  const file = path.join(f.context.project, 'agents.output/pidex-retrospective/001.md');
  fs.renameSync(file, file + '.target'); fs.symlinkSync(file + '.target', file);
  assert.throws(() => ticket.finish(r));
  assert.throws(f.complete, /OBLIGATIONS_PENDING/);
});
