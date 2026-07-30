import { BROWSER_SMOKE_STATUS } from './status.mjs';

export const BROWSER_SMOKE_REQUEST_SCHEMA_VERSION = 1;
export const BROWSER_SMOKE_ALLOWED_CHECK_TYPES = Object.freeze(['title', 'text', 'selector', 'url', 'console']);
export const BROWSER_SMOKE_SCHEMA2_ACTIONS = Object.freeze(['hover', 'focus', 'keyboard', 'scroll_into_view']);
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,120}$/;
const PHASE_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,180}$/;
const REQUESTER_RE = /^pidex-[a-z0-9-]+$/;
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9_.-]{2,80}$/;
const SAFE_SELECTOR_RE = /^[#.]?[A-Za-z][A-Za-z0-9_-]*(?:[ .>#][#.]?[A-Za-z][A-Za-z0-9_-]*){0,8}$/;
const VIEWPORT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const KEYS = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const fail = (status_reason, detail) => ({ ok: false, status: BROWSER_SMOKE_STATUS.BLOCKED_INFRA, status_reason, detail });
const nonEmptyString = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const selector = (value) => nonEmptyString(value, 200) && SAFE_SELECTOR_RE.test(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && KEYS(value, keys);
const validCapture = (value) => exactKeys(value, ['screenshot', 'console_errors']) && typeof value.screenshot === 'boolean' && typeof value.console_errors === 'boolean';

export function validateBrowserSmokeCheck(check, requester = '') {
  if (!check || typeof check !== 'object' || Array.isArray(check)) return fail('invalid-check', 'check must be object');
  const type = String(check.type || '');
  if (!BROWSER_SMOKE_ALLOWED_CHECK_TYPES.includes(type)) return fail('invalid-check-type', `unsupported check type: ${type}`);
  if (type === 'title' || type === 'text') return nonEmptyString(check.contains) ? { ok: true, check: { type, contains: check.contains } } : fail('invalid-check', `${type}.contains must be non-empty string`);
  if (type === 'selector') return selector(check.exists) ? { ok: true, check: { type, exists: check.exists } } : fail('invalid-selector', 'selector.exists is outside conservative selector grammar');
  if (type === 'url') {
    if (check.path_contains !== undefined && !nonEmptyString(check.path_contains, 200)) return fail('invalid-check', 'url.path_contains must be non-empty string');
    if (check.path_equals !== undefined && !nonEmptyString(check.path_equals, 200)) return fail('invalid-check', 'url.path_equals must be non-empty string');
    if (check.path_contains === undefined && check.path_equals === undefined) return fail('invalid-check', 'url check requires path_contains or path_equals');
    return { ok: true, check: { type, ...(check.path_contains !== undefined ? { path_contains: check.path_contains } : {}), ...(check.path_equals !== undefined ? { path_equals: check.path_equals } : {}) } };
  }
  return check.errors === 'none' ? { ok: true, check: { type, errors: 'none' } } : fail('invalid-check', 'console check requires errors=none');
}

function validateSchema2Operation(item, lane) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (lane === 'preconditions' || lane === 'checks') {
    if (item.type === 'selector_present') return exactKeys(item, ['type', 'selector']) && selector(item.selector);
    if (lane === 'preconditions') return item.type === 'auth_state' && exactKeys(item, ['type', 'authenticated_selector', 'login_selector']) && selector(item.authenticated_selector) && selector(item.login_selector);
    if (item.type === 'aria_describedby') return exactKeys(item, ['type', 'trigger_selector', 'description_selector']) && selector(item.trigger_selector) && selector(item.description_selector);
    if (item.type === 'dimension') return exactKeys(item, ['type', 'selector', 'property', 'operator', 'value']) && selector(item.selector) && ['scrollWidth', 'clientWidth'].includes(item.property) && ['eq', 'lte', 'gte'].includes(item.operator) && Number.isInteger(item.value) && item.value >= 0;
    if (item.type === 'bounding_box') return exactKeys(item, ['type', 'subject_selector', 'reference_selector', 'relation']) && selector(item.subject_selector) && selector(item.reference_selector) && ['contained_by', 'no_overlap', 'overlaps'].includes(item.relation);
    return item.type === 'console' && exactKeys(item, ['type', 'errors']) && item.errors === 'none';
  }
  if (item.type === 'hover' || item.type === 'focus') return exactKeys(item, ['type', 'selector']) && selector(item.selector);
  if (item.type === 'keyboard') return exactKeys(item, ['type', 'key']) || (exactKeys(item, ['type', 'key', 'selector']) && selector(item.selector)) ? ['Tab', 'Enter', 'Escape', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(item.key) : false;
  return item.type === 'scroll_into_view' && exactKeys(item, ['type', 'selector', 'block', 'inline']) && selector(item.selector) && ['start', 'center', 'end', 'nearest'].includes(item.block) && ['start', 'center', 'end', 'nearest'].includes(item.inline);
}

function validateSchema2(request) {
  if (!exactKeys(request, ['schema', 'requester', 'project_id', 'request_id', 'phase_run_id', 'created_at', 'preview', 'viewports', 'timeout_ms'])) return fail('invalid-request', 'schema2 request keys are closed');
  if (!REQUESTER_RE.test(request.requester) || !PROJECT_ID_RE.test(request.project_id) || !REQUEST_ID_RE.test(request.request_id) || !PHASE_RUN_ID_RE.test(request.phase_run_id) || !Number.isFinite(Date.parse(request.created_at))) return fail('invalid-request', 'schema2 identity invalid');
  if (!exactKeys(request.preview, ['managed', 'process']) || request.preview.managed !== true || !nonEmptyString(request.preview.process, 80)) return fail('invalid-preview', 'schema2 preview invalid');
  if (!Number.isInteger(request.timeout_ms) || request.timeout_ms < 1000 || request.timeout_ms > 60000) return fail('invalid-timeout', 'timeout_ms must be 1000..60000');
  if (!Array.isArray(request.viewports) || request.viewports.length < 1 || request.viewports.length > 4) return fail('invalid-viewports', 'viewports must contain 1..4 items');
  const ids = new Set();
  for (const viewport of request.viewports) {
    if (!exactKeys(viewport, ['id', 'width', 'height', 'route', 'preconditions', 'actions', 'checks', 'capture']) || !VIEWPORT_ID_RE.test(viewport.id) || ids.has(viewport.id) || !Number.isInteger(viewport.width) || viewport.width < 320 || viewport.width > 1920 || !Number.isInteger(viewport.height) || viewport.height < 320 || viewport.height > 1200 || typeof viewport.route !== 'string' || !viewport.route.startsWith('/') || viewport.route.startsWith('//') || new URL(viewport.route, 'http://pidex.invalid').origin !== 'http://pidex.invalid' || !validCapture(viewport.capture)) return fail('invalid-viewport', 'viewport shape invalid');
    ids.add(viewport.id);
    for (const lane of ['preconditions', 'actions', 'checks']) if (!Array.isArray(viewport[lane]) || !viewport[lane].every((item) => validateSchema2Operation(item, lane))) return fail('invalid-viewport-operation', `invalid ${lane}`);
    if (viewport.preconditions.length + viewport.actions.length + viewport.checks.length > 40) return fail('invalid-viewport-operation', 'maximum 40 operations per viewport');
  }
  return { ok: true, request: structuredClone(request) };
}

export function validateBrowserSmokeRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return fail('invalid-request', 'request must be object');
  if (request.schema === 2) return validateSchema2(request);
  if (request.schema !== BROWSER_SMOKE_REQUEST_SCHEMA_VERSION) return fail('invalid-request', `unsupported schema: ${request.schema}`);
  if (!REQUESTER_RE.test(String(request.requester || ''))) return fail('invalid-requester', 'requester must be pidex-*');
  if (!PROJECT_ID_RE.test(String(request.project_id || ''))) return fail('invalid-project-id', 'project_id invalid');
  if (!REQUEST_ID_RE.test(String(request.request_id || ''))) return fail('invalid-request-id', 'request_id invalid');
  if (!PHASE_RUN_ID_RE.test(String(request.phase_run_id || ''))) return fail('invalid-phase-run-id', 'phase_run_id invalid');
  const createdAt = Date.parse(String(request.created_at || ''));
  if (!Number.isFinite(createdAt)) return fail('invalid-created-at', 'created_at must be valid ISO timestamp');
  if (!request.preview || request.preview.managed !== true) return fail('invalid-preview', 'preview.managed must be true');
  const checks = Array.isArray(request.checks) ? request.checks : [];
  if (checks.length < 1 || checks.length > 25) return fail('invalid-checks', 'checks must contain 1..25 items');
  const validatedChecks = []; for (const check of checks) { const result = validateBrowserSmokeCheck(check, request.requester); if (!result.ok) return result; validatedChecks.push(result.check); }
  const timeoutMs = request.timeout_ms === undefined ? 10000 : Number(request.timeout_ms);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) return fail('invalid-timeout', 'timeout_ms must be 1000..60000');
  if (request.capture !== undefined && (!request.capture || typeof request.capture !== 'object' || Array.isArray(request.capture) || (request.capture.console_errors !== undefined && typeof request.capture.console_errors !== 'boolean') || (request.capture.screenshot !== undefined && typeof request.capture.screenshot !== 'boolean'))) return fail('invalid-console-errors', 'capture console_errors must be boolean');
  const capture = request.capture && typeof request.capture === 'object' ? { screenshot: request.capture.screenshot === true, console_errors: request.capture.console_errors !== false } : { screenshot: false, console_errors: true };
  return { ok: true, request: { schema: 1, requester: request.requester, project_id: request.project_id, request_id: request.request_id, phase_run_id: request.phase_run_id, created_at: new Date(createdAt).toISOString(), preview: { managed: true, process: String(request.preview.process || 'preview') }, checks: validatedChecks, capture, timeout_ms: timeoutMs, reason: nonEmptyString(request.reason || '', 500) ? request.reason : '' } };
}
