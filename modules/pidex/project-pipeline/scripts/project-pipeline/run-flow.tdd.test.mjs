import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProjectPipelineFlow, parseCredentialEntries } from './run-flow.mjs';

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

test('runProjectPipelineFlow returns no_fallback envelope when agent runner throws', () => {
  const root = tmp();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-agent1', agent: 'pidex-implementer', task: 'x', runner: (args) => { if (args[0] === 'exec' && args.includes('pi')) throw new Error('agent boom'); return 'ok'; } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'agent-run-failed');
  assert.equal(result.no_fallback, true);
  assert.match(result.reason, /agent boom/);
});

test('runProjectPipelineFlow fails closed when lifecycle fails', () => {
  const root = tmp();
  const result = runProjectPipelineFlow({ pidexRoot: root, projectId: 'pp-flow-fail1', runner: (args) => { if (args[0] === 'create') throw new Error('boom'); return 'ok'; } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'lifecycle-failed');
  assert.equal(result.no_fallback, true);
});
