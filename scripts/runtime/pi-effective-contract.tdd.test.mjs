import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { closeoutResultRouting } from './closeout-obligations.mjs';
const read = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const rulePath = 'rules/pidex-pi/user-decision-routing-consistency.md';
const role = () => read('agents/pidex-pi.md');
function matrix() {
  return read(rulePath).split('\n').filter(l => /^\| (producer|unbound) \|/.test(l))
    .map(l => l.split('|').slice(1,-1).map(v=>v.trim()));
}
function routing(verdict, target) {
  return `<!-- ROUTING\nverdict: ${verdict}\nroute_to: ${target}\ncontext_file: agents.output/process-improvement/plan-001-pi.md\npost_retro_handoffs: none\ncloseout_dispatch: aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa\ncloseout_obligations: none\n-->`;
}
test('one explicit decision matrix covers producer and unbound PI without losing G7', () => {
  const rows=matrix();assert.equal(rows.length,12);
  for(const binding of ['producer','unbound']) for(const state of ['not_requested','approved','deferred','rejected','pending','unknown']) {
    const matches=rows.filter(r=>r[0]===binding&&r[1]===state);assert.equal(matches.length,1);const row=matches[0];
    const blocked=['pending','unknown'].includes(state);
    assert.equal(row[3],blocked?'user':binding==='producer'?'orchestrator':'pidex-roadmap');
    assert.equal(row[4],blocked?'G7':'none');
    assert.equal(row[5],state==='approved'?'approved_scope':'artifact_only');
    if(blocked)assert.equal(row[2],'BLOCKED');
    else if(binding==='producer'){assert(['COMPLETE','DEFERRED'].includes(row[2]));const text=routing(row[2],row[3]);assert.deepEqual(closeoutResultRouting('pidex-pi',text,text).requests,[]);}
  }
});
test('system role and skill explicitly bind to the same mode/decision contract', () => {
  assert.match(role(),/Producer-bound \(ordinary v2 or recoverable v3\)/);
  assert.match(role(),/COMPLETE or DEFERRED.*orchestrator/);
  assert.doesNotMatch(role(),/COMPLETE \/ DEFERRED \/ REJECTED\*\* → `pidex-roadmap`/);
  assert(read('skills/pidex/SKILL.md').includes(rulePath));
  assert(read('readme/closeout-recovery.md').includes(rulePath));
});
test('decision labels are not self-authenticating approval or unresolved-heading detectors', () => {
  const text=read(rulePath);
  assert.match(text,/Headings and keywords alone do not establish a pending decision/);
  assert.match(text,/Missing or contradictory authorization evidence means `unknown`/);
  assert.match(text,/cannot override an actual unresolved user decision/);
  assert.match(role(),/decision_state/);
  assert.doesNotMatch(text,/has an unresolved user decision when it contains any/);
});
test('G7 and refusal guidance cannot create another physical call or fallback', () => {
  assert.match(read(rulePath),/v3 resume cannot invoke a model/);
  assert.match(read('rules/shared/provider-safe-defensive-review-language.md'),/does not authorize a retry, fallback, new identity or budget reset/);
  assert.match(role(),/No automatic retries or replacement dispatches/);
});
test('artifact-only PI has no implicit cleanup, adoption or Git work', () => {
  assert.match(role(),/artifact_only.*no retrospective moves, other-artifact cleanup, rule adoption, staging, commits or pushes/);
  assert.doesNotMatch(role(),/git add wiki\/ pidex\/state\//);
  assert.match(role(),/Never stage or commit `agents.output\/\*\*`, `state\/\*\*` or `pidex\/state\/\*\*`/);
  assert.match(read('rules/pidex-pi/hold-sync-manifest-bundle.md'),/not a runtime review\/closeout hold/);
});
test('startup metadata exception is explicit and no implementation phase is inside a code fence', () => {
  const text=role();assert.match(text,/If required metadata or the assigned path is missing, request it before writing/);
  let fence=null;
  for(const line of text.split('\n')) {
    if(/^#{1,3} (Process|Phase|Analysis Document|Document Lifecycle|Routing)/.test(line))assert.equal(fence,null,line);
    const m=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);if(!m)continue;
    if(!fence)fence={char:m[1][0],len:m[1].length};else if(m[1][0]===fence.char&&m[1].length>=fence.len&&!m[2].trim())fence=null;
  }
  assert.equal(fence,null);assert.doesNotMatch(text,/send gate to Telegram|in running-pi|git add wiki\/ pidex\/state\//);
});
test('shipped baseline still verifies all approved role/rule bytes without adopting runtime state', async () => {
  const { verifyBundledBaseline } = await import('../quality/rule-lifecycle.mjs');
  const root = new URL('../../', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const verified = verifyBundledBaseline({ root: fileURLToPath(root) });
  for (const name of ['agents/pidex-pi.md', 'agents/pidex-retrospective.md', rulePath, 'rules/pidex-pi/index.md', 'rules/pidex-pi/hold-sync-manifest-bundle.md', 'rules/shared/provider-safe-defensive-review-language.md']) assert(verified.members.some(m => m.path === name));
});

test('indexed PI rules remain present and cannot bypass mode authority', () => {
  const index=read('rules/pidex-pi/index.md');
  for(const [,target] of index.matchAll(/\]\(([^)]+\.md)\)/g))assert.ok(read('rules/pidex-pi/'+target));
  assert.match(index,/user-decision-routing-consistency\.md.*mode/i);
  assert.match(read('rules/pidex-pi/hold-sync-manifest-bundle.md'),/producer-bound.*orchestrator/);
});
