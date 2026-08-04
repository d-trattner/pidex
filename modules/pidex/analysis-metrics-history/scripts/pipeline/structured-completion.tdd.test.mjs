#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, linkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { completeStructuredReviewOutcome, promoteTbrLocked } from '../../lib/review-lifecycle.mjs';
import { acquireProjectArchiveLock, projectArchiveLockPath, resolveArchiveRoot } from '../../../../../modules/pidex/project-pipeline/scripts/project-pipeline/archive-sync.mjs';
import { readArtifactPortable, recordReviewCompletion, reserveReviewStart } from './event.mjs';
import { canonicalProjectIdentity } from '../../lib/project-key.mjs';
import { canonicalizeReviewOutcome, writeTbr } from '../../../../../scripts/quality/tbr.mjs';
import { foldReviewHistory } from '../../../../../extensions/pidex/review-budget.ts';

const immediate = {
  findingId: 'F-immediate', relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate',
  title: 'Canonical immediate finding', shortDescription: 'Structured finding deferred from current gate.', originEpic: 'initiative-059', reviewArtifact: 'agents.output/code-review/059.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.',
};
const active = { findingId: 'F-assigned', relation: 'assigned', class: 'Product', reproductionState: 'not_tested', causedByCorrection: false, severity: 'Info', disposition: 'active' };
const terminalActive = { ...active, title: 'Terminal assigned finding', shortDescription: 'Assigned finding needs archive proof before terminal close.', originEpic: 'initiative-059', reviewArtifact: 'agents.output/code-review/059.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'Terminal close preserves active finding evidence.', nextAnalysisOrDisconfirmingTest: 'Read terminal archive item.' };
const payload = (overrides = {}) => ({ schemaVersion: 'pidex-review-outcome-v1', verdict: 'REJECTED', contractDisposition: 'in_contract', findings: [active, immediate], ...overrides });
const fenced = (value) => `# Review evidence\n\n\`\`\`pidex-review-outcome-v1\n${JSON.stringify(value)}\n\`\`\`\n`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifactDigestOf = (content) => sha256(Buffer.from(content, 'utf8'));
const outcomeDigestOf = (value) => sha256(JSON.stringify(canonicalizeReviewOutcome(value)));
const base = { runFamilyId: 'family-s1', planId: 'plan-059', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-s1' };
const SIX_EVENTS = ['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome'];

const state = mkdtempSync(path.join(os.tmpdir(), 'pidex-s2-state-'));
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-s2-project-'));
const outsideDirectory = mkdtempSync(path.join(os.tmpdir(), 'pidex-s2-outside-dir-'));
const eventsBase = path.join(state, 'pipeline-events', canonicalProjectIdentity(project).projectKey);
const bindCurrent = (pipelineId) => { mkdirSync(eventsBase, { recursive: true }); for (const name of readdirSync(eventsBase)) if (name.endsWith('.jsonl')) rmSync(path.join(eventsBase, name)); writeFileSync(path.join(eventsBase, 'plan-059.current'), pipelineId); writeFileSync(path.join(eventsBase, `${pipelineId}.jsonl`), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(project).canonicalProject, pipeline_id: pipelineId, plan_key: 'plan-059' })}\n`); };
const resetTbr = () => { const wiki = path.join(project, 'wiki'); if (readdirSync(project).includes('wiki')) rmSync(wiki, { recursive: true, force: true }); };
const fresh = (pipelineId) => { bindCurrent(pipelineId); resetTbr(); };
const writeArtifact = (relative, content) => { const file = path.join(project, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); };
const start = (current, pipelineId) => reserveReviewStart({ stateDir: state, project, pipelineId, identity: current, start: () => 'seed-child' });
const finish = (current, outcome, pipelineId) => recordReviewCompletion({ stateDir: state, project, pipelineId, identity: current, outcome });
const chain = (pipelineId, steps) => { for (const [mode, outcome] of steps) { const current = { ...base, reviewMode: mode, attemptId: `attempt-chain-${mode}` }; assert.equal(start(current, pipelineId).status, 'accepted'); assert.notEqual(finish(current, outcome, pipelineId).status, 'denied'); } };
const tbrItems = () => { const dir = path.join(project, 'wiki', 'tbr', 'items'); try { return readdirSync(dir).sort(); } catch (error) { if (error?.code === 'ENOENT') return []; throw error; } };
const rows = (pipelineId, attemptId) => readFileSync(path.join(eventsBase, `${pipelineId}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.attemptId === attemptId);
const eventTypes = (pipelineId, attemptId) => rows(pipelineId, attemptId).map((row) => row.event_type);
const receiptOf = (pipelineId, attemptId) => rows(pipelineId, attemptId).find((row) => row.event_type === 'completion_prepared')?.metadata;
const assertReceipt = (pipelineId, attemptId, { intendedOutcome, tbrIds, artifactDigest, outcomeDigest, identity: expectedIdentity }) => {
  const receipt = receiptOf(pipelineId, attemptId);
  assert.ok(receipt, 'receipt event present at fixed position');
  assert.equal(receipt.intendedOutcome, intendedOutcome, 'receipt binds intended outcome');
  assert.deepEqual(receipt.tbrIds, tbrIds, 'receipt binds stable TBR IDs');
  assert.equal(receipt.artifactDigest, artifactDigest, 'receipt binds exact artifact digest');
  assert.equal(receipt.outcomeDigest, outcomeDigest, 'receipt binds canonical completion digest');
  for (const key of ['runFamilyId', 'planId', 'reviewGate', 'reviewMode', 'attemptId']) assert.equal(receipt[key], expectedIdentity[key], `receipt binds canonical identity field ${key}`);
  return receipt;
};
const truncateAttempt = (pipelineId, attemptId, keep) => {
  const file = path.join(eventsBase, `${pipelineId}.jsonl`);
  const all = readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const attemptRows = all.filter((row) => row.metadata?.attemptId === attemptId);
  const otherRows = all.filter((row) => row.metadata?.attemptId !== attemptId);
  writeFileSync(file, `${[...otherRows, ...attemptRows.slice(0, keep)].map((row) => JSON.stringify(row)).join('\n')}\n`);
};
const complete = (current, pipelineId, routingVerdict, artifactPath = 'agents.output/code-review/059.md', routeTo) => completeStructuredReviewOutcome({ stateDir: state, project, pipelineId, identity: current, artifactPath, routingVerdict, routeTo: routeTo ?? (current.reviewGate === 'critic' ? 'pidex-planner' : 'pidex-implementer') });

