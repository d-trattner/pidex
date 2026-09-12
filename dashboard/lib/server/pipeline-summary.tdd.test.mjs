// Prepared SQL fixtures; not executed during Point4 implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { pipelineSummarySql } from './pipeline-summary.ts';
function fixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE projects(id INTEGER PRIMARY KEY); INSERT INTO projects VALUES(1),(2);
    CREATE TABLE pipeline_events(project_id INTEGER, project_path TEXT, plan_key TEXT, pipeline_id TEXT, event_type TEXT, timestamp TEXT, status TEXT);
    CREATE TABLE agent_runs(agent TEXT, verdict TEXT, route_to TEXT); INSERT INTO agent_runs VALUES('pidex-devops','COMPLETE','user');`);
  const add = (id, event, at = '2026-09-11T12:00:00Z', status = '', project = 1, plan = 'plan-001') => db.prepare('INSERT INTO pipeline_events VALUES(?,?,?,?,?,?,?)').run(project, '/project-' + project, plan, id, event, at, status);
  const count = (filter = '', params = []) => ({ ...db.prepare(pipelineSummarySql(filter)).get(...params) });
  return { add, count };
}
test('agent verdicts never stand in for pipeline starts or ends', t => {
  const f = fixture(t); assert.deepEqual(f.count(), { started: 0, completed: 0 });
  f.add('one', 'pipeline_started'); assert.deepEqual(f.count(), { started: 1, completed: 0 });
  f.add('one', 'pipeline_completed', '2026-09-11T12:01:00Z', 'completed'); assert.deepEqual(f.count(), { started: 1, completed: 1 });
});
test('scope identity, missing openings and conflicting terminals fail conservatively', t => {
  const f = fixture(t);
  f.add('orphan', 'pipeline_completed');
  f.add('wrong-plan', 'pipeline_started'); f.add('wrong-plan', 'pipeline_completed', '2026-09-11T12:01:00Z', 'completed', 1, 'plan-002');
  f.add('conflict', 'pipeline_started'); f.add('conflict', 'pipeline_completed'); f.add('conflict', 'pipeline_aborted');
  f.add('bad-status', 'pipeline_started'); f.add('bad-status', 'pipeline_completed', '2026-09-11T12:01:00Z', 'failed');
  assert.deepEqual(f.count(), { started: 3, completed: 0 });
});
test('end ordering, later events and malformed times cannot be recorded success', t => {
  const f = fixture(t);
  f.add('early', 'pipeline_started', '2026-09-11T12:01:00Z'); f.add('early', 'pipeline_completed');
  f.add('later', 'pipeline_started'); f.add('later', 'pipeline_completed', '2026-09-11T12:01:00Z'); f.add('later', 'pipeline_resumed', '2026-09-11T12:02:00Z');
  f.add('invalid', 'pipeline_started', 'not-a-date'); f.add('invalid', 'pipeline_completed');
  assert.deepEqual(f.count(), { started: 3, completed: 0 });
});
test('duplicate imported copies do not inflate identities and filters remain parameterized', t => {
  const f = fixture(t);
  for (let i = 0; i < 2; i++) { f.add('same', 'pipeline_started'); f.add('same', 'pipeline_completed', '2026-09-11T12:01:00Z', 'completed'); }
  f.add('same', 'pipeline_started', '2026-09-11T12:00:00Z', '', 2);
  assert.deepEqual(f.count(), { started: 2, completed: 1 }); assert.deepEqual(f.count('AND p.id = ?', [2]), { started: 1, completed: 0 });
});
