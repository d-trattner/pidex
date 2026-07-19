#!/usr/bin/env node
import assert from 'node:assert/strict';
import { closeReviewWithTbr, renderTbrItem, validateReviewOutcome } from './tbr.mjs';

const immediate = {
  findingId: 'F-canonical', relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate',
  title: 'Canonical immediate finding', shortDescription: 'Structured finding deferred from current gate.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.',
};
const active = { findingId: 'F-assigned', relation: 'assigned', class: 'Product', reproductionState: 'not_tested', causedByCorrection: false, severity: 'Info', disposition: 'active' };

const accepted = validateReviewOutcome({ verdict: 'REJECTED', findings: [active, immediate] }, 'code-review');
assert.equal(accepted.ok, true);
assert.deepEqual(accepted.value.active.map((finding) => finding.findingId), ['F-assigned']);
assert.deepEqual(accepted.value.immediateTbr.map((finding) => finding.findingId), ['F-canonical']);
for (const invalid of [
  { ...immediate, id: immediate.findingId, findingId: undefined },
  { ...immediate, relation: 'existing' },
  { ...immediate, relation: 'fix-induced' },
  { ...immediate, reproduced: true },
  { ...immediate, causal: true },
  { ...immediate, unknown: true },
  { ...immediate, disposition: 'active' },
]) assert.equal(validateReviewOutcome({ verdict: 'REJECTED', findings: [active, invalid] }, 'code-review').ok, false, `must reject malformed canonical finding: ${JSON.stringify(invalid)}`);
assert.equal(validateReviewOutcome({ verdict: 'REJECTED', findings: [active, { ...active }] }, 'code-review').ok, false, 'duplicate finding IDs reject whole collection');
assert.equal(validateReviewOutcome({ verdict: 'REJECTED', findings: [{ ...immediate, findingId: 'F-conflict', disposition: 'active' }] }, 'code-review').ok, false, 'immediate-only rejection cannot mint active disposition');
let writes = 0;
assert.deepEqual(closeReviewWithTbr({ root: '/unused', identity: { reviewGate: 'code-review' }, outcome: { verdict: 'REJECTED', findings: [{ ...immediate, id: 'legacy' }] }, write: () => { writes += 1; return { ok: true }; } }), { status: 'TBR_WRITE_BLOCKED' });
assert.equal(writes, 0, 'malformed collection rejects before writer side effect');

const rendered = renderTbrItem({
  stableTbrId: 'TBR-0123456789ab', status: 'open', title: 'Canonical item', findingClass: 'Product', proposedSeverity: 'High', reproductionState: 'reproduced', blockingScope: 'none', releaseRecommendation: 'none', originEpic: 'initiative-038', originPlan: 'plan-038', originRun: 'family-038', originGate: 'code-review', sourceFindingId: 'F-canonical', reviewArtifact: 'agents.output/code-review/038.md', createdAt: '2026-07-19T00:00:00.000Z', affectedIdentifiers: ['scripts/quality/tbr.mjs'], shortDescription: 'Structured finding deferred from current gate.', deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.',
});
assert.equal(rendered, `---
stableTbrId: TBR-0123456789ab
status: open
title: Canonical item
findingClass: Product
proposedSeverity: High
reproductionState: reproduced
blockingScope: none
releaseRecommendation: none
originEpic: initiative-038
originPlan: plan-038
originRun: family-038
originGate: code-review
sourceFindingId: F-canonical
reviewArtifact: agents.output/code-review/038.md
createdAt: 2026-07-19T00:00:00.000Z
affectedIdentifiers:
  - scripts/quality/tbr.mjs
---

## Short description

Structured finding deferred from current gate.

## Deferred reason

New finding cannot extend current gate.

## Smallest future analysis or disconfirming test

Validate canonical payload.

## Navigation

- Archive: [[../index]]
`);
console.log('tbr.mjs tests passed');
