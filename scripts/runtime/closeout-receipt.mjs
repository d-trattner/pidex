import { createHash } from 'node:crypto';
import { canonicalJson } from './contracts.mjs';

export const RECOVERY_SCHEMA = 'pidex-closeout-v3';
export const RECOVERY_EVENTS = new Set(['pipeline_closeout_execution_pinned', 'pipeline_closeout_return_captured', 'pipeline_closeout_hook_started', 'pipeline_closeout_hook_finished', 'pipeline_closeout_abort']);
export const receiptHash = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const byteHash = value => createHash('sha256').update(value).digest('hex');
export const receiptKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
export const digestValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const artifactPathValid = value => typeof value === 'string' && /^agents\.output\/[A-Za-z0-9._/-]+\.md$/.test(value) && !value.split('/').some(p => ['', '.', '..'].includes(p));
const invalid = () => { throw new Error('PIPELINE_CLOSEOUT_HISTORY_INVALID'); };
function snapshotValid(value, expectedPath) {
  return receiptKeys(value, ['path', 'content', 'digest']) && artifactPathValid(value.path) && value.path === expectedPath && typeof value.content === 'string' && Buffer.byteLength(value.content) <= 128 * 1024 && byteHash(value.content) === value.digest;
}
export function returnValid(value, dispatch) {
  if (!receiptKeys(value, ['result', 'artifact', 'artifactError', 'executionEndDigest']) || !digestValid(value.executionEndDigest)) return false;
  const r = value.result;
  if (!receiptKeys(r, ['agent', 'provider', 'exitCode', 'aborted', 'timedOut', 'turnLimitHit', 'finalText']) || r.agent !== dispatch.actor || r.provider !== 'pi' || !Number.isInteger(r.exitCode) || r.exitCode < 0 || r.exitCode > 255 || !['aborted', 'timedOut', 'turnLimitHit'].every(k => typeof r[k] === 'boolean') || typeof r.finalText !== 'string' || Buffer.byteLength(r.finalText) > 128 * 1024) return false;
  return value.artifact === null ? value.artifactError === 'ARTIFACT_UNAVAILABLE' : value.artifactError === null && snapshotValid(value.artifact, dispatch.artifactPath);
}
export function foldRecoveryEvent(row, state) {
  const m = row.metadata; const d = state.dispatches.get(m.id);
  if (!d || d.schema !== RECOVERY_SCHEMA || m.schema !== RECOVERY_SCHEMA || d.status !== 'running') invalid();
  const common = ['schema', 'project', 'planId', 'pipelineId', 'id'];
  if (row.event_type === 'pipeline_closeout_abort') {
    if (!receiptKeys(m, common) || d.abort) invalid(); d.abort = true; return;
  }
  if (d.abort) invalid();
  if (row.event_type === 'pipeline_closeout_execution_pinned') {
    if (!receiptKeys(m, [...common, 'digest']) || !digestValid(m.digest) || d.executionStartDigest || d.receipt) invalid();
    d.executionStartDigest = m.digest; return;
  }
  if (row.event_type === 'pipeline_closeout_return_captured') {
    if (!receiptKeys(m, [...common, 'digest', 'receipt']) || !d.executionStartDigest || d.receipt || !returnValid(m.receipt, d) || receiptHash(m.receipt) !== m.digest) invalid();
    d.receipt = m.receipt; d.receiptDigest = m.digest; return;
  }
  if (!d.receipt || !receiptKeys(m, [...common, 'receiptDigest', ...(row.event_type === 'pipeline_closeout_hook_finished' ? ['disposition'] : [])]) || m.receiptDigest !== d.receiptDigest) invalid();
  if (row.event_type === 'pipeline_closeout_hook_started') {
    if (!d.hookRequired || d.hookState) invalid(); d.hookState = 'started'; return;
  }
  if (row.event_type === 'pipeline_closeout_hook_finished') {
    if (d.hookState !== 'started' || !['completed', 'deferred'].includes(m.disposition)) invalid(); d.hookState = 'finished'; d.hookDisposition = m.disposition; return;
  }
  invalid();
}
export function assertRecoverableEnd(dispatch, end) {
  if (dispatch.schema !== RECOVERY_SCHEMA) return;
  if (dispatch.abort || !dispatch.receipt) invalid();
  const r = dispatch.receipt.result;
  const success = r.exitCode === 0 && !r.aborted && !r.timedOut && !r.turnLimitHit;
  if (end.outcome === 'completed') {
    if (!success || !dispatch.receipt.artifact || (dispatch.hookRequired && dispatch.hookState !== 'finished') || canonicalJson(end.artifact) !== canonicalJson(dispatch.receipt.artifact)) invalid();
  } else if (success) invalid(); // invalid logical success is held, not a retry waiver
}
