import path from 'node:path';
import { BROWSER_SMOKE_STATUS, isBrowserSmokeStatus } from './status.mjs';

function fail(reason, detail) {
  return { ok: false, status: BROWSER_SMOKE_STATUS.BLOCKED_INFRA, status_reason: reason, detail };
}

export function isSafeRelativeEvidencePath(value) {
  const text = String(value || '').replaceAll('\\', '/');
  return Boolean(text) && !/^[A-Za-z]:\//.test(text) && !text.startsWith('/') && !path.isAbsolute(text) && !text.split('/').some((part) => part === '..' || part === '');
}

export function validateBrowserSmokeResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return fail('invalid-result', 'result must be object');
  if (result.schema !== 1) return fail('invalid-result', `unsupported schema: ${result.schema}`);
  if (!isBrowserSmokeStatus(result.status)) return fail('invalid-status', `unsupported status: ${result.status}`);
  if (typeof result.status_reason !== 'string' || !result.status_reason) return fail('invalid-status-reason', 'status_reason required');
  for (const key of ['project_id', 'request_id', 'phase_run_id']) {
    if (typeof result[key] !== 'string' || !result[key]) return fail('invalid-result', `${key} required`);
  }
  if (result.screenshot !== undefined && result.screenshot !== '' && !isSafeRelativeEvidencePath(result.screenshot)) return fail('invalid-screenshot-path', 'screenshot path must be relative evidence path');
  if (!Array.isArray(result.checks)) return fail('invalid-checks', 'checks must be array');
  if (!Array.isArray(result.console_errors)) return fail('invalid-console-errors', 'console_errors must be array');
  return { ok: true, result };
}

export function buildBrowserSmokeResult(params = {}) {
  const status = params.status || (params.ok ? BROWSER_SMOKE_STATUS.PASS : BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  const result = {
    schema: 1,
    ok: status === BROWSER_SMOKE_STATUS.PASS,
    status,
    status_reason: params.status_reason || (status === BROWSER_SMOKE_STATUS.PASS ? 'all-checks-passed' : 'unspecified'),
    project_id: String(params.project_id || ''),
    request_id: String(params.request_id || ''),
    phase_run_id: String(params.phase_run_id || ''),
    preview_url_source: params.preview_url_source || 'project-pipeline-registry',
    url: params.url || '',
    checks: Array.isArray(params.checks) ? params.checks : [],
    console_errors: Array.isArray(params.console_errors) ? params.console_errors : [],
    screenshot: params.screenshot || '',
    started_at: params.started_at || new Date().toISOString(),
    ended_at: params.ended_at || new Date().toISOString(),
  };
  const validation = validateBrowserSmokeResult(result);
  if (!validation.ok) throw new Error(`invalid browser-smoke result: ${validation.status_reason}`);
  return result;
}
