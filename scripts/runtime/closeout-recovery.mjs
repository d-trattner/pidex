import { randomUUID } from 'node:crypto';
import { readBounded } from './io.mjs';
import { inspectExecution } from './review-execution.mjs';
import { RECOVERY_SCHEMA, receiptHash, byteHash, receiptKeys, artifactPathValid, digestValid, returnValid } from './closeout-receipt.mjs';
import { CLOSEOUT_START, CLOSEOUT_END, CLOSEOUT_PUBLISHERS, POST_RETRO_AGENTS, foldCloseoutObligations, closeoutResultRouting } from './closeout-obligations.mjs';
const fail = code => { throw new Error(code); };
export function validateCloseoutRequest(request) {
  const keys = ['action', 'planId', 'pipelineId', 'artifactPath', ...(request?.action === 'resume' ? ['dispatchId'] : [])];
  if (!receiptKeys(request, keys) || !['start', 'resume'].includes(request.action) || typeof request.planId !== 'string' || typeof request.pipelineId !== 'string' || !/^plan-[0-9]{1,40}$/.test(request.planId) || !/^[a-zA-Z0-9._-]{1,160}$/.test(request.pipelineId) || !artifactPathValid(request.artifactPath) || (request.action === 'resume' && (typeof request.dispatchId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(request.dispatchId)))) fail('PIPELINE_CLOSEOUT_REQUEST_INVALID');
}
const closeoutExecutionBinding = (context, dispatch) => ({ kind: 'closeout', project: context.project, pipelineId: context.pipelineId, planId: context.planId, dispatchId: dispatch.id, actor: dispatch.actor, scope: dispatch.scope });
function lookup(rows, context, id) {
  const state = foldCloseoutObligations(rows, context); const dispatch = state.dispatches.get(id);
  if (!dispatch || dispatch.schema !== RECOVERY_SCHEMA) fail('PIPELINE_CLOSEOUT_RECOVERY_UNAVAILABLE');
  return { state, dispatch };
}
function validateResult(d) {
  if (!d.receipt) fail('PIPELINE_CLOSEOUT_RETURN_UNCONFIRMED');
  const r = d.receipt.result;
  if (r.aborted) fail('PIPELINE_CLOSEOUT_ABORT_HOLD');
  if (r.exitCode !== 0 || r.timedOut || r.turnLimitHit) return null;
  if (!d.receipt.artifact) fail('PIPELINE_CLOSEOUT_ARTIFACT_INVALID');
  const parsed = closeoutResultRouting(d.actor, r.finalText, d.receipt.artifact.content);
  if (parsed.dispatchId !== d.id || parsed.path !== d.artifactPath || JSON.stringify([...parsed.consumes].sort()) !== JSON.stringify([...d.consumes].sort())) fail('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
  if (!(d.actor === 'pidex-retrospective' ? parsed.verdict === 'COMPLETE' : ['COMPLETE', 'APPROVED', ...(d.actor === 'pidex-pi' ? ['DEFERRED'] : [])].includes(parsed.verdict))) fail('PIPELINE_CLOSEOUT_VERDICT_INVALID');
  return parsed;
}
export function describeCloseoutRecovery({ rows, context, stateRoot, dispatchId, scope }) {
  const { dispatch: d } = lookup(rows, context, dispatchId);
  let status; let physical;
  if (scope && scope !== d.scope) status = 'scope_changed';
  else if (d.abort || d.receipt?.result.aborted) status = 'abort_hold';
  else if (d.status === 'completed') status = 'completed';
  else if (d.status === 'failed') status = 'failed_no_automatic_retry';
  else if (!d.receipt) {
    physical = inspectExecution(stateRoot, closeoutExecutionBinding(context, d), d.executionStartDigest);
    status = physical.status === 'running' ? 'running' : 'uncertain';
  } else {
    try { validateResult(d); status = d.hookState === 'started' ? 'hook_unconfirmed' : 'continuation_pending'; }
    catch { status = 'returned_invalid'; }
  }
  return { dispatchId: d.id, actor: d.actor, planId: context.planId, pipelineId: context.pipelineId, status, scopeCheck: scope ? (scope === d.scope ? 'matched' : 'changed') : 'not_evaluated', requiredRuntimeScope: d.scope, receiptDigest: d.receiptDigest ?? null, modelCallsAllowed: 0, automaticRetryRemaining: 0, physicalStatus: physical?.status ?? 'not_rechecked', cleanup: d.receipt ? 'quiescence_verified_at_capture' : ['finished', 'failed', 'aborted'].includes(physical?.status) ? 'quiescence_verified' : 'unconfirmed' };
}

// Authority I/O is supplied by event.mjs under its existing selection lock.
// No global lookup, independent mutable status database or public event backdoor.
export function createCloseoutRecovery({ stateRoot, context, actor, request, scope, mutate, append }) {
  validateCloseoutRequest(request);
  if (process.platform !== 'linux' || !digestValid(scope) || ![...CLOSEOUT_PUBLISHERS, ...POST_RETRO_AGENTS].includes(actor)) fail('PIPELINE_CLOSEOUT_RECOVERY_UNCOVERED');
  if (request.planId !== context.planId || request.pipelineId !== context.pipelineId) fail('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
  const id = request.action === 'start' ? randomUUID() : request.dispatchId;
  const common = { schema: RECOVERY_SCHEMA, ...context, id };
  const commit = (authority, event_type, extra = {}) => {
    const row = { timestamp: new Date().toISOString(), event_type, metadata: { ...common, ...extra } };
    const state = foldCloseoutObligations([...authority.rows, row], context);
    append(authority.stream, row); return state.dispatches.get(id);
  };
  const get = () => mutate(a => lookup(a.rows, context, id).dispatch);
  const original = mutate(a => {
    if (request.action === 'resume') {
      const d = lookup(a.rows, context, id).dispatch;
      if (d.actor !== actor || d.scope !== scope || d.artifactPath !== request.artifactPath) fail('PIPELINE_CLOSEOUT_SCOPE_CHANGED');
      return d;
    }
    const state = foldCloseoutObligations(a.rows, context);
    if ([...state.dispatches.values()].some(d => d.actor === actor && d.schema === RECOVERY_SCHEMA)) fail('PIPELINE_CLOSEOUT_ALREADY_DISPATCHED');
    if (!CLOSEOUT_PUBLISHERS.has(actor) && ![...state.obligations.values()].some(o => o.status === 'pending' && o.actor === actor)) fail('PIPELINE_CLOSEOUT_HANDOFF_NOT_REQUIRED');
    const consumes = [...state.obligations.values()].filter(o => o.status === 'pending' && o.actor === actor);
    return commit(a, CLOSEOUT_START, { actor, roundId: consumes[0]?.roundId ?? id, consumes: consumes.map(o => o.id), scope, artifactPath: request.artifactPath, hookRequired: actor === 'pidex-retrospective' });
  });
  const instruction = `\nPIDEX RECOVERABLE CLOSEOUT: write ${original.artifactPath}. In BOTH artifact and final ROUTING echo closeout_dispatch: ${id} and closeout_obligations: ${original.consumes.join(', ') || 'none'}. IDs belong to this invocation only. Retrospective COMPLETE routes to pidex-pi; PI COMPLETE/DEFERRED and consumers COMPLETE/APPROVED route to orchestrator. Publishers must declare post_retro_handoffs: none or a comma-separated subset of pidex-planner, pidex-roadmap, pidex-architect. Nonempty ATX Planning Insights/Roadmap Updates/Architecture Patterns require those corresponding handoffs, even with none. Empty or None. sections do not. No configuration adoption is authorized.\n`;
  return {
    id, instruction, executionBinding: closeoutExecutionBinding(context, original),
    isCaptured: () => Boolean(get().receipt),
    pinStart({ executionStartDigest }) { if (request.action !== 'start') fail('PIPELINE_CLOSEOUT_CAPTURE_FORBIDDEN'); mutate(a => commit(a, 'pipeline_closeout_execution_pinned', { digest: executionStartDigest })); },
    abort() { mutate(a => { const d = lookup(a.rows, context, id).dispatch; if (d.status === 'running' && !d.abort) commit(a, 'pipeline_closeout_abort'); }); },
    capture(result) {
      if (request.action !== 'start') fail('PIPELINE_CLOSEOUT_CAPTURE_FORBIDDEN');
      mutate(a => {
        const d = lookup(a.rows, context, id).dispatch;
        if (d.receipt || d.status !== 'running' || d.abort) fail('PIPELINE_CLOSEOUT_RETURN_REPLAYED');
        const physical = inspectExecution(stateRoot, closeoutExecutionBinding(context, d), d.executionStartDigest);
        if (!['finished', 'failed', 'aborted'].includes(physical.status)) fail('PIPELINE_CLOSEOUT_EXECUTION_UNCONFIRMED');
        if (physical.status === 'aborted') { commit(a, 'pipeline_closeout_abort'); fail('PIPELINE_CLOSEOUT_ABORT_HOLD'); }
        if (result?.provider !== 'pi') fail('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
        const r = { agent: result?.agent, provider: 'pi', exitCode: result?.exitCode, aborted: Boolean(result?.aborted), timedOut: Boolean(result?.timedOut), turnLimitHit: Boolean(result?.turnLimitHit), finalText: result?.finalText };
        if ((physical.status === 'failed' && r.exitCode === 0) || (physical.reason === 'timeout' && !r.timedOut) || (physical.reason === 'turn_limit' && !r.turnLimitHit)) fail('PIPELINE_CLOSEOUT_EXECUTION_MISMATCH');
        let artifact = null;
        try { const bytes = readBounded(context.project, d.artifactPath, 128 * 1024).bytes; const content = bytes.toString('utf8'); if (Buffer.from(content).equals(bytes)) artifact = { path: d.artifactPath, content, digest: byteHash(bytes) }; } catch { /* record an explicitly incomplete snapshot, never search elsewhere */ }
        const receipt = { result: r, artifact, artifactError: artifact ? null : 'ARTIFACT_UNAVAILABLE', executionEndDigest: physical.receiptDigest };
        if (!returnValid(receipt, d)) fail('PIPELINE_CLOSEOUT_RECEIPT_INVALID');
        commit(a, 'pipeline_closeout_return_captured', { receipt, digest: receiptHash(receipt) });
      });
    },
    async complete(hook) {
      let d = get();
      if (d.abort || d.receipt?.result.aborted) fail('PIPELINE_CLOSEOUT_ABORT_HOLD');
      if (d.status === 'completed' || d.status === 'failed') {
        const pendingObligations = mutate(a => [...foldCloseoutObligations(a.rows, context).obligations.values()].filter(o => o.status === 'pending').map(o => ({ id: o.id, actor: o.actor })));
        return { ...d.receipt.result, closeoutCompletion: { status: d.status === 'completed' ? 'dispatch_completed' : 'dispatch_failed', dispatchId: id, pendingObligations, learningDisposition: d.hookDisposition ?? 'not_applicable', replayed: true }, replayed: true };
      }
      const parsed = validateResult(d);
      const physical = inspectExecution(stateRoot, closeoutExecutionBinding(context, d), d.executionStartDigest);
      if (!['finished', 'failed'].includes(physical.status) || physical.receiptDigest !== d.receipt.executionEndDigest) fail('PIPELINE_CLOSEOUT_EXECUTION_UNCONFIRMED');
      if (parsed && d.hookRequired && d.hookState !== 'finished') {
        if (d.hookState === 'started') fail('PIPELINE_CLOSEOUT_HOOK_UNCONFIRMED');
        if (typeof hook !== 'function') fail('PIPELINE_CLOSEOUT_HOOK_REQUIRED');
        mutate(a => commit(a, 'pipeline_closeout_hook_started', { receiptDigest: d.receiptDigest }));
        // Throw/crash leaves started: do not replay possibly committed side effects.
        const disposition = await hook({ ...d.receipt.result }, d.receipt.artifact.content);
        if (!['completed', 'deferred'].includes(disposition)) fail('PIPELINE_CLOSEOUT_HOOK_UNCONFIRMED');
        d = mutate(a => commit(a, 'pipeline_closeout_hook_finished', { receiptDigest: d.receiptDigest, disposition }));
      }
      const end = { outcome: parsed ? 'completed' : 'failed', artifact: parsed ? d.receipt.artifact : null, verdict: parsed?.verdict ?? null, requests: parsed?.requests ?? [] };
      mutate(a => {
        const current = lookup(a.rows, context, id).dispatch;
        if (current.status === 'completed' || current.status === 'failed') return;
        commit(a, CLOSEOUT_END, end);
      });
      const pending = mutate(a => [...foldCloseoutObligations(a.rows, context).obligations.values()].filter(o => o.status === 'pending').map(o => ({ id: o.id, actor: o.actor })));
      return { ...d.receipt.result, replayed: request.action === 'resume', closeoutCompletion: { status: parsed ? 'dispatch_completed' : 'dispatch_failed', dispatchId: id, pendingObligations: pending, learningDisposition: d.hookDisposition ?? 'not_applicable', replayed: request.action === 'resume' } };
    },
  };
}
