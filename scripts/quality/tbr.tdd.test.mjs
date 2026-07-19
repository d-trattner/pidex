#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeReviewWithTbr, promoteTbr, renderTbrItem, validateReviewOutcome, writeTbr } from './tbr.mjs';

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
const archiveIdentity = { planId: 'plan-038', runFamilyId: 'family-038', reviewGate: 'code-review' };
const archiveRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-b2-'));
try {
  const first = writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [immediate] });
  assert.equal(first.ok, true);
  const [firstName] = readdirSync(path.join(archiveRoot, 'wiki/tbr/items'));
  const firstPath = path.join(archiveRoot, 'wiki/tbr/items', firstName);
  const original = readFileSync(firstPath, 'utf8');
  assert.equal(original, renderTbrItem(first.items[0]), 'writer must use canonical static renderer');
  assert.match(original, /^stableTbrId: TBR-[a-f0-9]{12}$/m);
  assert.ok(Buffer.byteLength(original, 'utf8') <= 8192);

  writeFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), 'stale index\n');
  const retry = writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [{ ...immediate, title: 'Slug must not change retry' }] });
  assert.equal(retry.ok, true);
  assert.equal(retry.created, false);
  assert.deepEqual(readdirSync(path.join(archiveRoot, 'wiki/tbr/items')), [firstName], 'retry preserves first path');
  assert.equal(readFileSync(firstPath, 'utf8'), original, 'retry preserves immutable origin and first write time');
  assert.match(readFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), 'utf8'), /Canonical immediate finding/);

  assert.equal(promoteTbr({ root: archiveRoot, stableTbrId: first.items[0].stableTbrId, userSelected: false, roadmapLink: '[[wiki/roadmap/candidates/TBR-0123456789ab]]' }).ok, false);
  const promoted = promoteTbr({ root: archiveRoot, stableTbrId: first.items[0].stableTbrId, userSelected: true, roadmapLink: '[[wiki/roadmap/candidates/TBR-0123456789ab]]', promotedAt: '2026-07-19T00:00:00.000Z' });
  assert.equal(promoted.ok, true);
  assert.equal(promoted.file, firstName, 'promotion must tombstone same first-write path');
  assert.match(readFileSync(firstPath, 'utf8'), /^status: promoted$/m);
  assert.match(readFileSync(firstPath, 'utf8'), /^roadmapCandidate: \[\[wiki\/roadmap\/candidates\/TBR-0123456789ab\]\]$/m);

  for (const finding of [
    { ...immediate, findingId: 'F-absolute', reviewArtifact: '/private/raw.log' },
    { ...immediate, findingId: 'F-traversal', affectedIdentifiers: ['scripts/../secret'] },
    { ...immediate, findingId: 'F-control', shortDescription: 'bad\u0007content' },
    { ...immediate, findingId: 'F-secret', deferredReason: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789' },
  ]) {
    const denied = writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [finding] });
    assert.equal(denied.ok, false);
    assert.match(denied.code, /^TBR_(?:ITEM_INVALID|PATH_INVALID|UNSAFE_CONTENT)$/);
  }
  const huge = { ...immediate, findingId: 'F-huge', affectedIdentifiers: Array.from({ length: 20 }, () => `src/${'🧪'.repeat(78)}`), shortDescription: 'x'.repeat(500), deferredReason: 'x'.repeat(500), nextAnalysisOrDisconfirmingTest: 'x'.repeat(500) };
  assert.deepEqual(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [huge] }), { ok: false, code: 'TBR_ITEM_TOO_LARGE' });
} finally { rmSync(archiveRoot, { recursive: true, force: true }); }

const symlinkRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-link-'));
const escaped = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-escape-'));
try {
  symlinkSync(escaped, path.join(symlinkRoot, 'wiki'));
  assert.deepEqual(writeTbr({ root: symlinkRoot, identity: archiveIdentity, findings: [immediate] }), { ok: false, code: 'TBR_PATH_INVALID' });
  assert.deepEqual(readdirSync(escaped), [], 'symlink path must not receive durable item');
} finally { rmSync(symlinkRoot, { recursive: true, force: true }); rmSync(escaped, { recursive: true, force: true }); }

console.log('tbr.mjs tests passed');
