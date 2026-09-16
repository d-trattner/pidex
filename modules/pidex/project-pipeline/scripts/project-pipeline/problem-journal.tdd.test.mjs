import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';
import { appendProblemEvent, importProblemReports, normalizeProblemEvent, recordHostProblem } from './problem-journal.mjs';
import { syncProjectArchive } from './archive-sync.mjs';
import { runProjectPipelineAgent } from './run-agent.mjs';
import { runProjectPipelineOrchestration } from './orchestrator.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-problems-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pidexRoot = path.join(root, 'framework'), host = path.join(root, 'host'), workspace = path.join(root, 'workspace');
  for (const p of [pidexRoot, host, workspace]) fs.mkdirSync(p);
  const record = createProjectRecord({ project_id: 'pp-problems-test', name: 'test' });
  record.status = 'ready'; record.control_project_path = host;
  record.runs = [{ project_run_id: 'pprun-original', agent: 'pidex-planner', started_at: '2026-09-14T10:00:00.000Z', ended_at: '2026-09-14T10:01:00.000Z' }];
  saveProjectRecord(pidexRoot, record);
  const options = { pidexRoot, projectId: record.project_id, workspace };
  const event = { schema_version: 1, event_id: randomUUID(), incident_id: randomUUID(), occurred_at: '2026-09-14T10:01:00.000Z', project_id: record.project_id, run_id: 'pprun-original', phase: 'run', agent: 'pidex-planner', event_type: 'opened', category: 'runtime', status: 'blocked', summary: 'Model unavailable', cause: 'Runtime catalog does not contain the requested model', action: 'No retry performed', outcome: 'Run remains blocked', next_step: 'Operator should inspect runtime', evidence: ['agents.output/planning/report.md'], runtime: { pi_version: '0.85.1', provider: 'openai', model: 'astra', pidex_commit: null } };
  const journal = path.join(host, 'pidex/state/pipeline-projects/journal.jsonl');
  const rows = () => fs.readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
  const report = input => { const file = path.join(workspace, 'agents.output/pipeline-problems', input.event_id + '.json'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(input)); return file; };
  return { root, pidexRoot, host, workspace, record, options, event, journal, rows, report };
}

test('same transferred event deduplicates; update preserves incident, adds immutable row', t => {
  const f = fixture(t); f.report(f.event);
  const registry = path.join(f.pidexRoot, 'state/sandbox-projects', f.record.project_id + '.json');
  const registryBefore = fs.readFileSync(registry);
  assert.equal(importProblemReports(f.options).appended, 1);
  const bytes = fs.readFileSync(f.journal);
  assert.equal(importProblemReports(f.options).duplicates, 1);
  assert.deepEqual(fs.readFileSync(f.journal), bytes);
  f.report({ ...f.event, event_id: randomUUID(), event_type: 'resolved', status: 'resolved', outcome: 'Operator verified the correction' });
  assert.equal(importProblemReports(f.options).appended, 1);
  assert.equal(f.rows().length, 2);
  assert.equal(f.rows()[0].incident_id, f.rows()[1].incident_id);
  assert.equal(f.rows()[0].origin, 'artifact');
  assert.equal(f.rows()[0].run_scope, 'run');
  assert.ok(f.rows()[0].recorded_at);
  assert.deepEqual(fs.readFileSync(registry), registryBefore, 'resolved report cannot mutate run/hold state');
});

test('conflicting event ID cannot rewrite journal', t => {
  const f = fixture(t); f.report(f.event); importProblemReports(f.options);
  const bytes = fs.readFileSync(f.journal);
  f.report({ ...f.event, summary: 'Changed same event' });
  assert.equal(importProblemReports(f.options).rejected, 1);
  assert.deepEqual(fs.readFileSync(f.journal), bytes);
});

for (const mutation of [e => e.project_id = 'pp-other', e => e.run_id = 'pprun-foreign', e => e.agent = 'pidex-qa', e => e.schema_version = 2, e => e.evidence = ['../../secret'], e => e.evidence = ['agents.output/raw.log'], e => e.phase = 'invented', e => e.status = 'resolved', e => e.occurred_at = 'tomorrow', e => e.summary = 'a'.repeat(281), e => e.event_id = [e.event_id], e => e.incident_id = [e.incident_id], e => e.runtime = []]) test(`invalid binding/schema rejected: ${mutation}`, t => {
  const f = fixture(t); mutation(f.event); f.report(f.event);
  assert.equal(importProblemReports(f.options).rejected, 1);
  assert.equal(fs.existsSync(f.journal), false);
});

