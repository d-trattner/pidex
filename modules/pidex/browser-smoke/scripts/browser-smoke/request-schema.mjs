import { BROWSER_SMOKE_STATUS } from './status.mjs';

export const BROWSER_SMOKE_REQUEST_SCHEMA_VERSION = 1;
export const BROWSER_SMOKE_ALLOWED_CHECK_TYPES = Object.freeze(['title', 'text', 'selector', 'url', 'console']);
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,120}$/;
const PHASE_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,180}$/;
const REQUESTER_RE = /^pidex-[a-z0-9-]+$/;
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9_.-]{2,80}$/;
const SAFE_SELECTOR_RE = /^[#.]?[A-Za-z][A-Za-z0-9_-]*(?:[ .>#][#.]?[A-Za-z][A-Za-z0-9_-]*){0,8}$/;

function fail(reason, detail) {
  return { ok: false, status: BROWSER_SMOKE_STATUS.BLOCKED_INFRA, status_reason: reason, detail };
}

function nonEmptyString(value, max = 500) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function validateBrowserSmokeCheck(check, requester = '') {
  if (!check || typeof check !== 'object' || Array.isArray(check)) return fail('invalid-check', 'check must be object');
  const type = String(check.type || '');
  if (!BROWSER_SMOKE_ALLOWED_CHECK_TYPES.includes(type)) return fail('invalid-check-type', `unsupported check type: ${type}`);
  if (type === 'title' || type === 'text') {
    if (!nonEmptyString(check.contains)) return fail('invalid-check', `${type}.contains must be non-empty string`);
    return { ok: true, check: { type, contains: check.contains } };
  }
  if (type === 'selector') {
    if (!nonEmptyString(check.exists, 200) || !SAFE_SELECTOR_RE.test(check.exists)) return fail('invalid-selector', 'selector.exists is outside conservative selector grammar');
    return { ok: true, check: { type, exists: check.exists } };
  }
  if (type === 'url') {
    if (check.path_contains !== undefined && !nonEmptyString(check.path_contains, 200)) return fail('invalid-check', 'url.path_contains must be non-empty string');
    if (check.path_equals !== undefined && !nonEmptyString(check.path_equals, 200)) return fail('invalid-check', 'url.path_equals must be non-empty string');
    if (check.path_contains === undefined && check.path_equals === undefined) return fail('invalid-check', 'url check requires path_contains or path_equals');
    return { ok: true, check: { type, ...(check.path_contains !== undefined ? { path_contains: check.path_contains } : {}), ...(check.path_equals !== undefined ? { path_equals: check.path_equals } : {}) } };
  }
  if (type === 'console') {
    if (check.errors !== 'none') return fail('invalid-check', 'console check requires errors=none');
    return { ok: true, check: { type, errors: 'none' } };
  }
  return fail('invalid-check-type', `unsupported check type: ${type}`);
}

export function validateBrowserSmokeRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return fail('invalid-request', 'request must be object');
  if (request.schema !== BROWSER_SMOKE_REQUEST_SCHEMA_VERSION) return fail('invalid-request', `unsupported schema: ${request.schema}`);
  if (!REQUESTER_RE.test(String(request.requester || ''))) return fail('invalid-requester', 'requester must be pidex-*');
  if (!PROJECT_ID_RE.test(String(request.project_id || ''))) return fail('invalid-project-id', 'project_id invalid');
  if (!REQUEST_ID_RE.test(String(request.request_id || ''))) return fail('invalid-request-id', 'request_id invalid');
  if (!PHASE_RUN_ID_RE.test(String(request.phase_run_id || ''))) return fail('invalid-phase-run-id', 'phase_run_id invalid');
  const createdAt = Date.parse(String(request.created_at || ''));
  if (!Number.isFinite(createdAt)) return fail('invalid-created-at', 'created_at must be ISO timestamp');
  if (!request.preview || request.preview.managed !== true) return fail('invalid-preview', 'preview.managed must be true');
  const checks = Array.isArray(request.checks) ? request.checks : [];
  if (checks.length < 1 || checks.length > 25) return fail('invalid-checks', 'checks must contain 1..25 items');
  const validatedChecks = [];
  for (const check of checks) {
    const result = validateBrowserSmokeCheck(check, request.requester);
    if (!result.ok) return result;
    validatedChecks.push(result.check);
  }
  const timeoutMs = request.timeout_ms === undefined ? 10000 : Number(request.timeout_ms);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) return fail('invalid-timeout', 'timeout_ms must be 1000..60000');
  const capture = request.capture && typeof request.capture === 'object' && !Array.isArray(request.capture)
    ? { screenshot: request.capture.screenshot === true, console_errors: request.capture.console_errors !== false }
    : { screenshot: false, console_errors: true };
  return {
    ok: true,
    request: {
      schema: BROWSER_SMOKE_REQUEST_SCHEMA_VERSION,
      requester: request.requester,
      project_id: request.project_id,
      request_id: request.request_id,
      phase_run_id: request.phase_run_id,
      created_at: new Date(createdAt).toISOString(),
      preview: { managed: true, process: String(request.preview.process || 'preview') },
      checks: validatedChecks,
      capture,
      timeout_ms: timeoutMs,
      reason: nonEmptyString(request.reason || '', 500) ? request.reason : '',
    },
  };
}
