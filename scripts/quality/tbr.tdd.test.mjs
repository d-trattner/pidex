#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
let approvedWrites = 0, approvedCompletes = 0;
assert.deepEqual(closeReviewWithTbr({
  root: '/unused', identity: { reviewGate: 'code-review' },
  outcome: { verdict: 'APPROVED', findings: [{ ...immediate, id: 'legacy' }] },
  write: () => { approvedWrites += 1; return { ok: true }; },
  complete: () => { approvedCompletes += 1; return { status: 'closed' }; },
}), { status: 'TBR_WRITE_BLOCKED' }, 'approved outcome must satisfy frozen schema before acceptance');
assert.equal(approvedWrites, 0, 'malformed approved outcome cannot write');
assert.equal(approvedCompletes, 0, 'malformed approved outcome cannot complete');
assert.deepEqual(closeReviewWithTbr({ root: '/unused', identity: { reviewGate: 'code-review' }, outcome: { verdict: 'APPROVED', findings: [] } }), { status: 'accepted' }, 'canonical approved outcome accepts');

let terminalWrites = 0, terminalCompletes = 0;
assert.deepEqual(closeReviewWithTbr({ root: '/unused', identity: { reviewGate: 'code-review' }, outcome: { verdict: 'REJECTED', findings: [active] }, write: () => { terminalWrites += 1; return { ok: true }; }, complete: () => { terminalCompletes += 1; return { status: 'closed' }; } }), { status: 'TBR_WRITE_BLOCKED' }, 'terminal active finding without archive evidence blocks close');
assert.equal(terminalWrites, 0);
assert.equal(terminalCompletes, 0);
const terminalActive = { ...active, title: 'Terminal active finding', shortDescription: 'Assigned finding needs terminal archive evidence.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'Terminal close requires archive evidence.', nextAnalysisOrDisconfirmingTest: 'Read archived active finding bytes.' };
const terminalRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-terminal-'));
try {
  let completeAfterArchive = false;
  assert.deepEqual(closeReviewWithTbr({ root: terminalRoot, identity: { planId: 'plan-038', runFamilyId: 'family-038', reviewGate: 'code-review' }, outcome: { verdict: 'REJECTED', findings: [terminalActive, immediate] }, complete: (outcome) => { completeAfterArchive = readdirSync(path.join(terminalRoot, 'wiki/tbr/items')).length === 2; return { status: outcome }; } }).status, 'CLOSED_WITH_TBR');
  assert.equal(completeAfterArchive, true, 'complete happens only after active and immediate archive writes');
  const terminalBytes = readdirSync(path.join(terminalRoot, 'wiki/tbr/items')).map((name) => readFileSync(path.join(terminalRoot, 'wiki/tbr/items', name), 'utf8')).join('');
  assert.match(terminalBytes, /^sourceFindingId: F-assigned$/m, 'terminal active finding is byte-persisted');
  assert.match(terminalBytes, /^title: Terminal active finding$/m, 'terminal active evidence is byte-persisted');
} finally { rmSync(terminalRoot, { recursive: true, force: true }); }

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
  rmSync(path.join(archiveRoot, 'wiki/tbr/index.md'));
  assert.equal(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [immediate] }).ok, true, 'retry rebuilds missing full index');
  assert.match(readFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), 'utf8'), /Canonical immediate finding/);
  writeFileSync(firstPath, renderTbrItem({ ...first.items[0], originPlan: 'plan-other' }));
  assert.deepEqual(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [immediate] }), { ok: false, code: 'TBR_COLLISION' }, 'immutable origin mismatch blocks overwrite');
  writeFileSync(firstPath, original);

  const safeIndex = readFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), 'utf8');
  writeFileSync(firstPath, original.replace('New finding cannot extend current gate.', 'Bearer abcdefghijklmnopqrstuvwxyz0123456789'));
  assert.deepEqual(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [immediate] }), { ok: false, code: 'TBR_ITEM_INVALID' }, 'unsafe canonical item cannot seed index repair');
  assert.equal(readFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), 'utf8'), safeIndex, 'unsafe item denial leaves index unchanged');
  writeFileSync(firstPath, original);
  const itemOutside = path.join(archiveRoot, 'outside-item.md');
  writeFileSync(itemOutside, original);
  rmSync(firstPath); symlinkSync(itemOutside, firstPath);
  assert.deepEqual(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [immediate] }), { ok: false, code: 'TBR_PATH_INVALID' }, 'item symlink blocks canonical read');
  rmSync(firstPath); writeFileSync(firstPath, original);
  const indexOutside = path.join(archiveRoot, 'outside-index.md');
  writeFileSync(indexOutside, safeIndex);
  rmSync(path.join(archiveRoot, 'wiki/tbr/index.md')); symlinkSync(indexOutside, path.join(archiveRoot, 'wiki/tbr/index.md'));
  assert.deepEqual(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: [immediate] }), { ok: false, code: 'TBR_PATH_INVALID' }, 'index symlink blocks index replacement');
  rmSync(path.join(archiveRoot, 'wiki/tbr/index.md')); writeFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), safeIndex);

  const candidateDir = path.join(archiveRoot, 'wiki/initiatives/candidates');
  const candidatePath = path.join(candidateDir, `${first.items[0].stableTbrId}.md`);
  mkdirSync(candidateDir, { recursive: true });
  writeFileSync(candidatePath, 'conflicting candidate\n');
  assert.deepEqual(promoteTbr({ root: archiveRoot, stableTbrId: first.items[0].stableTbrId, userSelected: true, promotedAt: '2026-07-19T00:00:00.000Z' }), { ok: false, code: 'TBR_COLLISION' }, 'conflicting candidate blocks tombstone');
  assert.equal(readFileSync(firstPath, 'utf8'), original, 'candidate failure leaves archive item open');
  rmSync(candidatePath);
  assert.equal(promoteTbr({ root: archiveRoot, stableTbrId: first.items[0].stableTbrId, userSelected: false }).ok, false);
  const partialPromotedAt = '2026-07-19T00:00:00.000Z';
  writeFileSync(candidatePath, `---\nStatus: Interview\nstableTbrId: ${first.items[0].stableTbrId}\nsourceTbr: [[../../tbr/items/${firstName.slice(0, -3)}]]\npromotedAt: ${partialPromotedAt}\n---\n`);
  const tombstoneTemporary = `${firstPath}.${process.pid}.tmp`;
  writeFileSync(tombstoneTemporary, 'forced tombstone failure\n');
  assert.deepEqual(promoteTbr({ root: archiveRoot, stableTbrId: first.items[0].stableTbrId, userSelected: true, promotedAt: '2099-01-01T00:00:00.000Z' }), { ok: false, code: 'TBR_WRITE_FAILED' }, 'durable exact candidate with forced tombstone failure remains resumable');
  assert.equal(readFileSync(firstPath, 'utf8'), original, 'forced tombstone failure leaves item open');
  writeFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), 'stale partial index\n');
  rmSync(tombstoneTemporary);
  const promoted = promoteTbr({ root: archiveRoot, stableTbrId: first.items[0].stableTbrId, userSelected: true, promotedAt: '2099-01-01T00:00:00.000Z' });
  assert.equal(promoted.ok, true, 'retry resumes exact durable candidate without duplicate');
  assert.equal(promoted.file, firstName, 'promotion must tombstone same first-write path');
  assert.match(readFileSync(candidatePath, 'utf8'), /^Status: Interview$/m, 'candidate is durable before tombstone');
  assert.match(readFileSync(candidatePath, 'utf8'), new RegExp(`^sourceTbr: \\[\\[\.\.\/\.\.\/tbr\/items\/${firstName.slice(0, -3)}\\]\\]$`, 'm'));
  assert.match(readFileSync(firstPath, 'utf8'), /^status: promoted$/m);
  assert.match(readFileSync(firstPath, 'utf8'), new RegExp(`^initiativeCandidate: wiki\/initiatives\/candidates\/${first.items[0].stableTbrId}\.md$`, 'm'));
  assert.match(readFileSync(firstPath, 'utf8'), new RegExp(`^promotedAt: ${partialPromotedAt}$`, 'm'), 'retry reuses candidate canonical promotion time');
  assert.deepEqual(readdirSync(candidateDir), [`${first.items[0].stableTbrId}.md`], 'retry creates no duplicate candidate');
  assert.match(readFileSync(path.join(archiveRoot, 'wiki/tbr/index.md'), 'utf8'), new RegExp(`\\| ${first.items[0].stableTbrId} \\| promoted \\|`), 'retry repairs stale index from tombstone');
  assert.equal(promoteTbr({ root: archiveRoot, stableTbrId: first.items[0].stableTbrId, userSelected: true, promotedAt: '2026-07-19T00:00:00.000Z' }).ok, true, 'promotion retry converges');

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

  const indexBatches = Array.from({ length: 6 }, (_, batch) => Array.from({ length: 20 }, (_, offset) => ({ ...immediate, findingId: `F-index-${batch}-${offset}`, title: `Deterministic archive entry ${batch}-${offset}` })));
  for (const findings of indexBatches) assert.equal(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings }).ok, true, 'full deterministic index may grow beyond item cap');
  const fullIndexPath = path.join(archiveRoot, 'wiki/tbr/index.md');
  assert.ok(Buffer.byteLength(readFileSync(fullIndexPath, 'utf8'), 'utf8') > 8192, 'full index exceeds 8KiB while every serialized item stays bounded');
  assert.equal(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: indexBatches.at(-1) }).ok, true, 'retry reads and rewrites oversized full index');
  writeFileSync(fullIndexPath, 'stale index\n');
  assert.equal(writeTbr({ root: archiveRoot, identity: archiveIdentity, findings: indexBatches.at(-1) }).ok, true, 'retry repairs stale index from canonical items');
  assert.ok(Buffer.byteLength(readFileSync(fullIndexPath, 'utf8'), 'utf8') > 8192, 'repaired index retains full deterministic archive');
} finally { rmSync(archiveRoot, { recursive: true, force: true }); }

const symlinkRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-link-'));
const escaped = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-escape-'));
try {
  symlinkSync(escaped, path.join(symlinkRoot, 'wiki'));
  assert.deepEqual(writeTbr({ root: symlinkRoot, identity: archiveIdentity, findings: [immediate] }), { ok: false, code: 'TBR_PATH_INVALID' });
  assert.deepEqual(readdirSync(escaped), [], 'symlink path must not receive durable item');
} finally { rmSync(symlinkRoot, { recursive: true, force: true }); rmSync(escaped, { recursive: true, force: true }); }

console.log('tbr.mjs tests passed');