test('secrets, absolute paths, logs and unknown fields never enter the journal or archive', t => {
  const f = fixture(t);
  f.report({ ...f.event, summary: 'password=short', cause: 'Bearer shortcredential', action: 'Read C:\\Users\\private\\auth.json', outcome: 'one\nrawlog', next_step: 'Inspect /home/private/file', arbitrary: 'secret-extrafield', recorded_at: 'forged', origin: 'host' });
  const result = syncProjectArchive(f.options);
  assert.equal(result.ok, true);
  assert.equal(result.problem_journal.appended, 1);
  const text = fs.readFileSync(f.journal, 'utf8');
  assert.doesNotMatch(text, /shortcredential|short|Users|private|rawlog|extrafield|forged/);
  assert.equal(f.rows()[0].origin, 'artifact');
  assert.equal(fs.existsSync(path.join(result.archive_root, 'agents.output/pipeline-problems')), false);
});

test('journal corrupt tail and held lock are preserved, not repaired or stolen', t => {
  const f = fixture(t); f.report(f.event); importProblemReports(f.options);
  fs.appendFileSync(f.journal, '{partial');
  const before = fs.readFileSync(f.journal);
  f.report({ ...f.event, event_id: randomUUID() });
  assert.equal(importProblemReports(f.options).status, 'degraded');
  assert.deepEqual(fs.readFileSync(f.journal), before);
  const lock = path.join(path.dirname(f.journal), 'journal.lock'); fs.writeFileSync(lock, 'other-owner');
  assert.equal(importProblemReports(f.options).status, 'degraded');
  assert.equal(fs.readFileSync(lock, 'utf8'), 'other-owner');
});

test('symlinked report is rejected without reading target', t => {
  const f = fixture(t); const file = f.report(f.event); fs.unlinkSync(file);
  const target = path.join(f.root, 'private'); fs.writeFileSync(target, JSON.stringify(f.event));
  try { fs.symlinkSync(target, file); } catch (error) { if (error.code === 'EPERM') return t.skip('symlink privilege unavailable'); throw error; }
  assert.equal(importProblemReports(f.options).rejected, 1);
  assert.equal(fs.existsSync(f.journal), false);
});

test('symlinked state directory and conflicting host roots fail closed', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.host, 'pidex'));
  try { fs.symlinkSync(f.root, path.join(f.host, 'pidex/state'), 'junction'); } catch (error) { if (error.code === 'EPERM') return t.skip('symlink privilege unavailable'); throw error; }
  assert.throws(() => appendProblemEvent(f.record, normalizeProblemEvent(f.event, f.record)));
  assert.equal(fs.existsSync(path.join(f.root, 'pipeline-projects/journal.jsonl')), false);
  f.record.source = { kind: 'host-path', ref: f.workspace };
  assert.throws(() => appendProblemEvent(f.record, normalizeProblemEvent(f.event, f.record)));
});

test('no host root yields explicit unavailable, no fallback framework journal', t => {
  const f = fixture(t); delete f.record.control_project_path; saveProjectRecord(f.pidexRoot, f.record);
  assert.equal(recordHostProblem(f.options, { error: 'child-pi-failed', project_run_id: 'pprun-original' }).status, 'unavailable');
  assert.equal(fs.existsSync(path.join(f.pidexRoot, 'pidex/state/pipeline-projects/journal.jsonl')), false);
});

test('child run failure without artifact journals known cause and does not retry', t => {
  const f = fixture(t); let executions = 0;
  const result = runProjectPipelineAgent({ ...f.options, agent: 'pidex-planner', task: 'test', moduleRules: false, archiveFromContainer: false, runner: () => { executions++; return { status: 1, stdout: '', stderr: 'password=never-store-this' }; } });
  assert.equal(result.ok, false); assert.equal(executions, 1);
  assert.equal(result.problem_journal.failure.status, 'appended');
  const row = f.rows()[0]; assert.equal(row.cause, 'child-pi-failed'); assert.equal(row.origin, 'host'); assert.equal(row.run_id, result.project_run_id);
  assert.doesNotMatch(fs.readFileSync(f.journal, 'utf8'), /never-store/);
});

