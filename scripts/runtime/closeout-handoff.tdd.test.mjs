import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCloseoutRequest } from './closeout-recovery.mjs';
import { closeoutResultRouting } from './closeout-obligations.mjs';
const read = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

test('published PI handoff assigns the role-owned artifact and targeted input', () => {
  const doc = read('readme/closeout-recovery.md');
  const section = doc.split('## Role-consistent handoffs\n')[1];
  assert.ok(section, 'missing role-consistent handoff contract');
  const call = JSON.parse(section.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(call.agent, 'pidex-pi');
  validateCloseoutRequest(call.closeout);
  assert.equal(call.closeout.artifactPath, 'agents.output/process-improvement/plan-001-example-pi.md');
  assert.ok(call.task.includes(call.closeout.artifactPath));
  assert.match(call.task, /Read only.*Findings.*Process Improvement Recommendations/);
  assert.match(call.task, /no full-file Read/);
  assert.match(read('agents/pidex-pi.md'), /Only create pipeline artifacts in `agents.output\/process-improvement\/`/);
  assert.match(read('skills/pidex/SKILL.md'), /PI handoff pre-dispatch/);
});

test('PI metadata inheritance does not require full retrospective content', () => {
  const pi = read('agents/pidex-pi.md');
  assert.match(pi, /Inherit ID, Origin, UUID and `post_retro_handoffs` from the orchestrator's handoff/);
  assert.match(pi, /If missing, ask the orchestrator/);
  assert.match(pi, /no full-file Read/);
});

test('retro canonical section names and explicit none match the producer contract', () => {
  const retro = read('agents/pidex-retrospective.md');
  assert.match(retro, /\*\*Roadmap Updates\*\*/);
  assert.doesNotMatch(retro, /Document under \*\*"Project Improvement Findings"\*\*/);
  assert.match(retro, /exactly `None\.`/);
  assert.match(retro, /Never append explanations/);
  assert.match(retro, /post_retro_handoffs: <none or/);
  assert.match(read('skills/pidex/SKILL.md'), /\*\*"Roadmap Updates"\*\* → invoke pidex-roadmap/);
});

function parsed(sections, actor = 'pidex-retrospective') {
  const routing = `<!-- ROUTING\nverdict: COMPLETE\nroute_to: ${actor === 'pidex-retrospective' ? 'pidex-pi' : 'orchestrator'}\npost_retro_handoffs: none\ncloseout_dispatch: aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa\ncloseout_obligations: none\ncontext_file: agents.output/example.md\n-->`;
  return closeoutResultRouting(actor, routing, sections + '\n' + routing).requests;
}
for (const empty of ['', 'None.', 'N/A.', 'Not applicable.']) {
  test(`empty sections retain mandatory PI only: ${JSON.stringify(empty)}`, () => {
    assert.deepEqual(parsed(['Planning Insights', 'Roadmap Updates', 'Architecture Patterns'].map(h => `## ${h}\n${empty}\n`).join('\n')), ['pidex-pi']);
  });
}
test('None plus explanation remains substantive, not a waiver', () => {
  const sections = ['Planning Insights', 'Roadmap Updates', 'Architecture Patterns'].map(h => `## ${h}\nNone. No additional follow-up identified.\n`).join('\n');
  assert.deepEqual(parsed(sections), ['pidex-architect', 'pidex-pi', 'pidex-planner', 'pidex-roadmap']);
  assert.deepEqual(parsed(sections, 'pidex-pi'), ['pidex-architect', 'pidex-planner', 'pidex-roadmap']);
});
