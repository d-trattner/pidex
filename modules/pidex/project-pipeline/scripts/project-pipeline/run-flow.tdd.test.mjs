import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProjectPipelineFlow, parseArgs, parseCredentialEntries, serializePublicRunFlowAgentFailure } from './run-flow.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-flow-')); }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }

function fakeRunner(workspaceFiles = {}) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args[0] === 'volume' || args[0] === 'create' || args[0] === 'start' || args[0] === 'cp') return 'ok';
    if (args[0] === 'exec' && args.includes('pi')) return { status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\nreason: ok\ncontext_file: agents.output/smoke/run-flow.md\n-->', stderr: '' };
    if (args[0] === 'cp' && String(args[1]).endsWith('/agents.output')) return { status: 0, stdout: '', stderr: '' };
    return 'ok';
  };
  runner.calls = calls;
  return runner;
}

test('parseCredentialEntries maps explicit allowlisted credentials only', () => {
  const entries = parseCredentialEntries({ credentials: { 'pi-auth': '/a/auth.json', ignored: '' } });
  assert.deepEqual(entries, [{ kind: 'pi-auth', source: '/a/auth.json' }]);
});

test('runProjectPipelineFlow creates sandbox and imports local source without fallback', () => {
  const root = tmp();
  const source = tmp();
  write(path.join(source, 'package.json'), '{"name":"x"}');
  const runner = fakeRunner();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-create1', source, runner });
  assert.equal(result.ok, true);
  assert.equal(result.no_fallback, true);
  assert.equal(runner.calls.some((args) => args[0] === 'create'), true);
  assert.equal(result.source.copied.length, 1);
});

test('runProjectPipelineFlow returns no_fallback envelope on credential copy without acknowledgement', () => {
  const root = tmp();
  const auth = path.join(tmp(), 'auth.json');
  write(auth, '{"token":"x"}');
  const runner = fakeRunner();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-creds1', entries: [{ kind: 'pi-auth', source: auth }], runner });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'credential-bootstrap-failed');
  assert.equal(result.no_fallback, true);
  assert.match(result.reason, /acknowledge/);
});

test('runProjectPipelineFlow returns no_fallback envelope on missing source', () => {
  const root = tmp();
  const runner = fakeRunner();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-source1', source: path.join(tmp(), 'missing'), runner });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'source-init-failed');
  assert.equal(result.no_fallback, true);
});

const UNSAFE_AGENT_DIAGNOSTIC = 'POSIX=/srv/private/rules.md DRIVE=C:\\secrets\\rule.md UNC=\\\\server\\share\\secret NEWLINE_MARKER\nNUL_MARKER\0 RULE_BYTES_X9 SECRET_MARKER invalid <!-- ROUTING context_file: /srv/private/out.md -->';
const UNSAFE_DIAGNOSTIC_MARKERS = ['POSIX=', '/srv/private/rules.md', 'DRIVE=', 'C:\\secrets\\rule.md', 'UNC=', '\\\\server\\share\\secret', 'NEWLINE_MARKER', 'NUL_MARKER', 'RULE_BYTES_X9', 'SECRET_MARKER', 'context_file: /srv/private/out.md'];

function assertPublicFailureRedactsUnsafeDiagnostics(result) {
  const serialized = JSON.stringify(result);
  for (const marker of UNSAFE_DIAGNOSTIC_MARKERS) assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test('serializePublicRunFlowAgentFailure emits only typed allowlisted fields', () => {
  const result = serializePublicRunFlowAgentFailure({ ok: false, error: 'child-pi-failed', exitCode: 9, project_run_id: 'pprun-safe_1', archive_sync_status: 'failed', finalText: UNSAFE_AGENT_DIAGNOSTIC, routing: { context_file: '/srv/private/out.md' }, write_fence: { reason: UNSAFE_AGENT_DIAGNOSTIC }, archiveSyncReport: { detail: UNSAFE_AGENT_DIAGNOSTIC }, reason: UNSAFE_AGENT_DIAGNOSTIC });
  assert.deepEqual(result, { cause: 'agent-run-failed', run: { ok: false, error: 'agent-run-failed', exitCode: 9, project_run_id: 'pprun-safe_1', archive_sync_status: 'failed' } });
  assertPublicFailureRedactsUnsafeDiagnostics(result);
});

test('runProjectPipelineFlow routes thrown and returned agent failures through one typed serializer seam', () => {
  const source = readFileSync(new URL('./run-flow.mjs', import.meta.url), 'utf8');
  assert.match(source, /catch \{\s*run = \{ ok: false, error: 'agent-run-failed' \};\s*\}\s*if \(!run\.ok\) \{\s*const failure = serializePublicRunFlowAgentFailure\(run\);/s);
  assert.doesNotMatch(source, /catch \{\s*return \{ ok: false, error: 'agent-run-failed'/);
});

test('runProjectPipelineFlow maps thrown agent diagnostics to fixed public cause', () => {
  const root = tmp();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-agent1', agent: 'pidex-implementer', task: 'x', moduleRules: false, runner: (args) => { if (args[0] === 'exec' && args.includes('pi')) throw new Error(UNSAFE_AGENT_DIAGNOSTIC); return 'ok'; } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'agent-run-failed');
  assert.equal(result.cause, 'agent-run-failed');
  assert.equal(result.reason, undefined);
  assert.equal(result.no_fallback, true);
  assertPublicFailureRedactsUnsafeDiagnostics(result);
});

test('runProjectPipelineFlow redacts returned failed-agent diagnostics', () => {
  const root = tmp();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-returned-agent-failure', agent: 'pidex-implementer', task: 'x', moduleRules: false, runner: (args) => args[0] === 'exec' && args.includes('pi') ? { status: 1, stdout: UNSAFE_AGENT_DIAGNOSTIC, stderr: UNSAFE_AGENT_DIAGNOSTIC } : 'ok' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'agent-run-failed');
  assert.equal(result.cause, 'agent-run-failed');
  assert.deepEqual(Object.keys(result.run).sort(), ['error', 'exitCode', 'ok', 'project_run_id']);
  assert.equal(result.run.error, 'agent-run-failed');
  assert.equal(result.run.exitCode, 1);
  assert.match(result.run.project_run_id, /^pprun-[A-Za-z0-9_-]+$/);
  assertPublicFailureRedactsUnsafeDiagnostics(result);
});

test('runProjectPipelineFlow returns an allowlisted typed envelope for module injection failures and CLI cannot disable modules', () => {
  const root = tmp();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-module-failure', agent: 'pidex-implementer', task: 'x', runner: () => 'ok' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'agent-run-failed');
  assert.equal(result.cause, 'module-rule-injection-failed');
  assert.equal(result.reason, 'module-rule-injection-failed');
  assert.doesNotMatch(JSON.stringify(result.run), /runtime module system/i);
  assert.throws(() => parseArgs(['--project-id', 'pp-flow-module-failure', '--module-rules', 'false']), /unknown argument: --module-rules/);
});

test('runProjectPipelineFlow fails closed when lifecycle fails', () => {
  const root = tmp();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-fail1', runner: (args) => { if (args[0] === 'create') throw new Error('boom'); return 'ok'; } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'lifecycle-failed');
  assert.equal(result.no_fallback, true);
});
