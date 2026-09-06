import { timingSafeEqual } from 'node:crypto';

// @ts-expect-error JavaScript module manager owns the cross-platform activation transaction.
import { applyModuleAction } from '../../../scripts/modules/skill-resources.mjs';
import { PIDEX_ROOT } from './paths.ts';
import { jsonResponse } from './response.ts';

type ActionBody = { action?: unknown; module_id?: unknown; cascade?: unknown; dry_run?: unknown; expected_revision?: unknown; confirm?: unknown };
type ApplyAction = typeof applyModuleAction;
const receipts = new Map<string, { fingerprint: string; response: unknown }>();

function flag(name: string): boolean {
  return ['1', 'true', 'yes'].includes((process.env[name] || '').trim().toLowerCase());
}
function sameOrigin(request: Request, value: string | null): boolean {
  if (!value) return false;
  try { return new URL(value).origin === new URL(request.url).origin; } catch { return false; }
}
function tokenMatches(request: Request): boolean {
  const expected = process.env.PIDEX_MODULE_ACTION_TOKEN || '';
  if (Buffer.byteLength(expected) < 16) return false;
  const auth = request.headers.get('authorization') || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (request.headers.get('x-pidex-module-token') || '').trim();
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
function authorized(request: Request): boolean {
  if (!tokenMatches(request)) return false;
  const origin = request.headers.get('origin');
  return !origin || sameOrigin(request, origin);
}
function safeError(error: unknown): { status: number; code: string; error: string } {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'MODULE_STATE_CONFLICT') return { status: 409, code, error: 'Module state changed. Refresh and try again.' };
  if (code === 'MODULE_ACTION_BUSY') return { status: 409, code, error: 'Another module action is in progress.' };
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('enabled dependents:')) return { status: 409, code: 'DEPENDENTS_ENABLED', error: message };
  if (message.startsWith('locked module:')) return { status: 403, code: 'MODULE_LOCKED', error: message };
  if (message.startsWith('unknown module:')) return { status: 404, code: 'MODULE_NOT_FOUND', error: message };
  return { status: 500, code: 'MODULE_ACTION_FAILED', error: 'Module action failed; no unverified state was reported.' };
}

export async function moduleActionApiPost(request: Request, options: { pidexRoot?: string; applyAction?: ApplyAction } = {}): Promise<Response> {
  if (!flag('PIDEX_MODULE_ACTIONS_ENABLED')) return jsonResponse({ error: 'Module actions are disabled.', code: 'MODULE_ACTIONS_DISABLED' }, 403);
  if (!authorized(request)) return jsonResponse({ error: 'Module action access denied.', code: 'MODULE_ACTION_DENIED' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return jsonResponse({ error: 'application/json required', code: 'INVALID_CONTENT_TYPE' }, 415);
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > 8192) return jsonResponse({ error: 'Request too large.', code: 'REQUEST_TOO_LARGE' }, 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 8192) return jsonResponse({ error: 'Request too large.', code: 'REQUEST_TOO_LARGE' }, 413);
  let body: ActionBody;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    const allowed = new Set(['action', 'module_id', 'cascade', 'dry_run', 'expected_revision', 'confirm']);
    if (Object.keys(parsed).some((key) => !allowed.has(key))) return jsonResponse({ error: 'Unknown request field.', code: 'UNKNOWN_FIELD' }, 400);
    body = parsed as ActionBody;
  } catch { return jsonResponse({ error: 'Invalid JSON object.', code: 'INVALID_JSON' }, 400); }
  if (!['enable', 'disable'].includes(String(body.action))) return jsonResponse({ error: 'Invalid action.', code: 'INVALID_ACTION' }, 400);
  if (typeof body.module_id !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(body.module_id)) return jsonResponse({ error: 'Invalid module id.', code: 'INVALID_MODULE_ID' }, 400);
  if (typeof body.expected_revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.expected_revision)) return jsonResponse({ error: 'Valid expected revision required.', code: 'INVALID_REVISION' }, 400);
  if (body.cascade !== undefined && typeof body.cascade !== 'boolean') return jsonResponse({ error: 'Invalid cascade flag.', code: 'INVALID_CASCADE' }, 400);
  if (body.dry_run !== true && body.confirm !== true) return jsonResponse({ error: 'Explicit confirmation required.', code: 'CONFIRMATION_REQUIRED' }, 400);

  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) return jsonResponse({ error: 'Valid Idempotency-Key required.', code: 'INVALID_IDEMPOTENCY_KEY' }, 400);
  const fingerprint = JSON.stringify(body);
  const prior = receipts.get(key);
  if (prior && prior.fingerprint !== fingerprint) return jsonResponse({ error: 'Idempotency key reused for different request.', code: 'IDEMPOTENCY_CONFLICT' }, 409);
  if (prior) return jsonResponse(prior.response);

  try {
    const result = (options.applyAction || applyModuleAction)({ pidexRoot: options.pidexRoot || PIDEX_ROOT, action: body.action as 'enable' | 'disable', moduleId: body.module_id, cascade: body.cascade === true, dryRun: body.dry_run === true, expectedRevision: body.expected_revision });
    const payload = { ...result, registration: result.reload_required ? 'unverified' : 'not-applicable' };
    receipts.set(key, { fingerprint, response: payload });
    if (receipts.size > 256) receipts.delete(receipts.keys().next().value as string);
    return jsonResponse(payload);
  } catch (error) {
    const safe = safeError(error);
    return jsonResponse({ error: safe.error, code: safe.code }, safe.status);
  }
}

export function rejectModuleActionWrite(): Response {
  return jsonResponse({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405);
}
