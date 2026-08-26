import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assembleImpactEvaluatorInput, buildExpectedCurrentFromApi09, buildImpactLifecycleResult, linkImpactEvaluationReplacement, parseImpactEvaluationBytes, readTrustedImpactEvaluationPrior, readTrustedImpactEvaluationReplacement, recordImpactEvaluation, recordTerminalImpactEvaluation } from './rule-impact-results.mjs';
import { evaluateRuleImpact, parseEvaluatorInputBytes } from './rule-impact-evaluator.mjs';
import { openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { policyBytes, policyDigest, policyForTier } from './rule-impact-policy.mjs';

const INPUT_ID = /^rule-impact-input:([a-f0-9]{64})$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BLOCKED = new Set(['measurement_schema_invalid', 'family_identity_missing', 'fingerprint_missing', 'workload_class_missing', 'impact_contract_unavailable', 'impact_contract_invalid', 'outcome_source_unavailable', 'outcome_invalid', 'outcome_not_final', 'epoch_history_unavailable', 'authority_drift']);
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function safe(result) { return Object.freeze(result); }
function owner() { return `cadence:${randomUUID()}`; }
function checkpointMatchesTarget(checkpoint, target) {
  if (!checkpoint || !target || !['global', 'project'].includes(target.tier)) return false;
  const policy = policyForTier(target.tier);
  return checkpoint.tier === target.tier && checkpoint.scope_id === (target.scope_id || '') && checkpoint.rule_id === target.rule_id && checkpoint.version_hash === target.version_hash && checkpoint.content_hash === target.content_hash && checkpoint.activation_epoch === target.activation_epoch && checkpoint.policy_id === policy.policy_id && checkpoint.policy_digest === policyDigest(target.tier);
}
function loadIndexedInput({ stateRoot, store, publicationIdentity, inputId }) {
  if (!INPUT_ID.test(inputId) || !publicationIdentity || !store.readImpactInputReference?.({ ...publicationIdentity, input_id: inputId })) return null;
  const file = path.join(stateRoot, 'quality', 'rule-impact-input', `${inputId.slice('rule-impact-input:'.length)}.json`);
  if (!existsSync(file)) return null;
  try {
    const bytes = readFileSync(file); const payload = JSON.parse(bytes);
    if (hash(bytes) !== inputId.slice('rule-impact-input:'.length) || payload?.schema !== 'rule-impact-input-v1' || payload?.exposure_publication?.exposure_id !== publicationIdentity.exposure_id || payload.exposure_publication?.publication_digest !== publicationIdentity.publication_digest) return null;
    return safe({ input_id: inputId, payload });
  } catch { return null; }
}
function currentMatches(input, current) {
  const target = input.payload?.resolver_boundary?.target_rule;
  if (!target || !current || current.schema !== 'pidex-rule-resolver-snapshot-v1' || current.quality !== 'verified' || !Array.isArray(current.active_rules)) return false;
  const match = current.active_rules.find((candidate) => candidate.rule_id === target.rule_id && candidate.tier === target.tier && candidate.scope_id === target.scope_id);
  return !!match && same(match, target) && same(current.source_heads, input.payload.resolver_boundary.source_heads) && same(current.mirror_heads, input.payload.resolver_boundary.mirror_heads) && current.projection_revision === input.payload.resolver_boundary.projection_revision;
}
function outwardTerminal(result) { return safe({ status: result.status, reason: result.reason }); }
function finishClaim({ store, claim, result, now }) {
  if (result.status === 'collecting' && result.reason === 'evaluation_pending') return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
  store.finishImpactCadence({ due_key: claim.due_key, lease_owner: claim.lease_owner, result: { ...result, due_key: claim.due_key }, now });
  return outwardTerminal(result);
}
function persistedEventDigest(events, effect) {
  const event = Array.isArray(events) && events.find((candidate) => candidate?.effect === effect && /^[a-f0-9]{64}$/.test(candidate.event_digest));
  return event?.event_digest || null;
}
function evaluatorLineage(artifact) {
  const lineage = artifact.lineage;
  return { tier: artifact.tier, scope_id: lineage.scope_id, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash, accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest, resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest, exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest, measurement_input_id: lineage.measurement_input_id, measurement_input_digest: lineage.measurement_input_digest, evaluation_input_digest: lineage.evaluation_input_digest };
}
function evaluatorMatchesFreshAuthority(input, fresh) {
  const source = input?.families?.[0]?.provenance;
  const target = input?.evaluated_target;
  return !!source && !!target && fresh && JSON.stringify(target) === JSON.stringify(fresh.target) && fresh.policy_id === source.policy_id && fresh.policy_digest === source.policy_digest && fresh.measurement_input_id === `rule-impact-input:${input.input_digest}` && fresh.measurement_input_digest === input.input_digest && fresh.evaluation_input_digest && source.resolver_snapshot_id === fresh.resolver_snapshot_id && source.resolver_snapshot_digest === fresh.resolver_snapshot_digest && source.exposure_id === fresh.exposure_id && source.exposure_publication_digest === fresh.exposure_publication_digest;
}
function evaluatorTerminal(evaluation) {
  return { status: evaluation.artifact.state === 'collecting' ? 'collecting' : 'evaluated', reason: evaluation.artifact.reason };
}

/** Selects closed LT authority from persisted intake, ER, event, and replacement records; never caller state flags. */
export function selectImpactLifecycleTransition({ input, prior, current, events, replacements, at } = {}) {
  const blocker = input?.collection_disposition === 'blocked' && BLOCKED.has(input.collection_reason) ? input.collection_reason : null;
  if (blocker) return safe({ outcome: 'transition', transition: safe({ kind: 'authority_blocked', reason: blocker }) });
  if (!prior) return safe({ outcome: 'pending' });
  if (!['collecting', 'frozen', 'inconclusive', 'repeated_observational_harm'].includes(prior.state) || !prior.lineage || !/^[a-f0-9]{64}$/.test(prior.lineage.policy_digest) || !/^[a-f0-9]{64}$/.test(prior.lineage.rule_version_hash) || typeof prior.lineage.activation_epoch !== 'string') return safe({ outcome: 'unavailable', reason: 'prior_terminal' });
  if (!current || !/^[a-f0-9]{64}$/.test(current.policy_digest) || !/^[a-f0-9]{64}$/.test(current.version_hash) || typeof current.activation_epoch !== 'string' || !INSTANT.test(at)) return safe({ outcome: 'unavailable', reason: 'authority_unavailable' });
  const policyEvent = persistedEventDigest(events, 'policy_changed');
  if (prior.lineage.policy_digest !== current.policy_digest && policyEvent) return safe({ outcome: 'transition', transition: safe({ kind: 'policy_changed', prior_policy_digest: prior.lineage.policy_digest, next_policy_digest: current.policy_digest, event_digest: policyEvent }) });
  const versionEvent = persistedEventDigest(events, 'target_version_changed');
  if (prior.lineage.rule_version_hash !== current.version_hash && versionEvent) return safe({ outcome: 'transition', transition: safe({ kind: 'target_version_changed', prior_version_hash: prior.lineage.rule_version_hash, next_version_hash: current.version_hash, event_digest: versionEvent }) });
  const epochEvent = persistedEventDigest(events, 'target_epoch_changed');
  if (prior.lineage.activation_epoch !== current.activation_epoch && epochEvent) return safe({ outcome: 'transition', transition: safe({ kind: 'target_epoch_changed', prior_activation_epoch: prior.lineage.activation_epoch, next_activation_epoch: current.activation_epoch, event_digest: epochEvent }) });
  const replacement = Array.isArray(replacements) && replacements.find((candidate) => candidate && candidate.result_id !== prior.result_id && candidate.result_digest !== prior.result_digest && /^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(candidate.result_id) && /^[a-f0-9]{64}$/.test(candidate.result_digest));
  if (replacement) return safe({ outcome: 'transition', transition: safe({ kind: 'result_replaced', next_result_id: replacement.result_id, next_result_digest: replacement.result_digest }) });
  // Policy expiry authority is canonically null; LT-06 cannot be selected.
  if (INSTANT.test(prior.expires_at) && Date.parse(at) >= Date.parse(prior.expires_at)) return safe({ outcome: 'transition', transition: safe({ kind: 'result_expired', expires_at: prior.expires_at }) });
  return safe({ outcome: 'pending' });
}

/** Runs only persisted due checkpoints through immutable input, fresh authority, and API-09 assembly. */
export function runRuleImpactCadence({ ordinary, stateRoot, store: suppliedStore, publicationIdentity, capture, currentAuthorityProvider, evaluationAt } = {}) {
  if (!ordinary) return safe({ status: 'skipped', reason: 'ordinary_required' });
  if (typeof stateRoot !== 'string' || !path.isAbsolute(stateRoot) || !publicationIdentity || !Array.isArray(capture?.target_input_ids) || typeof currentAuthorityProvider !== 'function') return safe({ status: 'blocked', reason: 'cadence_input_invalid' });
  let store = suppliedStore; let close = false;
  try {
    if (!store) { store = openRuleLifecycleStore({ stateRoot }); close = true; }
    if (!store?.readImpactCadenceConfig || !store?.listDueImpactCadence || !store?.claimDueImpactCadence || !store?.finishImpactCadence) return safe({ status: 'blocked', reason: 'cadence_input_invalid' });
    if (!store.readImpactCadenceConfig().enabled) return safe({ status: 'disabled', reason: 'cadence_disabled' });
    const at = evaluationAt && INSTANT.test(evaluationAt) ? evaluationAt : new Date().toISOString();
    const due = store.listDueImpactCadence({ now: at });
    if (!Array.isArray(due)) return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
    for (const checkpoint of due) {
      for (const inputId of capture.target_input_ids) {
        const input = loadIndexedInput({ stateRoot, store, publicationIdentity, inputId });
        const target = input?.payload?.resolver_boundary?.target_rule;
        if (!input || !checkpointMatchesTarget(checkpoint, target)) continue;
        const claim = store.claimDueImpactCadence({ checkpoint, input_id: input.input_id, lease_owner: owner(), now: at });
        if (claim.status === 'disabled') return safe({ status: 'disabled', reason: 'cadence_disabled' });
        if (claim.status === 'active') return safe({ status: 'active' });
        if (claim.status !== 'claimed') return outwardTerminal(claim);
        let suppliedAuthority = null; try { suppliedAuthority = currentAuthorityProvider(); } catch {}
        const resolverAuthority = suppliedAuthority?.resolver_snapshot || suppliedAuthority;
        const blockedReason = input.payload.collection_disposition === 'blocked' && BLOCKED.has(input.payload.collection_reason) ? input.payload.collection_reason : null;
        const api09Authority = suppliedAuthority?.api09 && suppliedAuthority?.freshAuthority ? suppliedAuthority : null;
        if (!blockedReason && api09Authority) {
          const fresh = api09Authority.freshAuthority;
          const selector = { tier: fresh.target?.tier, scope_id: fresh.target?.scope_id, rule_id: fresh.target?.rule_id, version_hash: fresh.target?.version_hash, content_hash: fresh.target?.content_hash, accepted_commit: fresh.target?.accepted_commit, activation_epoch: fresh.target?.activation_epoch, policy_id: fresh.policy_id, policy_digest: fresh.policy_digest, resolver_snapshot_id: fresh.resolver_snapshot_id, resolver_snapshot_digest: fresh.resolver_snapshot_digest, exposure_id: fresh.exposure_id, exposure_publication_digest: fresh.exposure_publication_digest, measurement_input_id: fresh.measurement_input_id, measurement_input_digest: fresh.measurement_input_digest, evaluation_input_digest: fresh.evaluation_input_digest, minimum_head_sequence: 1 };
          const prior = readTrustedImpactEvaluationPrior({ store, stateRoot, selector });
          if (prior.outcome !== 'available' && prior.reason !== 'prior_unavailable') return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
          if (prior.outcome === 'available') {
            const currentAuthority = buildExpectedCurrentFromApi09({ api09: api09Authority.api09, freshAuthority: fresh, verifiedPrior: prior, minimumHeadSequence: prior.head_sequence });
            if (currentAuthority.outcome === 'blocked') return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
            let parsedPrior; try { parsedPrior = parseImpactEvaluationBytes(prior.bytes).artifact; } catch { return safe({ status: 'unavailable', reason: 'cadence_unavailable' }); }
            const events = store.listLifecycleImpactEvents?.({ target: { tier: target.tier, scope_id: target.tier === 'global' ? '' : target.scope_id, rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch }, start_at: '1970-01-01T00:00:00.000Z', end_at: at }) || [];
            const replacement = readTrustedImpactEvaluationReplacement({ store, stateRoot, priorResultId: prior.result_id });
            const selected = selectImpactLifecycleTransition({ input: input.payload, prior: parsedPrior, current: currentAuthority, events, replacements: replacement.outcome === 'available' ? [{ result_id: replacement.next_result_id, result_digest: replacement.next_result_digest }] : [], at });
            if (selected.outcome === 'transition') {
              try {
                const result = buildImpactLifecycleResult({ tier: target.tier, transition: selected.transition, priorResultBytes: prior.bytes, currentAuthority, at });
                recordTerminalImpactEvaluation({ store, stateRoot, resultBytes: result.bytes, resultDigest: result.digest });
                return finishClaim({ store, claim, result: { status: result.artifact.state, reason: result.artifact.reason }, now: at });
              } catch { return safe({ status: 'unavailable', reason: 'cadence_unavailable' }); }
            }
          }
          if (api09Authority.api09.outcome !== 'ready') return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
          try {
            const input = parseEvaluatorInputBytes(api09Authority.api09.input_bytes, { expectedInputDigest: api09Authority.api09.evaluation_input_digest });
            if (!evaluatorMatchesFreshAuthority(input, fresh)) return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
            const evaluation = evaluateRuleImpact({ inputBytes: api09Authority.api09.input_bytes, evaluationInputDigest: api09Authority.api09.evaluation_input_digest, policyBytes: policyBytes(target.tier), policyDigest: policyDigest(target.tier), evaluationAt: checkpoint.due_at });
            const written = recordImpactEvaluation({ store, stateRoot, resultBytes: evaluation.bytes, resultDigest: evaluation.digest, expectedLineage: evaluatorLineage(evaluation.artifact) });
            if (prior.outcome === 'available' && written.result_id !== prior.result_id) {
              const linked = linkImpactEvaluationReplacement({ store, stateRoot, priorResultId: prior.result_id, nextResultId: written.result_id, linkedAt: checkpoint.due_at });
              if (!['linked', 'existing'].includes(linked.outcome)) return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
            }
            return finishClaim({ store, claim, result: evaluatorTerminal(evaluation), now: at });
          } catch { return safe({ status: 'unavailable', reason: 'cadence_unavailable' }); }
        }
        const fresh = currentMatches(input, resolverAuthority);
        if (blockedReason || !fresh) {
          try {
            const snapshotBytes = input.payload?.fresh_runtime?.resolver_snapshot_bytes;
            const snapshot = JSON.parse(snapshotBytes);
            const snapshotDigest = input.payload?.fresh_runtime?.resolver_snapshot_digest || hash(Buffer.from(snapshotBytes));
            const currentAuthority = { tier: target.tier, scope_id: target.tier === 'global' ? null : target.scope_id, rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, accepted_commit: target.accepted_commit, activation_epoch: target.activation_epoch, policy_id: checkpoint.policy_id, policy_digest: checkpoint.policy_digest, resolver_snapshot_id: snapshot.snapshot_id, resolver_snapshot_digest: snapshotDigest, exposure_id: input.payload.exposure_publication.exposure_id, exposure_publication_digest: input.payload.exposure_publication.publication_digest, measurement_input_id: input.input_id, measurement_input_digest: input.input_id.slice('rule-impact-input:'.length), evaluation_input_digest: input.input_id.slice('rule-impact-input:'.length), minimum_head_sequence: 1 };
            const safeLineage = { resolver_snapshot_id: currentAuthority.resolver_snapshot_id, resolver_snapshot_digest: currentAuthority.resolver_snapshot_digest, exposure_id: currentAuthority.exposure_id, exposure_publication_digest: currentAuthority.exposure_publication_digest, measurement_input_id: currentAuthority.measurement_input_id, measurement_input_digest: currentAuthority.measurement_input_digest, evaluation_input_digest: null, rule_id: currentAuthority.rule_id, rule_version_hash: currentAuthority.version_hash, rule_content_hash: currentAuthority.content_hash, accepted_commit: null, scope_id: currentAuthority.scope_id, activation_epoch: currentAuthority.activation_epoch, mirror_digest: target.mirror_digest, policy_id: currentAuthority.policy_id, policy_digest: currentAuthority.policy_digest };
            const selected = selectImpactLifecycleTransition({ input: input.payload, prior: null, current: { policy_digest: currentAuthority.policy_digest, version_hash: currentAuthority.version_hash, activation_epoch: currentAuthority.activation_epoch }, events: [], replacements: [], at });
            const reason = blockedReason || 'authority_drift';
            if (selected.outcome !== 'transition' && reason !== 'authority_drift') throw new Error('lifecycle');
            const result = buildImpactLifecycleResult({ tier: target.tier, transition: { kind: 'authority_blocked', reason, safe_lineage_subset: safeLineage }, priorResultBytes: null, currentAuthority, at });
            recordImpactEvaluation({ store, stateRoot, resultBytes: result.bytes, resultDigest: result.digest, expectedLineage: { tier: currentAuthority.tier, scope_id: currentAuthority.scope_id, rule_id: currentAuthority.rule_id, version_hash: currentAuthority.version_hash, content_hash: currentAuthority.content_hash, accepted_commit: null, activation_epoch: currentAuthority.activation_epoch, policy_id: currentAuthority.policy_id, policy_digest: currentAuthority.policy_digest, resolver_snapshot_id: currentAuthority.resolver_snapshot_id, resolver_snapshot_digest: currentAuthority.resolver_snapshot_digest, exposure_id: currentAuthority.exposure_id, exposure_publication_digest: currentAuthority.exposure_publication_digest, measurement_input_id: currentAuthority.measurement_input_id, measurement_input_digest: currentAuthority.measurement_input_digest, evaluation_input_digest: null } });
            return finishClaim({ store, claim, result: { status: 'blocked', reason }, now: at });
          } catch { return safe({ status: 'unavailable', reason: 'cadence_unavailable' }); }
        }
        const opening = store.readLifecycleImpactOpening?.({ target: { tier: target.tier, scope_id: target.tier === 'global' ? '' : target.scope_id, rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch } });
        const assembled = opening?.opened_at ? assembleImpactEvaluatorInput({ stateRoot, store, target, target_t0: opening.opened_at }) : { outcome: 'blocked' };
        if (assembled.outcome === 'ready') {
          if (!currentMatches(input, resolverAuthority)) return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
          try {
            const evaluatorInput = parseEvaluatorInputBytes(assembled.input_bytes, { expectedInputDigest: assembled.evaluation_input_digest });
            const provenance = evaluatorInput.families?.[0]?.provenance;
            const fresh = {
              target,
              policy_id: policyForTier(target.tier).policy_id,
              policy_digest: policyDigest(target.tier),
              resolver_snapshot_id: provenance?.resolver_snapshot_id,
              resolver_snapshot_digest: provenance?.resolver_snapshot_digest,
              exposure_id: provenance?.exposure_id,
              exposure_publication_digest: provenance?.exposure_publication_digest,
              measurement_input_id: assembled.measurement_input_id,
              measurement_input_digest: assembled.measurement_input_digest,
              evaluation_input_digest: assembled.evaluation_input_digest,
            };
            if (!evaluatorMatchesFreshAuthority(evaluatorInput, fresh)) return safe({ status: 'unavailable', reason: 'cadence_unavailable' });
            const evaluation = evaluateRuleImpact({ inputBytes: assembled.input_bytes, evaluationInputDigest: assembled.evaluation_input_digest, policyBytes: policyBytes(target.tier), policyDigest: policyDigest(target.tier), evaluationAt: checkpoint.due_at });
            recordImpactEvaluation({ store, stateRoot, resultBytes: evaluation.bytes, resultDigest: evaluation.digest, expectedLineage: evaluatorLineage(evaluation.artifact) });
            return finishClaim({ store, claim, result: evaluatorTerminal(evaluation), now: at });
          } catch { return safe({ status: 'unavailable', reason: 'cadence_unavailable' }); }
        }
        if (assembled.outcome === 'blocked' && BLOCKED.has(assembled.reason)) return finishClaim({ store, claim, result: { status: 'blocked', reason: assembled.reason }, now: at });
        return finishClaim({ store, claim, result: { status: 'unavailable', reason: 'cadence_unavailable' }, now: at });
      }
    }
    return safe({ status: 'blocked', reason: 'impact_input_unavailable' });
  } catch { return safe({ status: 'unavailable', reason: 'cadence_unavailable' }); }
  finally { if (close) try { store.close(); } catch {} }
}