test('model failure classification retains a code, not stderr or credentials', t => {
  const f = fixture(t);
  runProjectPipelineAgent({ ...f.options, agent: 'pidex-planner', task: 'test', moduleRules: false, archiveFromContainer: false, runner: () => ({ status: 1, stdout: '', stderr: 'No models matching private-model; api_key=secret-value' }) });
  assert.equal(f.rows()[0].cause, 'model-unavailable');
  assert.equal(f.rows()[0].category, 'runtime');
  assert.doesNotMatch(fs.readFileSync(f.journal, 'utf8'), /private-model|secret-value|api_key/);
});

test('pre-dispatch failure has explicit attempt scope, no invented physical run', t => {
  const f = fixture(t);
  const result = runProjectPipelineAgent({ ...f.options, agent: 'pidex-planner', task: 'test', moduleRules: false, expectedOutputPath: '../escape', runner: () => { throw new Error('must not execute'); } });
  assert.equal(result.ok, false); assert.equal(f.rows()[0].phase, 'start'); assert.equal(f.rows()[0].run_scope, 'attempt');
});

test('transfer exception without artifacts is journaled and remains an exception', t => {
  const f = fixture(t); let executions = 0;
  assert.throws(() => runProjectPipelineAgent({ ...f.options, agent: 'pidex-planner', task: 'test', moduleRules: false, runner: args => { if (args[0] === 'exec') { executions++; return { status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: user\ncontext_file: agents.output/plan.md\n-->' }; } throw new Error('transport failed password=private'); } }));
  assert.equal(executions, 1); assert.equal(f.rows()[0].phase, 'transfer');
  assert.doesNotMatch(fs.readFileSync(f.journal, 'utf8'), /private/);
});

test('failed child reports use the existing transferred workspace without publishing failed output', t => {
  const f = fixture(t); f.event.run_id = 'pprun-failed-with-report'; f.report(f.event);
  let executions = 0;
  const result = runProjectPipelineAgent({ ...f.options, project_run_id: f.event.run_id, archiveWorkspace: f.workspace, agent: 'pidex-planner', task: 'test', moduleRules: false, runner: () => { executions++; return { status: 1, stdout: '' }; } });
  assert.equal(result.ok, false); assert.equal(executions, 1);
  assert.equal(result.problem_journal.appended, 1);
  assert.equal(f.rows().length, 2);
  assert.equal(result.archive_context_file, undefined);
  assert.equal(fs.existsSync(path.join(f.pidexRoot, 'state/project-archives', f.record.project_id)), false);
});

test('failed child uses existing Docker copy helper for only the report subtree and cleans staging', t => {
  const f = fixture(t); f.event.run_id = 'pprun-copy-report'; f.report(f.event);
  const calls = []; let destination;
  const result = runProjectPipelineAgent({ ...f.options, project_run_id: f.event.run_id, agent: 'pidex-planner', task: 'test', moduleRules: false, runner: args => {
    calls.push(args[0]);
    if (args[0] === 'exec') return { status: 1, stdout: '' };
    assert.equal(args[0], 'cp'); assert.match(args[1], /:\/workspace\/agents\.output\/pipeline-problems$/);
    destination = args[2]; fs.cpSync(path.join(f.workspace, 'agents.output/pipeline-problems'), destination, { recursive: true });
    return { status: 0, stdout: '' };
  } });
  assert.equal(result.ok, false); assert.deepEqual(calls, ['exec', 'cp']);
  assert.equal(result.problem_journal.appended, 1); assert.equal(f.rows().length, 2);
  assert.equal(fs.existsSync(path.dirname(path.dirname(path.dirname(destination)))), false);
});

test('normal successful transfer imports reports and host mirror does not overwrite journal', t => {
  const f = fixture(t); f.event.run_id = 'pprun-success-with-report'; f.report(f.event);
  fs.writeFileSync(path.join(f.workspace, 'agents.output/plan.md'), 'plan');
  const ignore = 'pidex/state/\nagents.output/\n'; fs.writeFileSync(path.join(f.host, '.gitignore'), ignore);
  const result = runProjectPipelineAgent({ ...f.options, project_run_id: f.event.run_id, archiveWorkspace: f.workspace, agent: 'pidex-planner', task: 'test', moduleRules: false, runner: () => ({ status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: user\ncontext_file: agents.output/plan.md\n-->' }) });
  assert.equal(result.ok, true); assert.equal(result.problem_journal.appended, 1);
  assert.equal(f.rows().length, 1);
  assert.equal(fs.readFileSync(path.join(f.host, '.gitignore'), 'utf8'), ignore);
  assert.equal(fs.existsSync(path.join(f.host, 'agents.output/pipeline-problems')), false);
});

test('oversized input and hardlinked journal are refused without changing existing data', t => {
  const f = fixture(t); f.report({ ...f.event, summary: 'x'.repeat(33000) });
  assert.equal(importProblemReports(f.options).rejected, 1);
  f.report(f.event); importProblemReports(f.options);
  const copy = path.join(f.root, 'journal-hardlink'); fs.linkSync(f.journal, copy);
  const before = fs.readFileSync(copy); f.report({ ...f.event, event_id: randomUUID() });
  assert.equal(importProblemReports(f.options).status, 'degraded');
  assert.deepEqual(fs.readFileSync(copy), before);
});

test('runtime SHA is retained, reported timestamps/origin cannot forge host fields', t => {
  const f = fixture(t);
  f.report({ ...f.event, runtime: { ...f.event.runtime, pidex_commit: 'a'.repeat(40) }, recorded_at: '1900-01-01T00:00:00.000Z', origin: 'host', run_scope: 'attempt' });
  importProblemReports(f.options);
  assert.equal(f.rows()[0].runtime.pidex_commit, 'a'.repeat(40));
  assert.equal(f.rows()[0].origin, 'artifact'); assert.equal(f.rows()[0].run_scope, 'run');
  assert.notEqual(f.rows()[0].recorded_at, '1900-01-01T00:00:00.000Z');
});

test('independent Node processes cannot append the same event twice', async t => {
  const f = fixture(t);
  // Create only the parent directories before the independent writers race.
  fs.mkdirSync(path.dirname(f.journal), { recursive: true });
  const payload = path.join(f.root, 'payload.json'); fs.writeFileSync(payload, JSON.stringify({ record: f.record, event: f.event }));
  const script = path.join(f.root, 'writer.mjs');
  fs.writeFileSync(script, `import fs from 'node:fs'; import { appendProblemEvent } from ${JSON.stringify(new URL('./problem-journal.mjs', import.meta.url).href)}; const {record,event}=JSON.parse(fs.readFileSync(process.argv[2])); try { console.log(appendProblemEvent(record,event).status); } catch { console.log('unavailable'); }`);
  const results = await Promise.all(Array.from({ length: 4 }, () => promisify(execFile)(process.execPath, [script, payload], { timeout: 15000, maxBuffer: 4096 })));
  assert.equal(results.filter(r => r.stdout.trim() === 'appended').length, 1);
  assert.equal(f.rows().length, 1);
  assert.equal(appendProblemEvent(f.record, f.event).status, 'duplicate');
});

test('host observation replay preserves first timestamp and event bytes', t => {
  const f = fixture(t);
  const event = normalizeProblemEvent(f.event, f.record, { origin: 'host' });
  appendProblemEvent(f.record, event); const before = fs.readFileSync(f.journal);
  assert.equal(appendProblemEvent(f.record, { ...event, occurred_at: '2026-09-14T11:00:00.000Z' }).status, 'duplicate');
  assert.deepEqual(fs.readFileSync(f.journal), before);
});

test('orchestration start error uses journal without dispatch or automatic continuation', async t => {
  const f = fixture(t);
  await assert.rejects(runProjectPipelineOrchestration({ ...f.options, phases: 'invalid-phase', runner: () => { throw new Error('must not execute'); } }));
  assert.equal(f.rows()[0].phase, 'start'); assert.equal(f.rows()[0].run_scope, 'attempt');
});
