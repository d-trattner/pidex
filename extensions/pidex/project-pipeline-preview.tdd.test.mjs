import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./index.ts');

test('/pdproject preview parser preserves command tail after --', () => {
  assert.deepEqual(mod.parsePdProjectArgs('preview start pp-demo-abc123 -- pnpm dev -- --host 0.0.0.0 --port $PORT'), {
    command: 'preview',
    action: 'start',
    projectId: 'pp-demo-abc123',
    commandArgs: ['pnpm', 'dev', '--', '--host', '0.0.0.0', '--port', '$PORT'],
  });
});

test('/pdproject preview parser validates status/logs/stop shape', () => {
  assert.deepEqual(mod.parsePdProjectArgs('preview status pp-demo-abc123'), { command: 'preview', action: 'status', projectId: 'pp-demo-abc123' });
  assert.deepEqual(mod.parsePdProjectArgs('preview logs --project-id pp-demo-abc123'), { command: 'preview', action: 'logs', projectId: 'pp-demo-abc123' });
  assert.deepEqual(mod.parsePdProjectArgs('preview stop pp-demo-abc123'), { command: 'preview', action: 'stop', projectId: 'pp-demo-abc123' });
  assert.throws(() => mod.parsePdProjectArgs('preview start pp-demo-abc123'), /requires -- command/);
  assert.throws(() => mod.parsePdProjectArgs('preview logs pp-demo-abc123 -- tail'), /does not accept a command/);
});

test('preview summaries are concise and safe', () => {
  const start = mod.summarizePreviewStart({ ok: true, project_id: 'pp-demo-abc123', operator_url: 'http://localhost:42000', host_bind: '127.0.0.1' });
  assert.match(start, /Preview ready for pp-demo-abc123/);
  assert.match(start, /http:\/\/localhost:42000/);
  assert.doesNotMatch(start, /0\.0\.0\.0|docker|pidex-secrets|auth\.json|\{/);
  const remote = mod.summarizePreviewStart({ ok: true, project_id: 'pp-demo-abc123', operator_url: 'http://192.0.2.5:42000', host_bind: '0.0.0.0', exposure_note: 'Exposure: preview is bound to all interfaces on this Docker host. PIDEX did not open firewalls or tunnels.' });
  assert.match(remote, /all interfaces/);
  assert.doesNotMatch(remote.split('\n')[1], /0\.0\.0\.0/);
});