try {
  mkdirSync(path.join(project, 'agents.output', 'code-review'), { recursive: true });

  // In-contract initial rejection: uniform six-event completion with fixed-position
  // completion_prepared receipt binding identity, artifact digest, outcome digest,
  // intended outcome, and stable TBR IDs.
  fresh('family-s1');
  assert.equal(start(base, 'family-s1').status, 'accepted');
  const rejectedContent = fenced(payload());
  writeArtifact('agents.output/code-review/059.md', rejectedContent);
  const rejected = complete(base, 'family-s1', 'REJECTED');
  assert.equal(rejected.status, 'CHANGES_REQUESTED');
  assert.deepEqual(eventTypes('family-s1', base.attemptId), SIX_EVENTS, 'uniform six-event completion sequence');
  assertReceipt('family-s1', base.attemptId, { identity: base, intendedOutcome: 'CHANGES_REQUESTED', tbrIds: tbrItems().map((name) => name.slice(0, 16)), artifactDigest: artifactDigestOf(rejectedContent), outcomeDigest: outcomeDigestOf(payload()) });
  assert.equal(rows('family-s1', base.attemptId).at(-1).metadata.outcome, 'CHANGES_REQUESTED');
  assert.match(tbrItems().map((name) => readFileSync(path.join(project, 'wiki', 'tbr', 'items', name), 'utf8')).join(''), /^sourceFindingId: F-immediate$/m, 'non-final rejection archives immediate only');
  assert.equal(receiptOf('family-s1', base.attemptId).tbrIds.length, 1, 'receipt binds the archived stable ID');
  assert.deepEqual(complete(base, 'family-s1', 'REJECTED'), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'duplicate completion of the same review is denied, never double-appends');

  // Approval with immediate findings archives them before accepted closure.
  fresh('family-approved');
  const approved = { ...base, runFamilyId: 'family-approved', attemptId: 'attempt-approved' };
  assert.equal(start(approved, 'family-approved').status, 'accepted');
  const approvedContent = fenced(payload({ verdict: 'APPROVED', findings: [immediate] }));
  writeArtifact('agents.output/code-review/059.md', approvedContent);
  assert.equal(complete(approved, 'family-approved', 'APPROVED').status, 'accepted');
  assertReceipt('family-approved', approved.attemptId, { identity: approved, intendedOutcome: 'APPROVED', tbrIds: tbrItems().map((name) => name.slice(0, 16)), artifactDigest: artifactDigestOf(approvedContent), outcomeDigest: outcomeDigestOf(payload({ verdict: 'APPROVED', findings: [immediate] })) });
  assert.equal(rows('family-approved', approved.attemptId).at(-1).metadata.outcome, 'APPROVED');

  // Plain approval writes no TBR archive and closes accepted (receipt tbrIds empty).
  fresh('family-clean');
  const clean = { ...base, runFamilyId: 'family-clean', attemptId: 'attempt-clean' };
  assert.equal(start(clean, 'family-clean').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ verdict: 'APPROVED', findings: [] })));
  assert.equal(complete(clean, 'family-clean', 'APPROVED').status, 'accepted');
  assert.deepEqual(tbrItems(), [], 'clean approval creates no TBR archive');
  assertReceipt('family-clean', clean.attemptId, { identity: clean, intendedOutcome: 'APPROVED', tbrIds: [], artifactDigest: artifactDigestOf(fenced(payload({ verdict: 'APPROVED', findings: [] }))), outcomeDigest: outcomeDigestOf(payload({ verdict: 'APPROVED', findings: [] })) });

  // Approved with active finding is an invalid outcome: zero writes, zero event appends.
  fresh('family-active');
  const activeApproved = { ...base, runFamilyId: 'family-active', attemptId: 'attempt-active' };
  assert.equal(start(activeApproved, 'family-active').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ verdict: 'APPROVED', findings: [active] })));
  assert.deepEqual(complete(activeApproved, 'family-active', 'APPROVED'), { status: 'denied', code: 'REVIEW_MATRIX_APPROVED_ACTIVE' });
  assert.deepEqual(eventTypes('family-active', activeApproved.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'matrix-denied review appends no completion events');
  assert.deepEqual(tbrItems(), [], 'matrix-denied review writes no TBR');

  // review1 in-contract rejection completes CHANGES_REQUESTED (allows correction2 without user gate).
  fresh('family-review1');
  chain('family-review1', [['initial', 'CHANGES_REQUESTED'], ['correction1', 'READY_FOR_REVIEW']]);
  const review1 = { ...base, runFamilyId: 'family-review1', reviewMode: 'review1', attemptId: 'attempt-review1' };
  assert.equal(start(review1, 'family-review1').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.equal(complete(review1, 'family-review1', 'REJECTED').status, 'CHANGES_REQUESTED');

  // review2 approval closes accepted.
  fresh('family-review2-approved');
  chain('family-review2-approved', [['initial', 'CHANGES_REQUESTED'], ['correction1', 'READY_FOR_REVIEW'], ['review1', 'CHANGES_REQUESTED'], ['correction2', 'SUBMITTED']]);
  const review2Approved = { ...base, runFamilyId: 'family-review2-approved', reviewMode: 'review2', attemptId: 'attempt-review2-approved' };
  assert.equal(start(review2Approved, 'family-review2-approved').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ verdict: 'APPROVED', findings: [] })));
  assert.equal(complete(review2Approved, 'family-review2-approved', 'APPROVED').status, 'accepted');
  assert.equal(rows('family-review2-approved', review2Approved.attemptId).at(-1).metadata.outcome, 'APPROVED');

  // review2 in-contract rejection: canonical terminalization. Every remaining active
  // and immediate finding is archived, lifecycle completes closed, typed
  // CLOSED_WITH_TBR, receipt binds intendedOutcome closed and the stable TBR IDs.
  fresh('family-review2-terminal');
  chain('family-review2-terminal', [['initial', 'CHANGES_REQUESTED'], ['correction1', 'READY_FOR_REVIEW'], ['review1', 'CHANGES_REQUESTED'], ['correction2', 'SUBMITTED']]);
  const review2 = { ...base, runFamilyId: 'family-review2-terminal', reviewMode: 'review2', attemptId: 'attempt-review2-terminal' };
  assert.equal(start(review2, 'family-review2-terminal').status, 'accepted');
  const terminalContent = fenced(payload({ verdict: 'REJECTED', findings: [terminalActive, immediate] }));
  writeArtifact('agents.output/code-review/059.md', terminalContent);
  const terminal = complete(review2, 'family-review2-terminal', 'REJECTED');
  assert.equal(terminal.status, 'CLOSED_WITH_TBR');
  assert.equal(terminal.tbrIds.length, 2, 'typed result carries both stable TBR IDs');
  const terminalBytes = tbrItems().map((name) => readFileSync(path.join(project, 'wiki', 'tbr', 'items', name), 'utf8')).join('');
  assert.match(terminalBytes, /^sourceFindingId: F-assigned$/m, 'terminal close archives the active finding');
  assert.match(terminalBytes, /^sourceFindingId: F-immediate$/m, 'terminal close archives the immediate finding');
  assert.equal(rows('family-review2-terminal', review2.attemptId).at(-1).metadata.outcome, 'closed', 'review2 rejection lifecycle outcome is closed');
  assertReceipt('family-review2-terminal', review2.attemptId, { identity: review2, intendedOutcome: 'closed', tbrIds: terminal.tbrIds, artifactDigest: artifactDigestOf(terminalContent), outcomeDigest: outcomeDigestOf(payload({ verdict: 'REJECTED', findings: [terminalActive, immediate] })) });
  assert.deepEqual(eventTypes('family-review2-terminal', review2.attemptId), SIX_EVENTS);
  // Terminal retry: folds terminal history and returns the same terminal status without rewriting evidence.
  const terminalRetry = complete(review2, 'family-review2-terminal', 'REJECTED');
  assert.equal(terminalRetry.status, 'CLOSED_WITH_TBR', 'terminal retry returns the same typed result');
  assert.deepEqual(terminalRetry.tbrIds, terminal.tbrIds, 'terminal retry returns the same stable IDs');
  assert.equal(rows('family-review2-terminal', review2.attemptId).length, 6, 'terminal retry never rewrites semantic evidence');
  assert.deepEqual(tbrItems().map((name) => name.slice(0, 16)), [...terminal.tbrIds].sort(), 'terminal retry never rewrites TBR bytes');
  assert.deepEqual(foldReviewHistory(readFileSync(path.join(eventsBase, 'family-review2-terminal.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)), review2), { status: 'terminal', terminal: 'closed' }, 'fold agrees the gate is terminally closed');

  // Expansion completes durably: typed USER_DECISION_REQUIRED with disposition, six-event
  // receipt sequence, zero TBR, fold non-spawnable expansion_pending, idempotent retry.
  fresh('family-expansion');
  const expansion = { ...base, runFamilyId: 'family-expansion', attemptId: 'attempt-expansion' };
  assert.equal(start(expansion, 'family-expansion').status, 'accepted');
  const expansionContent = fenced(payload({ verdict: 'REJECTED', contractDisposition: 'scope_expansion', findings: [active] }));
  writeArtifact('agents.output/code-review/059.md', expansionContent);
  assert.deepEqual(complete(expansion, 'family-expansion', 'REJECTED'), { status: 'USER_DECISION_REQUIRED', disposition: 'scope_expansion' });
  assertReceipt('family-expansion', expansion.attemptId, { identity: expansion, intendedOutcome: 'USER_DECISION_REQUIRED', tbrIds: [], artifactDigest: artifactDigestOf(expansionContent), outcomeDigest: outcomeDigestOf(payload({ verdict: 'REJECTED', contractDisposition: 'scope_expansion', findings: [active] })) });
  assert.deepEqual(eventTypes('family-expansion', expansion.attemptId), SIX_EVENTS, 'expansion records durable returned review truth');
  assert.deepEqual(tbrItems(), [], 'expansion writes no TBR');
  assert.deepEqual(foldReviewHistory(readFileSync(path.join(eventsBase, 'family-expansion.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)), expansion), { status: 'expansion_pending' }, 'expansion folds non-spawnable');
  assert.deepEqual(complete(expansion, 'family-expansion', 'REJECTED'), { status: 'USER_DECISION_REQUIRED', disposition: 'scope_expansion' }, 'expansion retry is idempotent');
  assert.equal(rows('family-expansion', expansion.attemptId).length, 6, 'expansion retry appends no second receipt');

  // Fault injection: crash after prepared receipt (returned/outcome missing) resumes
  // under the exact same receipt without changing stable IDs or bytes.
  fresh('family-crash-prepared');
  const crashed = { ...base, runFamilyId: 'family-crash-prepared', attemptId: 'attempt-crash-prepared' };
  assert.equal(start(crashed, 'family-crash-prepared').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.equal(complete(crashed, 'family-crash-prepared', 'REJECTED').status, 'CHANGES_REQUESTED');
  const receiptBefore = receiptOf('family-crash-prepared', crashed.attemptId);
  truncateAttempt('family-crash-prepared', crashed.attemptId, 4);
  assert.deepEqual(foldReviewHistory(readFileSync(path.join(eventsBase, 'family-crash-prepared.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)), crashed), { status: 'prepared', nextMode: 'initial' }, 'receipt-only state is resumable');
  assert.equal(complete(crashed, 'family-crash-prepared', 'REJECTED').status, 'CHANGES_REQUESTED', 'prepared-only retry resumes the missing lifecycle appends');
  assert.deepEqual(eventTypes('family-crash-prepared', crashed.attemptId), SIX_EVENTS, 'prepared-only retry appends only missing events');
  assert.deepEqual(receiptOf('family-crash-prepared', crashed.attemptId), receiptBefore, 'prepared-only retry keeps the exact same receipt bytes');
  assert.deepEqual(tbrItems().map((name) => name.slice(0, 16)), [receiptBefore.tbrIds[0]], 'prepared-only retry keeps the same stable TBR IDs');

  // Fault injection: crash after spawn_returned (outcome missing) resumes identically.
  fresh('family-crash-returned');
  const crashedReturned = { ...base, runFamilyId: 'family-crash-returned', attemptId: 'attempt-crash-returned' };
  assert.equal(start(crashedReturned, 'family-crash-returned').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.equal(complete(crashedReturned, 'family-crash-returned', 'REJECTED').status, 'CHANGES_REQUESTED');
  const receiptReturned = receiptOf('family-crash-returned', crashedReturned.attemptId);
  truncateAttempt('family-crash-returned', crashedReturned.attemptId, 5);
  assert.equal(complete(crashedReturned, 'family-crash-returned', 'REJECTED').status, 'CHANGES_REQUESTED', 'prepared+returned retry resumes the missing outcome');
  assert.deepEqual(eventTypes('family-crash-returned', crashedReturned.attemptId), SIX_EVENTS);
  assert.deepEqual(receiptOf('family-crash-returned', crashedReturned.attemptId), receiptReturned, 'prepared+returned retry keeps the exact same receipt bytes');

  // Fault injection: a differing duplicate receipt fails closed on resume.
  fresh('family-receipt-mismatch');
  const mismatched = { ...base, runFamilyId: 'family-receipt-mismatch', attemptId: 'attempt-receipt-mismatch' };
  assert.equal(start(mismatched, 'family-receipt-mismatch').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.equal(complete(mismatched, 'family-receipt-mismatch', 'REJECTED').status, 'CHANGES_REQUESTED');
  truncateAttempt('family-receipt-mismatch', mismatched.attemptId, 4);
  const file = path.join(eventsBase, 'family-receipt-mismatch.jsonl');
  const tampered = readFileSync(file, 'utf8').replace(/"tbrIds":\["TBR-[a-f0-9]{12}"/, '"tbrIds":["TBR-000000000000"');
  writeFileSync(file, tampered);
  assert.deepEqual(complete(mismatched, 'family-receipt-mismatch', 'REJECTED'), { status: 'denied', code: 'REVIEW_RECEIPT_MISMATCH' }, 'differing receipt bytes fail closed on resume');
  assert.equal(rows('family-receipt-mismatch', mismatched.attemptId).length, 4, 'receipt mismatch appends nothing');

  // Legacy four-event unprepared uncertainty remains fail-closed for explicit repair.
  fresh('family-legacy-uncertain');
  const legacyUncertain = { ...base, runFamilyId: 'family-legacy-uncertain', attemptId: 'attempt-legacy-uncertain' };
  assert.equal(start(legacyUncertain, 'family-legacy-uncertain').status, 'accepted');
  finish(legacyUncertain, 'CHANGES_REQUESTED', 'family-legacy-uncertain');
  truncateAttempt('family-legacy-uncertain', legacyUncertain.attemptId, 3);
  // Manually append an unprepared spawn_returned to simulate a legacy 4-event history.
  writeFileSync(path.join(eventsBase, 'family-legacy-uncertain.jsonl'), readFileSync(path.join(eventsBase, 'family-legacy-uncertain.jsonl'), 'utf8') + `${JSON.stringify({ event_type: 'spawn_returned', metadata: legacyUncertain })}\n`);
  assert.deepEqual(foldReviewHistory(readFileSync(path.join(eventsBase, 'family-legacy-uncertain.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)), legacyUncertain), { status: 'uncertain', code: 'SPAWN_RETURNED_UNCERTAIN' }, 'legacy four-event returned uncertainty preserved');
  assert.deepEqual(complete(legacyUncertain, 'family-legacy-uncertain', 'REJECTED'), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'legacy unprepared four-event state stays fail-closed for explicit repair');

  // Project-scoped TBR lock: malformed owner fails closed, never mtime takeover.
  fresh('family-tbr-lock-uncertain');
  const locked = { ...base, runFamilyId: 'family-tbr-lock-uncertain', attemptId: 'attempt-tbr-lock-uncertain' };
  assert.equal(start(locked, 'family-tbr-lock-uncertain').status, 'accepted');
  const tbrLockDir = path.join(state, 'pipeline-events', `.tbr-${canonicalProjectIdentity(project).projectKey}.lock`);
  mkdirSync(tbrLockDir, { recursive: true });
  writeFileSync(path.join(tbrLockDir, 'owner.json'), '{not-json');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.deepEqual(complete(locked, 'family-tbr-lock-uncertain', 'REJECTED'), { status: 'unavailable', code: 'REVIEW_TBR_LOCK_UNCERTAIN' }, 'malformed TBR lock owner fails closed');
  assert.deepEqual(eventTypes('family-tbr-lock-uncertain', locked.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'lock uncertainty appends no completion events');
  rmSync(tbrLockDir, { recursive: true, force: true });
  assert.equal(complete(locked, 'family-tbr-lock-uncertain', 'REJECTED').status, 'CHANGES_REQUESTED', 'completion proceeds once the lock is operator-repaired');

  // Lock-order assertion (AD-3): a caller already holding the review-gate lock (a
  // later lock) cannot request the TBR serialization lock (an earlier lock) within
  // the same operation — the acquisition is denied REVIEW_LOCK_ORDER_VIOLATION and
  // nothing is appended or written.
  fresh('family-lock-order');
  const orderViolation = { ...base, runFamilyId: 'family-lock-order', attemptId: 'attempt-lock-order' };
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  let boundaryInsideLock;
  const reservation = reserveReviewStart({ stateDir: state, project, pipelineId: 'family-lock-order', identity: orderViolation, start: () => { boundaryInsideLock = completeStructuredReviewOutcome({ stateDir: state, project, pipelineId: 'family-lock-order', identity: orderViolation, artifactPath: 'agents.output/code-review/059.md', routingVerdict: 'REJECTED', routeTo: 'pidex-implementer' }); return 'child'; } });
  assert.equal(reservation.status, 'accepted');
  assert.deepEqual(boundaryInsideLock, { status: 'denied', code: 'REVIEW_LOCK_ORDER_VIOLATION' }, 'earlier-lock request while holding a later lock fails closed in-operation');
  assert.deepEqual(eventTypes('family-lock-order', orderViolation.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'order-violation completion appends nothing');
  assert.deepEqual(tbrItems(), [], 'order-violation completion writes no TBR');

  // Opposing concurrent completions on the same project serialize on the TBR lock:
  // no lost entries from the shared project TBR index.
  fresh('family-contention-a');
  const contentionProject = project;
  const contentionState = state;
  const childSource = `import { completeStructuredReviewOutcome } from ${JSON.stringify(new URL('../../lib/review-lifecycle.mjs', import.meta.url).href)}; const [stateDir, project, pipelineId, identityJson, artifactPath] = process.argv.slice(1); const identity = JSON.parse(identityJson); const result = completeStructuredReviewOutcome({ stateDir, project, pipelineId, identity, artifactPath, routingVerdict: 'REJECTED', routeTo: 'pidex-implementer' }); console.log(JSON.stringify(result));`;
  const runContender = (identity, artifactPath) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', childSource, contentionState, contentionProject, 'family-contention-a', JSON.stringify(identity), artifactPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject); child.on('close', (code) => resolve({ code, output, error }));
  });
  const contendingFinding = (id) => ({ findingId: id, relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate', title: `Contending finding ${id}`, shortDescription: 'Concurrent structured finding.', originEpic: 'initiative-059', reviewArtifact: 'agents.output/code-review/059.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.' });
  const contenderAIdentity = { ...base, runFamilyId: 'family-contention-a', reviewGate: 'code-review', attemptId: 'attempt-family-contender-a' };
  const contenderBIdentity = { ...base, runFamilyId: 'family-contention-a', reviewGate: 'security', attemptId: 'attempt-family-contender-b' };
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ findings: [active, contendingFinding('F-contender-a')] })));
  writeArtifact('agents.output/security/059.md', fenced(payload({ findings: [active, contendingFinding('F-contender-b')] })));
  assert.equal(start(contenderAIdentity, 'family-contention-a').status, 'accepted', 'contender A reservation is established before the completion race');
  assert.equal(start(contenderBIdentity, 'family-contention-a').status, 'accepted', 'contender B reservation is established before the completion race');
  const contendA = runContender(contenderAIdentity, 'agents.output/code-review/059.md');
  const contendB = runContender(contenderBIdentity, 'agents.output/security/059.md');
  const [resultA, resultB] = await Promise.all([contendA, contendB]);
  assert.equal(resultA.code, 0, resultA.error); assert.equal(resultB.code, 0, resultB.error);
  assert.equal(JSON.parse(resultA.output).status, 'CHANGES_REQUESTED', resultA.output);
  assert.equal(JSON.parse(resultB.output).status, 'CHANGES_REQUESTED', resultB.output);
  const contendedItems = tbrItems().map((name) => readFileSync(path.join(project, 'wiki', 'tbr', 'items', name), 'utf8')).join('');
  assert.match(contendedItems, /^sourceFindingId: F-contender-a$/m, 'concurrent index writer A survives');
  assert.match(contendedItems, /^sourceFindingId: F-contender-b$/m, 'concurrent index writer B survives');
  assert.match(readFileSync(path.join(project, 'wiki', 'tbr', 'index.md'), 'utf8'), /F-contender-a/);
  assert.match(readFileSync(path.join(project, 'wiki', 'tbr', 'index.md'), 'utf8'), /F-contender-b/);

  // Full-byte dedup (AD-4): same stable ID with different canonical bytes fails
  // closed with TBR_COLLISION; identical retry stays idempotent.
  fresh('family-collision');
  const collision = { ...base, runFamilyId: 'family-collision', attemptId: 'attempt-collision' };
  assert.equal(start(collision, 'family-collision').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.equal(complete(collision, 'family-collision', 'REJECTED').status, 'CHANGES_REQUESTED');
  assert.deepEqual(writeTbr({ root: project, identity: collision, findings: [{ ...immediate, title: 'Mutated retry bytes' }] }), { ok: false, code: 'TBR_COLLISION' }, 'different bytes under the same stable ID fail closed');
  assert.equal(writeTbr({ root: project, identity: collision, findings: [immediate] }).ok, true, 'identical bytes under the same stable ID remain idempotent');

  // promoteTbr joins the shared project TBR serialization scope through the
  // lock-aware wrapper (AD-3): same fail-closed owner semantics, lock released after.
  fresh('family-promote');
  const promote = { ...base, runFamilyId: 'family-promote', attemptId: 'attempt-promote' };
  assert.equal(start(promote, 'family-promote').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.equal(complete(promote, 'family-promote', 'REJECTED').status, 'CHANGES_REQUESTED');
  const promoteId = receiptOf('family-promote', promote.attemptId).tbrIds[0];
  const promoted = promoteTbrLocked({ stateDir: state, project, stableTbrId: promoteId, userSelected: true, promotedAt: '2026-08-04T00:00:00.000Z' });
  assert.equal(promoted.ok, true, 'promoteTbr runs under the project TBR lock');
  assert.equal(existsSync(path.join(state, 'pipeline-events', `.tbr-${canonicalProjectIdentity(project).projectKey}.lock`)), false, 'TBR lock is released after the wrapper');

  // Hardened artifact read: hardlinked artifact fails closed with REVIEW_ARTIFACT_HARDLINK.
  fresh('family-hardlink');
  const hardlinked = { ...base, runFamilyId: 'family-hardlink', attemptId: 'attempt-hardlink' };
  assert.equal(start(hardlinked, 'family-hardlink').status, 'accepted');
  const outside = path.join(project, 'outside.md');
  writeFileSync(outside, fenced(payload()));
  linkSync(outside, path.join(project, 'agents.output', 'code-review', 'hardlinked.md'));
  assert.deepEqual(complete(hardlinked, 'family-hardlink', 'REJECTED', 'agents.output/code-review/hardlinked.md'), { status: 'denied', code: 'REVIEW_ARTIFACT_HARDLINK' }, 'hardlinked artifact is never read');
  assert.deepEqual(eventTypes('family-hardlink', hardlinked.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'hardlink denial appends no completion events');
  assert.deepEqual(tbrItems(), [], 'hardlink denial writes no TBR');

  // All four lifecycle gates complete in-contract rejection through the boundary.
  for (const [gate, gateVerdict] of [['critic', 'REJECTED'], ['code-review', 'REJECTED'], ['security', 'APPROVED_WITH_CONTROLS'], ['qa', 'FAILED']]) {
    fresh(`family-gate-${gate}`);
    const current = { ...base, runFamilyId: `family-gate-${gate}`, reviewGate: gate, attemptId: `attempt-gate-${gate}` };
    assert.equal(start(current, `family-gate-${gate}`).status, 'accepted');
    writeArtifact('agents.output/code-review/059.md', fenced(payload({ verdict: gateVerdict })));
    const result = complete(current, `family-gate-${gate}`, gateVerdict);
    assert.equal(result.status, 'CHANGES_REQUESTED', `${gate} in-contract rejection completes CHANGES_REQUESTED`);
    assert.deepEqual(eventTypes(`family-gate-${gate}`, current.attemptId), SIX_EVENTS, `${gate} uses the uniform six-event completion`);
    assert.equal(receiptOf(`family-gate-${gate}`, current.attemptId).intendedOutcome, 'CHANGES_REQUESTED', `${gate} receipt binds intended outcome`);
  }

  // Plan 059 Slice 4 (item 3): deterministic route_to agreement — non-final
  // in-contract rejection must route to the gate's correction owner
  // (critic -> pidex-planner; code-review/security/qa -> pidex-implementer).
  // CLOSED_WITH_TBR and USER_DECISION_REQUIRED override rejection routes and
  // never auto-correct, so terminal/expansion completions skip route enforcement.
  fresh('family-route-mismatch');
  const routeMismatch = { ...base, runFamilyId: 'family-route-mismatch', attemptId: 'attempt-route-mismatch' };
  assert.equal(start(routeMismatch, 'family-route-mismatch').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.deepEqual(complete(routeMismatch, 'family-route-mismatch', 'REJECTED', 'agents.output/code-review/059.md', 'pidex-pi'), { status: 'denied', code: 'REVIEW_ROUTE_MISMATCH' }, 'in-contract rejection routed away from the correction owner fails closed');
  assert.deepEqual(eventTypes('family-route-mismatch', routeMismatch.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'route mismatch appends no completion events');
  assert.deepEqual(tbrItems(), [], 'route mismatch writes no TBR');

  fresh('family-route-critic');
  const routeCritic = { ...base, runFamilyId: 'family-route-critic', reviewGate: 'critic', attemptId: 'attempt-route-critic' };
  assert.equal(start(routeCritic, 'family-route-critic').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.equal(complete(routeCritic, 'family-route-critic', 'REJECTED', 'agents.output/code-review/059.md', 'pidex-planner').status, 'CHANGES_REQUESTED', 'critic in-contract rejection routes to pidex-planner correction owner');
  assert.deepEqual(complete(routeCritic, 'family-route-critic', 'REJECTED', 'agents.output/code-review/059.md', 'pidex-implementer'), { status: 'denied', code: 'REVIEW_ROUTE_MISMATCH' }, 'critic rejection must not route to pidex-implementer');

  // CLOSED_WITH_TBR / USER_DECISION_REQUIRED override rejection routes: even a
  // ROUTING route_to pointing at a correction owner never auto-corrects.
  fresh('family-route-terminal-override');
  // review2 requires the full bounded chain first (initial -> correction1 -> review1 -> correction2);
  // a fresh-family review2 start is denied by the lifecycle, never accepted.
  chain('family-route-terminal-override', [['initial', 'CHANGES_REQUESTED'], ['correction1', 'READY_FOR_REVIEW'], ['review1', 'CHANGES_REQUESTED'], ['correction2', 'SUBMITTED']]);
  const routeTerminal = { ...base, runFamilyId: 'family-route-terminal-override', reviewMode: 'review2', attemptId: 'attempt-route-terminal' };
  assert.equal(start(routeTerminal, 'family-route-terminal-override').status, 'accepted');
  // Terminal close validates with archiveActive=true: active findings must carry full
  // archive fields, so the review2 payload uses the terminalActive finding.
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ findings: [terminalActive, immediate] })));
  assert.equal(complete(routeTerminal, 'family-route-terminal-override', 'REJECTED', 'agents.output/code-review/059.md', 'pidex-implementer').status, 'CLOSED_WITH_TBR', 'review2 rejection stays terminal CLOSED_WITH_TBR even when route_to names the correction owner');

  fresh('family-route-expansion-override');
  const routeExpansion = { ...base, runFamilyId: 'family-route-expansion-override', attemptId: 'attempt-route-expansion' };
  assert.equal(start(routeExpansion, 'family-route-expansion-override').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ contractDisposition: 'scope_expansion' })));
  assert.deepEqual(complete(routeExpansion, 'family-route-expansion-override', 'REJECTED', 'agents.output/code-review/059.md', 'pidex-implementer'), { status: 'USER_DECISION_REQUIRED', disposition: 'scope_expansion' }, 'expansion stays USER_DECISION_REQUIRED even when route_to names a correction owner');

  // Malformed, missing, duplicate, mismatched, unsafe, and oversized outcomes fail before any append or write.
  const faultCases = [
    ['missing payload', '# review prose only\n', 'REJECTED', 'STRUCTURED_OUTCOME_MISSING'],
    ['duplicate payload', `${fenced(payload())}${fenced(payload())}`, 'REJECTED', 'STRUCTURED_OUTCOME_DUPLICATE'],
    ['malformed json', '# review\n```pidex-review-outcome-v1\n{"verdict":\n```\n', 'REJECTED', 'STRUCTURED_OUTCOME_PARSE'],
    ['verdict mismatch', fenced(payload({ verdict: 'APPROVED', findings: [] })), 'REJECTED', 'STRUCTURED_ROUTING_MISMATCH'],
    ['unsafe content', fenced(payload({ findings: [active, { ...immediate, title: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789' }] })), 'REJECTED', 'REVIEW_FINDING_INVALID'],
    ['absolute artifact path', fenced(payload()), 'REJECTED', 'REVIEW_ARTIFACT_INVALID', '/tmp/pidex-outside-review.md'],
    ['wrong schema version', fenced(payload({ schemaVersion: 'pidex-review-outcome-v0' })), 'REJECTED', 'REVIEW_SCHEMA_VERSION_INVALID'],
    ['invalid disposition', fenced(payload({ contractDisposition: 'out_of_contract' })), 'REJECTED', 'REVIEW_DISPOSITION_INVALID'],
    ['non-contract verdict', fenced(payload({ verdict: 'CHANGES_REQUESTED' })), 'CHANGES_REQUESTED', 'REVIEW_OUTCOME_INVALID'],
  ];
  for (const [label, content, routingVerdict, code, artifactPath] of faultCases) {
    fresh(`family-fault-${label.replace(/\W+/g, '-')}`);
    const current = { ...base, runFamilyId: `family-fault-${label.replace(/\W+/g, '-')}`, attemptId: `attempt-fault-${label.replace(/\W+/g, '-')}` };
    assert.equal(start(current, `family-fault-${label.replace(/\W+/g, '-')}`).status, 'accepted');
    writeArtifact('agents.output/code-review/059.md', content);
    assert.deepEqual(complete(current, `family-fault-${label.replace(/\W+/g, '-')}`, routingVerdict, artifactPath), { status: 'denied', code }, `${label} fails closed`);
    assert.deepEqual(eventTypes(`family-fault-${label.replace(/\W+/g, '-')}`, current.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], `${label} appends no completion events`);
    assert.deepEqual(tbrItems(), [], `${label} writes no TBR`);
  }

  // Oversized artifact fails closed before parse.
  fresh('family-oversized');
  const oversized = { ...base, runFamilyId: 'family-oversized', attemptId: 'attempt-oversized' };
  assert.equal(start(oversized, 'family-oversized').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', `# big\n${'x'.repeat(600 * 1024)}\n`);
  assert.deepEqual(complete(oversized, 'family-oversized', 'REJECTED'), { status: 'denied', code: 'REVIEW_ARTIFACT_TOO_LARGE' });

  // Non-existent / symlinked artifact paths fail closed.
  fresh('family-missing-artifact');
  const missing = { ...base, runFamilyId: 'family-missing-artifact', attemptId: 'attempt-missing-artifact' };
  assert.equal(start(missing, 'family-missing-artifact').status, 'accepted');
  assert.deepEqual(complete(missing, 'family-missing-artifact', 'REJECTED', 'agents.output/code-review/absent.md'), { status: 'denied', code: 'REVIEW_ARTIFACT_INVALID' });
  fresh('family-symlink-artifact');
  const symlinkArtifact = { ...base, runFamilyId: 'family-symlink-artifact', attemptId: 'attempt-symlink-artifact' };
  assert.equal(start(symlinkArtifact, 'family-symlink-artifact').status, 'accepted');
  symlinkSync(outside, path.join(project, 'agents.output', 'code-review', 'linked.md'));
  assert.deepEqual(complete(symlinkArtifact, 'family-symlink-artifact', 'REJECTED', 'agents.output/code-review/linked.md'), { status: 'denied', code: 'REVIEW_ARTIFACT_INVALID' }, 'symlinked artifact is never read');

  // QA blocker (native-Windows correction): NTFS ADS / drive-like alternate
  // syntax. Any ':' in the artifact path is rejected with REVIEW_ARTIFACT_INVALID
  // before path resolution or open — `file.md:evil` must never reach the confined
  // reader (an NTFS alternate data stream is a different byte stream than the
  // named file). The colon-named file is created here on Linux (':' is a legal
  // filename character) so rejection is proven to come from path validation, not
  // ENOENT — and on Windows the same path would be an ADS read that passes every
  // containment/digest check.
  fresh('family-ads-colon');
  const adsPath = { ...base, runFamilyId: 'family-ads-colon', attemptId: 'attempt-ads-colon' };
  assert.equal(start(adsPath, 'family-ads-colon').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md:evil', fenced(payload()));
  assert.deepEqual(complete(adsPath, 'family-ads-colon', 'REJECTED', 'agents.output/code-review/059.md:evil'), { status: 'denied', code: 'REVIEW_ARTIFACT_INVALID' }, 'colon-containing artifact path is rejected before path resolution/open');
  assert.deepEqual(eventTypes('family-ads-colon', adsPath.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'ADS-style path denial appends no completion events');
  assert.deepEqual(tbrItems(), [], 'ADS-style path denial writes no TBR');

  // TBR write failure blocks completion with zero terminal append.
  fresh('family-tbr-failure');
  const tbrFailure = { ...base, runFamilyId: 'family-tbr-failure', attemptId: 'attempt-tbr-failure' };
  assert.equal(start(tbrFailure, 'family-tbr-failure').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  symlinkSync(outsideDirectory, path.join(project, 'wiki'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(complete(tbrFailure, 'family-tbr-failure', 'REJECTED'), { status: 'TBR_WRITE_BLOCKED', code: 'TBR_PATH_INVALID' }, 'TBR failure fails closed');
  assert.deepEqual(eventTypes('family-tbr-failure', tbrFailure.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'TBR failure appends no completion events');
  rmSync(path.join(project, 'wiki'));

  // ---------------------------------------------------------------------------
  // Plan 059 Slice 3: archive-only Project Pipeline completion (AD-5/AD-6). The
  // boundary composes the project TBR serialization lock then the external
  // archive lock (TBR -> archive -> selection -> gate), writes TBRs only beneath
  // the registry-derived archive root, and releases both locks in reverse order.
  const pidexRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s3-pidex-root-'));
  const archiveProjectId = 'pp-archive-boundary';
  const archiveRoot = resolveArchiveRoot({ pidexRoot, projectId: archiveProjectId });
  mkdirSync(archiveRoot, { recursive: true });
  const archiveLockPath = projectArchiveLockPath({ pidexRoot, projectId: archiveProjectId });
  const archiveKey = canonicalProjectIdentity(archiveRoot).projectKey;
  const archiveBase = path.join(state, 'pipeline-events', archiveKey);
  const bindArchive = (pipelineId) => { mkdirSync(archiveBase, { recursive: true }); for (const name of readdirSync(archiveBase)) if (name.endsWith('.jsonl')) rmSync(path.join(archiveBase, name)); writeFileSync(path.join(archiveBase, 'plan-059.current'), pipelineId); writeFileSync(path.join(archiveBase, `${pipelineId}.jsonl`), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(archiveRoot).canonicalProject, pipeline_id: pipelineId, plan_key: 'plan-059' })}\n`); };
  const archiveStart = (current, pipelineId) => reserveReviewStart({ stateDir: state, project: archiveRoot, pipelineId, identity: current, start: () => 'seed-child' });
  const archiveArtifact = (relative, content) => { const file = path.join(archiveRoot, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); };
  const archiveTbrItems = () => { const dir = path.join(archiveRoot, 'wiki', 'tbr', 'items'); try { return readdirSync(dir).sort(); } catch (error) { if (error?.code === 'ENOENT') return []; throw error; } };
  const archiveEvents = (pipelineId, attemptId) => readFileSync(path.join(archiveBase, `${pipelineId}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.attemptId === attemptId).map((row) => row.event_type);
  const resetArchiveTbr = () => { const wiki = path.join(archiveRoot, 'wiki'); if (existsSync(wiki)) rmSync(wiki, { recursive: true, force: true }); };
  const archiveComplete = (current, pipelineId, routingVerdict, archiveOptions) => completeStructuredReviewOutcome({ stateDir: state, project: archiveRoot, pipelineId, identity: current, artifactPath: 'agents.output/code-review/059.md', routingVerdict, routeTo: current.reviewGate === 'critic' ? 'pidex-planner' : 'pidex-implementer', archive: archiveOptions });

  // Archive-only completion writes TBRs only beneath the registry-derived archive
  // root while holding the external archive lock, completes the uniform six-event
  // lifecycle, and releases the archive lock and the project TBR lock afterwards.
  bindArchive('family-s3-archive-ok');
  resetArchiveTbr();
  const archiveInitial = { ...base, runFamilyId: 'family-s3-archive-ok', attemptId: 'attempt-s3-archive-ok' };
  assert.equal(archiveStart(archiveInitial, 'family-s3-archive-ok').status, 'accepted');
  archiveArtifact('agents.output/code-review/059.md', fenced(payload()));
  const archiveResult = archiveComplete(archiveInitial, 'family-s3-archive-ok', 'REJECTED', { pidexRoot, projectId: archiveProjectId, lockTimeoutMs: 500 });
  assert.equal(archiveResult.status, 'CHANGES_REQUESTED', 'archive-only completion returns typed CHANGES_REQUESTED');
  assert.equal(archiveResult.tbrIds.length, 1, 'archive-only completion archives the immediate finding');
  assert.equal(archiveTbrItems().length, 1, 'TBR item lands beneath the registry-derived archive root');
  assert.equal(readFileSync(path.join(archiveRoot, 'wiki', 'tbr', 'items', archiveTbrItems()[0]), 'utf8').includes('sourceFindingId: F-immediate'), true, 'archive TBR item is the exact canonical rendered item');
  assert.deepEqual(archiveEvents('family-s3-archive-ok', archiveInitial.attemptId), SIX_EVENTS, 'archive-only completion uses the uniform six-event sequence');
  assert.equal(existsSync(archiveLockPath), false, 'external archive lock released after completion');
  assert.equal(existsSync(path.join(state, 'pipeline-events', `.tbr-${archiveKey}.lock`)), false, 'project TBR lock released after completion');

  // Archive lock contention fails closed: the boundary cannot write into the
  // archive while an atomic archive swap is in flight (AD-6).
  bindArchive('family-s3-archive-contend');
  resetArchiveTbr();
  const archiveContender = { ...base, runFamilyId: 'family-s3-archive-contend', attemptId: 'attempt-s3-archive-contend' };
  assert.equal(archiveStart(archiveContender, 'family-s3-archive-contend').status, 'accepted');
  archiveArtifact('agents.output/code-review/059.md', fenced(payload()));
  const heldArchive = acquireProjectArchiveLock({ pidexRoot, projectId: archiveProjectId, operation: 'test-holder' });
  assert.equal(heldArchive.ok, true);
  try {
    assert.deepEqual(archiveComplete(archiveContender, 'family-s3-archive-contend', 'REJECTED', { pidexRoot, projectId: archiveProjectId, lockTimeoutMs: 100 }), { status: 'unavailable', code: 'REVIEW_ARCHIVE_LOCK_UNAVAILABLE' }, 'archive lock contention fails closed');
  } finally { heldArchive.release(); }
  assert.deepEqual(archiveEvents('family-s3-archive-contend', archiveContender.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'archive lock contention appends no completion events');
  assert.deepEqual(archiveTbrItems(), [], 'archive lock contention writes no TBR');
  assert.equal(archiveComplete(archiveContender, 'family-s3-archive-contend', 'REJECTED', { pidexRoot, projectId: archiveProjectId, lockTimeoutMs: 500 }).status, 'CHANGES_REQUESTED', 'completion proceeds once the archive lock is released');

  // Archive authority mismatch: an archive option whose canonical project is not
  // the registry-derived archive root fails closed — no cwd/custom archive/URL
  // fallback can become TBR authority (Slice 3 requirement 6).
  bindArchive('family-s3-archive-mismatch');
  const mismatchProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-s3-mismatch-project-'));
  try {
    const mismatchIdentity = { ...base, runFamilyId: 'family-s3-archive-mismatch', attemptId: 'attempt-s3-archive-mismatch' };
    const mismatchResult = completeStructuredReviewOutcome({ stateDir: state, project: mismatchProject, pipelineId: 'family-s3-archive-mismatch', identity: mismatchIdentity, artifactPath: 'agents.output/code-review/059.md', routingVerdict: 'REJECTED', routeTo: 'pidex-implementer', archive: { pidexRoot, projectId: archiveProjectId, lockTimeoutMs: 100 } });
    assert.deepEqual(mismatchResult, { status: 'denied', code: 'REVIEW_PROJECT_AUTHORITY_CHANGED' }, 'archive authority mismatch fails closed');
    assert.equal(existsSync(archiveLockPath), false, 'archive lock never acquired on authority mismatch');
  } finally { rmSync(mismatchProject, { recursive: true, force: true }); }

  // TBR lock precedes archive lock (AD-3 order): with the project TBR lock held
  // by an unreadable owner, the boundary fails closed at TBR acquisition and
  // never creates the archive lock — no lock inversion, no partial write.
  bindArchive('family-s3-archive-order');
  resetArchiveTbr();
  const orderIdentity = { ...base, runFamilyId: 'family-s3-archive-order', attemptId: 'attempt-s3-archive-order' };
  assert.equal(archiveStart(orderIdentity, 'family-s3-archive-order').status, 'accepted');
  archiveArtifact('agents.output/code-review/059.md', fenced(payload()));
  const archiveTbrLockDir = path.join(state, 'pipeline-events', `.tbr-${archiveKey}.lock`);
  mkdirSync(archiveTbrLockDir, { recursive: true });
  writeFileSync(path.join(archiveTbrLockDir, 'owner.json'), '{not-json');
  try {
    assert.deepEqual(archiveComplete(orderIdentity, 'family-s3-archive-order', 'REJECTED', { pidexRoot, projectId: archiveProjectId, lockTimeoutMs: 100 }), { status: 'unavailable', code: 'REVIEW_TBR_LOCK_UNCERTAIN' }, 'TBR lock failure precedes archive lock acquisition');
    assert.equal(existsSync(archiveLockPath), false, 'archive lock is never created when TBR lock fails first');
  } finally { rmSync(archiveTbrLockDir, { recursive: true, force: true }); }

  // Security F-1 (contract divergence): a direct same-identity retry after an
  // accepted six-event terminal must return the typed `accepted` status with the
  // same stable TBR IDs instead of a false denied REVIEW_HISTORY_INVALID. The
  // terminal comparison in recordReviewCompletion must normalize by canonical
  // terminal mapping — the boundary outcome APPROVED is the lifecycle spelling of
  // the fold-derived terminal 'accepted'. Mismatched-outcome denial is never
  // weakened, and the closed terminal lane keeps returning CLOSED_WITH_TBR.
  fresh('family-accepted-retry');
  const acceptedIdentity = { ...base, runFamilyId: 'family-accepted-retry', attemptId: 'attempt-accepted-retry' };
  assert.equal(start(acceptedIdentity, 'family-accepted-retry').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ verdict: 'APPROVED', findings: [immediate] })));
  const firstAccept = complete(acceptedIdentity, 'family-accepted-retry', 'APPROVED');
  assert.equal(firstAccept.status, 'accepted');
  assert.equal(rows('family-accepted-retry', acceptedIdentity.attemptId).length, 6, 'approval completes the six-event terminal');
  const acceptedRetry = complete(acceptedIdentity, 'family-accepted-retry', 'APPROVED');
  assert.deepEqual(acceptedRetry, { status: 'accepted', tbrIds: firstAccept.tbrIds }, 'same-identity retry after accepted terminal returns typed accepted with the same stable TBR IDs (security F-1)');
  assert.equal(rows('family-accepted-retry', acceptedIdentity.attemptId).length, 6, 'accepted retry never rewrites semantic evidence');
  assert.deepEqual(tbrItems().map((name) => name.slice(0, 16)), [...firstAccept.tbrIds].sort(), 'accepted retry never rewrites TBR bytes');
  assert.deepEqual(foldReviewHistory(readFileSync(path.join(eventsBase, 'family-accepted-retry.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)), acceptedIdentity), { status: 'terminal', terminal: 'accepted' }, 'fold agrees the gate is terminally accepted');
  // Mismatched retry after the accepted terminal denies fail-closed: the canonical
  // mapping must not weaken the mismatched-outcome denial.
  writeArtifact('agents.output/code-review/059.md', fenced(payload()));
  assert.deepEqual(complete(acceptedIdentity, 'family-accepted-retry', 'REJECTED'), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'mismatched outcome after accepted terminal stays denied (security F-1)');
  assert.equal(rows('family-accepted-retry', acceptedIdentity.attemptId).length, 6, 'mismatched retry appends no evidence');
  assert.deepEqual(tbrItems().map((name) => name.slice(0, 16)), [...firstAccept.tbrIds].sort(), 'mismatched retry writes no new TBR bytes');
  // Closed terminal lane keeps its same-typed retry under the canonical mapping
  // (regression guard: CLOSED_WITH_TBR with the same stable TBR IDs).
  fresh('family-closed-retry');
  chain('family-closed-retry', [['initial', 'CHANGES_REQUESTED'], ['correction1', 'READY_FOR_REVIEW'], ['review1', 'CHANGES_REQUESTED'], ['correction2', 'SUBMITTED']]);
  const closedIdentity = { ...base, runFamilyId: 'family-closed-retry', reviewMode: 'review2', attemptId: 'attempt-closed-retry' };
  assert.equal(start(closedIdentity, 'family-closed-retry').status, 'accepted');
  writeArtifact('agents.output/code-review/059.md', fenced(payload({ verdict: 'REJECTED', findings: [terminalActive, immediate] })));
  const firstClose = complete(closedIdentity, 'family-closed-retry', 'REJECTED');
  assert.equal(firstClose.status, 'CLOSED_WITH_TBR');
  const closedRetry = complete(closedIdentity, 'family-closed-retry', 'REJECTED');
  assert.deepEqual(closedRetry, { status: 'CLOSED_WITH_TBR', tbrIds: firstClose.tbrIds }, 'same-identity retry after closed terminal returns CLOSED_WITH_TBR with the same stable TBR IDs (security F-1 closed lane)');
  assert.equal(rows('family-closed-retry', closedIdentity.attemptId).length, 6, 'closed retry never rewrites semantic evidence');

  // ---------------------------------------------------------------------------
  // Plan 059 Slice A: native-Windows secure fallback (no numeric O_NOFOLLOW). The
  // test seam PIDEX_ARTIFACT_FORCE_PORTABLE_READ forces the portable descriptor
  // path on POSIX so the Windows security contract is exercised in CI; production
  // runs are unaffected (seam absent -> numeric O_NOFOLLOW path retained).
  process.env.PIDEX_ARTIFACT_FORCE_PORTABLE_READ = '1';
  try {
    // Valid fallback completion: the portable descriptor path reads the artifact,
    // completes CHANGES_REQUESTED with the uniform six-event receipt, and binds
    // the exact descriptor-byte digest.
    fresh('family-sA-fallback-ok');
    const fallbackOk = { ...base, runFamilyId: 'family-sA-fallback-ok', attemptId: 'attempt-sA-fallback-ok' };
    assert.equal(start(fallbackOk, 'family-sA-fallback-ok').status, 'accepted');
    const fallbackContent = fenced(payload());
    writeArtifact('agents.output/code-review/059.md', fallbackContent);
    assert.equal(complete(fallbackOk, 'family-sA-fallback-ok', 'REJECTED').status, 'CHANGES_REQUESTED', 'portable fallback completes a valid artifact');
    assert.deepEqual(eventTypes('family-sA-fallback-ok', fallbackOk.attemptId), SIX_EVENTS, 'portable fallback uses the uniform six-event sequence');
    assertReceipt('family-sA-fallback-ok', fallbackOk.attemptId, { identity: fallbackOk, intendedOutcome: 'CHANGES_REQUESTED', tbrIds: tbrItems().map((name) => name.slice(0, 16)), artifactDigest: artifactDigestOf(fallbackContent), outcomeDigest: outcomeDigestOf(payload()) });

    // Symlink artifact stays denied on the portable path (no component symlink is
    // ever followed): zero completion events.
    fresh('family-sA-fallback-symlink');
    const fallbackSymlink = { ...base, runFamilyId: 'family-sA-fallback-symlink', attemptId: 'attempt-sA-fallback-symlink' };
    assert.equal(start(fallbackSymlink, 'family-sA-fallback-symlink').status, 'accepted');
    symlinkSync(outside, path.join(project, 'agents.output', 'code-review', 'fallback-linked.md'));
    assert.deepEqual(complete(fallbackSymlink, 'family-sA-fallback-symlink', 'REJECTED', 'agents.output/code-review/fallback-linked.md'), { status: 'denied', code: 'REVIEW_ARTIFACT_INVALID' }, 'symlinked artifact is never read on the portable path');
    assert.deepEqual(eventTypes('family-sA-fallback-symlink', fallbackSymlink.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'portable symlink denial appends no completion events');
    assert.deepEqual(tbrItems(), [], 'portable symlink denial writes no TBR');

    // Hardlinked artifact stays denied on the portable path (pre-lstat nlink > 1).
    fresh('family-sA-fallback-hardlink');
    const fallbackHardlink = { ...base, runFamilyId: 'family-sA-fallback-hardlink', attemptId: 'attempt-sA-fallback-hardlink' };
    assert.equal(start(fallbackHardlink, 'family-sA-fallback-hardlink').status, 'accepted');
    linkSync(outside, path.join(project, 'agents.output', 'code-review', 'fallback-hardlinked.md'));
    assert.deepEqual(complete(fallbackHardlink, 'family-sA-fallback-hardlink', 'REJECTED', 'agents.output/code-review/fallback-hardlinked.md'), { status: 'denied', code: 'REVIEW_ARTIFACT_HARDLINK' }, 'hardlinked artifact is never read on the portable path');
    assert.deepEqual(eventTypes('family-sA-fallback-hardlink', fallbackHardlink.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'portable hardlink denial appends no completion events');
    assert.deepEqual(tbrItems(), [], 'portable hardlink denial writes no TBR');

    // Oversized artifact stays denied on the portable path before any parse.
    fresh('family-sA-fallback-oversize');
    const fallbackOversize = { ...base, runFamilyId: 'family-sA-fallback-oversize', attemptId: 'attempt-sA-fallback-oversize' };
    assert.equal(start(fallbackOversize, 'family-sA-fallback-oversize').status, 'accepted');
    writeArtifact('agents.output/code-review/059.md', `# big\n${'x'.repeat(600 * 1024)}\n`);
    assert.deepEqual(complete(fallbackOversize, 'family-sA-fallback-oversize', 'REJECTED'), { status: 'denied', code: 'REVIEW_ARTIFACT_TOO_LARGE' }, 'portable fallback rejects oversize artifacts');
    assert.deepEqual(eventTypes('family-sA-fallback-oversize', fallbackOversize.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'portable oversize denial appends no completion events');
    assert.deepEqual(tbrItems(), [], 'portable oversize denial writes no TBR');

    // Non-regular artifact (directory) stays denied on the portable path.
    fresh('family-sA-fallback-nonregular');
    const fallbackNonregular = { ...base, runFamilyId: 'family-sA-fallback-nonregular', attemptId: 'attempt-sA-fallback-nonregular' };
    assert.equal(start(fallbackNonregular, 'family-sA-fallback-nonregular').status, 'accepted');
    mkdirSync(path.join(project, 'agents.output', 'code-review', 'not-a-file'), { recursive: true });
    assert.deepEqual(complete(fallbackNonregular, 'family-sA-fallback-nonregular', 'REJECTED', 'agents.output/code-review/not-a-file'), { status: 'denied', code: 'REVIEW_ARTIFACT_INVALID' }, 'non-regular artifact is never read on the portable path');
    assert.deepEqual(eventTypes('family-sA-fallback-nonregular', fallbackNonregular.attemptId), ['start_reserved', 'spawn_entered', 'spawn_accepted'], 'portable non-regular denial appends no completion events');
    assert.deepEqual(tbrItems(), [], 'portable non-regular denial writes no TBR');

    // Swap between the confinement walk (pre-lstat) and the descriptor open fails
    // closed: the portable reader requires dev+ino identity between the walked
    // inode and the opened descriptor, so a replaced path is never read.
    const swapDir = mkdtempSync(path.join(os.tmpdir(), 'pidex-sA-swap-'));
    try {
      const swapArtifact = path.join(swapDir, 'artifact.md');
      writeFileSync(swapArtifact, fenced(payload()));
      const walked = lstatSync(swapArtifact);
      rmSync(swapArtifact);
      writeFileSync(swapArtifact, fenced(payload({ verdict: 'APPROVED', findings: [] })));
      assert.notEqual(lstatSync(swapArtifact).ino, walked.ino, 'swap precondition: replaced path is a different inode');
      assert.deepEqual(readArtifactPortable(swapDir, swapArtifact, walked), { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' }, 'path swapped after pre-lstat fails closed with dev+ino identity');
    } finally { rmSync(swapDir, { recursive: true, force: true }); }
  } finally { delete process.env.PIDEX_ARTIFACT_FORCE_PORTABLE_READ; }
} finally { rmSync(state, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); rmSync(outsideDirectory, { recursive: true, force: true }); }

console.log('structured completion boundary tests passed');
