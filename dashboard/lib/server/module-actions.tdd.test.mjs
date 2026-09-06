import assert from 'node:assert/strict';

const { moduleActionApiPost } = await import('./module-actions.ts');
const revision = 'a'.repeat(64);
const body = { action: 'enable', module_id: 'pidex.dotnet', expected_revision: revision, confirm: true };
const request = (payload = body, headers = {}) => new Request('http://127.0.0.1:18777/api/modules', {
  method: 'POST',
  headers: { origin: 'http://127.0.0.1:18777', authorization: 'Bearer test-secret-1234567890', 'content-type': 'application/json', 'idempotency-key': `test-${Math.random().toString(36).slice(2)}-123456789`, ...headers },
  body: JSON.stringify(payload),
});
const parse = async (response) => ({ status: response.status, body: await response.json() });

const old = process.env.PIDEX_MODULE_ACTIONS_ENABLED;
const oldToken = process.env.PIDEX_MODULE_ACTION_TOKEN;
delete process.env.PIDEX_MODULE_ACTIONS_ENABLED;
assert.equal((await parse(await moduleActionApiPost(request()))).body.code, 'MODULE_ACTIONS_DISABLED');
process.env.PIDEX_MODULE_ACTIONS_ENABLED = '1'; process.env.PIDEX_MODULE_ACTION_TOKEN = 'test-secret-1234567890';

assert.equal((await parse(await moduleActionApiPost(request(body, { origin: 'https://evil.example' })))).body.code, 'MODULE_ACTION_DENIED');
assert.equal((await parse(await moduleActionApiPost(request(body, { authorization: '' })))).body.code, 'MODULE_ACTION_DENIED');
const tokenAllowed = await parse(await moduleActionApiPost(request(body), { applyAction: () => ({ ok: true, changed: false, actions: [], revision, reload_required: false }) }));
assert.equal(tokenAllowed.status, 200);
assert.equal((await parse(await moduleActionApiPost(request({ ...body, confirm: false })))).body.code, 'CONFIRMATION_REQUIRED');
assert.equal((await parse(await moduleActionApiPost(request({ ...body, module_id: '../../bad' })))).body.code, 'INVALID_MODULE_ID');
assert.equal((await parse(await moduleActionApiPost(request(null)))).body.code, 'INVALID_JSON');
assert.equal((await parse(await moduleActionApiPost(request({ ...body, extra: true })))).body.code, 'UNKNOWN_FIELD');

let calls = 0;
const applyAction = (input) => { calls += 1; assert.equal(input.moduleId, 'pidex.dotnet'); assert.equal(input.expectedRevision, revision); return { ok: true, changed: true, actions: [{ moduleId: input.moduleId }], revision: 'b'.repeat(64), reload_required: true }; };
const key = 'same-key-1234567890';
const first = await parse(await moduleActionApiPost(request(body, { 'idempotency-key': key }), { applyAction }));
const second = await parse(await moduleActionApiPost(request(body, { 'idempotency-key': key }), { applyAction }));
assert.equal(first.status, 200); assert.deepEqual(second.body, first.body); assert.equal(calls, 1);
const conflict = await parse(await moduleActionApiPost(request({ ...body, action: 'disable' }, { 'idempotency-key': key }), { applyAction }));
assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');

const stale = await parse(await moduleActionApiPost(request(), { applyAction: () => { throw Object.assign(new Error('internal path hidden'), { code: 'MODULE_STATE_CONFLICT' }); } }));
assert.equal(stale.status, 409); assert.equal(stale.body.code, 'MODULE_STATE_CONFLICT'); assert.doesNotMatch(stale.body.error, /internal path/);
const failed = await parse(await moduleActionApiPost(request(), { applyAction: () => { throw new Error('/secret/path pi stderr'); } }));
assert.equal(failed.status, 500); assert.equal(failed.body.code, 'MODULE_ACTION_FAILED'); assert.doesNotMatch(failed.body.error, /secret/);

if (oldToken === undefined) delete process.env.PIDEX_MODULE_ACTION_TOKEN; else process.env.PIDEX_MODULE_ACTION_TOKEN = oldToken;
if (old === undefined) delete process.env.PIDEX_MODULE_ACTIONS_ENABLED; else process.env.PIDEX_MODULE_ACTIONS_ENABLED = old;
console.log('dashboard module action tests passed');
