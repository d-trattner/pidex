const MODES = ['initial', 'correction1', 'review1', 'correction2', 'review2'];
const EVENT_TYPES = new Set(['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome', 'physical_outcome', 'review_hold', 'review_resume_authorized', 'review_resume_consumed']);
// BD-62-03/SEC-1: FAILED_TO_START_TRANSIENT is pre-acceptance-only (exact 3-event
// grammar, checked literally at the 3-event branch below). The accepted 5-event
// failure fold accepts post-acceptance outcomes only.
const POST_ACCEPTANCE_PHYSICAL_OUTCOMES = new Set(['FAILED_TO_RUN', 'TIMED_OUT', 'TURN_LIMIT_HIT', 'MALFORMED_COMPLETION']);
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const PLAN = /^plan-\d{1,40}$/;
const GATES = new Set(['critic', 'code-review', 'security', 'qa']);
const VERDICTS = {
  critic: { APPROVED: 'APPROVED', APPROVED_WITH_COMMENTS: 'APPROVED', REJECTED: 'CHANGES_REQUESTED' },
  'code-review': { APPROVED: 'APPROVED', APPROVED_WITH_COMMENTS: 'APPROVED', REJECTED: 'CHANGES_REQUESTED' },
  security: { APPROVED: 'APPROVED', APPROVED_WITH_CONTROLS: 'CHANGES_REQUESTED', REJECTED: 'CHANGES_REQUESTED' },
  qa: { COMPLETE: 'APPROVED', FAILED: 'CHANGES_REQUESTED' },
};
const CANONICAL_OUTCOMES = new Set(['APPROVED', 'accepted', 'CHANGES_REQUESTED', 'READY_FOR_REVIEW', 'SUBMITTED', 'closed', 'USER_DECISION_REQUIRED']);

export function normalizeReviewPlan(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.match(/^(?:plan-)?(\d{1,40})(?:[-_].*)?$/i)?.[1];
  return digits ? `plan-${digits.length <= 3 ? digits.padStart(3, '0') : digits}` : null;
}

function identityFrom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { runFamilyId, planId, reviewGate, reviewMode, attemptId } = value;
  if (!IDENTIFIER.test(String(runFamilyId || '')) || !PLAN.test(String(planId || '')) || !GATES.has(reviewGate) || !MODES.includes(reviewMode) || !IDENTIFIER.test(String(attemptId || ''))) return null;
  return { runFamilyId, planId, reviewGate, reviewMode, attemptId };
}

export function validateReviewIdentity(value) {
  const identity = identityFrom(value);
  return identity ? { ok: true, value } : { ok: false, code: 'REVIEW_IDENTITY_INVALID' };
}

export function reviewAgentMatches(agent, identity) {
  if (!validateReviewIdentity(identity).ok) return false;
  if (identity.reviewMode.startsWith('correction')) return agent === (identity.reviewGate === 'critic' ? 'pidex-planner' : 'pidex-implementer');
  return agent === ({ critic: 'pidex-critic', 'code-review': 'pidex-code-reviewer', security: 'pidex-security', qa: 'pidex-qa' })[identity.reviewGate];
}

function sameIdentity(left, right) {
  return left.runFamilyId === right.runFamilyId && left.planId === right.planId && left.reviewGate === right.reviewGate && left.reviewMode === right.reviewMode && left.attemptId === right.attemptId;
}

function sameFamily(left, right) {
  return left.runFamilyId === right.runFamilyId && left.planId === right.planId && left.reviewGate === right.reviewGate;
}

export function normalizeReviewVerdict(gate, verdict) {
  if (!GATES.has(gate) || typeof verdict !== 'string') return null;
  return VERDICTS[gate]?.[verdict] || null;
}

function outcomeOf(metadata, gate) {
  if (!metadata || typeof metadata !== 'object') return null;
  if (typeof metadata.outcome === 'string' && !('verdict' in metadata)) return CANONICAL_OUTCOMES.has(metadata.outcome) ? metadata.outcome : null;
  if (typeof metadata.verdict === 'string' && !('outcome' in metadata)) return normalizeReviewVerdict(gate, metadata.verdict);
  return null;
}

function nextAfter(mode, outcome) {
  if (['APPROVED', 'accepted'].includes(outcome) && ['initial', 'review1', 'review2'].includes(mode)) return { terminal: 'accepted' };
  if (outcome === 'closed' && mode === 'review2') return { terminal: 'closed' };
  if (outcome === 'CHANGES_REQUESTED' && mode === 'initial') return { nextMode: 'correction1' };
  if (outcome === 'CHANGES_REQUESTED' && mode === 'review1') return { nextMode: 'correction2' };
  if (['READY_FOR_REVIEW', 'SUBMITTED'].includes(outcome) && mode === 'correction1') return { nextMode: 'review1' };
  if (['READY_FOR_REVIEW', 'SUBMITTED'].includes(outcome) && mode === 'correction2') return { nextMode: 'review2' };
  return null;
}

function denied() { return { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }; }

const PHYSICAL_PREFIX = ['start_reserved', 'spawn_entered', 'spawn_accepted'];
const PHYSICAL_FAILED_PREFIX = ['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'physical_outcome'];
function startsWith(types, prefix) { return prefix.every((type, index) => types[index] === type); }
// Shared completion/terminal fold for a semantic review outcome (physical + legacy).
// Expansion (USER_DECISION_REQUIRED) is a valid terminal only for receipt-bound
// six-event/physical completions; the legacy five-event branch has no receipt so
// expansion there is an unknown permutation and fails closed via nextAfter.
function nextOutcome(active, outcome, completedStatus, extra = {}, allowExpansion = false) {
  if (allowExpansion && outcome === 'USER_DECISION_REQUIRED') return { status: 'expansion_pending' };
  const next = nextAfter(active.reviewMode, outcome);
  if (!next) return denied();
  if (next.terminal) return { status: 'terminal', terminal: next.terminal };
  return { status: completedStatus, nextMode: next.nextMode, ...extra };
}

function physicalOf(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const generation = metadata.physicalGeneration;
  const ordinal = metadata.physicalOrdinal;
  const physicalAttemptId = metadata.physicalAttemptId;
  if (!Number.isInteger(generation) || generation < 0 || !Number.isInteger(ordinal) || ordinal < 0 || ordinal > 1 || !/^[a-f0-9]{64}$/.test(String(physicalAttemptId || ''))) return null;
  return { physicalGeneration: generation, physicalOrdinal: ordinal, physicalAttemptId };
}

function foldPhysicalAttempt(events, active) {
  const first = events[0];
  const physical = physicalOf(first.metadata);
  if (!physical || !sameIdentity(first.identity, active)) return denied();
  if (events.some((event) => !sameIdentity(event.identity, active) || JSON.stringify(physicalOf(event.metadata)) !== JSON.stringify(physical))) return denied();
  const types = events.map((event) => event.event_type);
  if (types.length <= PHYSICAL_PREFIX.length && startsWith(types, PHYSICAL_PREFIX)) {
    if (types.length === 1) return { status: 'resume_reserved', nextMode: active.reviewMode, ...physical };
    if (types.length === 2) return { status: 'uncertain', code: 'SPAWN_ENTERED_UNCERTAIN' };
    return { status: 'physical_accepted', nextMode: active.reviewMode, ...physical };
  }
  if (types.length === 3 && types[0] === 'start_reserved' && types[1] === 'spawn_entered' && types[2] === 'physical_outcome' && events[2].metadata.outcome === 'FAILED_TO_START_TRANSIENT') return { status: 'physical_failed', nextMode: active.reviewMode, ...physical, outcome: events[2].metadata.outcome };
  if (types.length === 5 && startsWith(types, PHYSICAL_FAILED_PREFIX) && POST_ACCEPTANCE_PHYSICAL_OUTCOMES.has(events[4].metadata.outcome)) return { status: 'physical_failed', nextMode: active.reviewMode, ...physical, outcome: events[4].metadata.outcome };
  if (types.length === 4 && startsWith(types, PHYSICAL_PREFIX) && types[3] === 'review_hold' && events[3].metadata.status === 'REVIEW_ABORTED') return { status: 'abort_hold', nextMode: active.reviewMode, ...physical };
  if (types.length === 6 && startsWith(types, PHYSICAL_FAILED_PREFIX) && types[5] === 'review_hold' && events[5].metadata.status === 'PRIMARY_REVIEW_UNAVAILABLE') return { status: 'primary_hold', nextMode: active.reviewMode, ...physical, holdId: events[5].metadata.holdId };
  // MINOR-3: six-event completion requires the exact fixed-position
  // completion_prepared receipt at index 3; spawn_returned there leaves a
  // trailing unknown event and is an unknown permutation: denied.
  const completionIndex = types[3] === 'completion_prepared' ? 5 : 4;
  if ((types.length === 5 || types.length === 6) && startsWith(types, PHYSICAL_PREFIX) && (types.length === 5 ? types[3] === 'spawn_returned' : types[3] === 'completion_prepared') && types[completionIndex - 1] === 'spawn_returned' && types[completionIndex] === 'review_outcome') {
    return nextOutcome(active, outcomeOf(events[completionIndex].metadata, active.reviewGate), 'physical_completed', physical, true);
  }
  return denied();
}

// Fold one identity segment's physical attempts: failed ord 0 -> retry ord 1,
// failed ord 1 -> exhausted, hold/resume -> generation + 1 (raw segment state).
function physicalKey(physical) { return `${physical.physicalGeneration}:${physical.physicalOrdinal}:${physical.physicalAttemptId}`; }
function foldPhysicalAttempts(reviewRows, active) {
  let index = 0;
  let expected = { physicalGeneration: 0, physicalOrdinal: 0 };
  let last;
  while (index < reviewRows.length) {
    const first = physicalOf(reviewRows[index].metadata);
    if (!first || first.physicalGeneration !== expected.physicalGeneration || first.physicalOrdinal !== expected.physicalOrdinal) return denied();
    const key = physicalKey(first);
    const events = [];
    while (index < reviewRows.length) {
      const physical = physicalOf(reviewRows[index].metadata);
      if (!physical || physicalKey(physical) !== key) break;
      events.push(reviewRows[index++]);
    }
    const state = foldPhysicalAttempt(events, active);
    if (state.status === 'denied' || state.status === 'uncertain') return state;
    last = state;
    if (state.status === 'physical_failed') {
      if (state.physicalOrdinal === 0) { expected = { physicalGeneration: state.physicalGeneration, physicalOrdinal: 1 }; if (index === reviewRows.length) return { status: 'physical_retry', nextMode: active.reviewMode, ...expected }; continue; }
      if (index === reviewRows.length) return { ...state, status: 'physical_exhausted', nextMode: active.reviewMode };
      return denied();
    }
    if (state.status === 'abort_hold') {
      return index === reviewRows.length ? state : denied();
    }
    if (state.status === 'primary_hold') {
      if (index === reviewRows.length) return state;
      const authorized = reviewRows[index++]; const consumed = reviewRows[index++];
      if (!authorized || !consumed || authorized.event_type !== 'review_resume_authorized' || consumed.event_type !== 'review_resume_consumed' || physicalOf(authorized.metadata) || physicalOf(consumed.metadata) || !sameIdentity(authorized.identity, active) || !sameIdentity(consumed.identity, active) || authorized.metadata.holdId !== state.holdId || consumed.metadata.holdId !== state.holdId) return denied();
      expected = { physicalGeneration: state.physicalGeneration + 1, physicalOrdinal: 0 };
      if (index === reviewRows.length) return denied();
      continue;
    }
    if (index !== reviewRows.length) return denied();
    if (state.status === 'physical_accepted' || state.status === 'resume_reserved' || state.status === 'terminal' || state.status === 'expansion_pending') return state;
    if (state.status === 'physical_completed') return state;
    return denied();
  }
  return last || denied();
}

// Single-identity physical history: legal mode order requires the initial mode;
// any later single-mode history is an unknown permutation and fails closed.
function foldPhysicalHistory(reviewRows, requested) {
  if (requested.reviewMode !== 'initial') return denied();
  const state = foldPhysicalAttempts(reviewRows, requested);
  if (state.status === 'physical_completed') return requested.reviewMode === state.nextMode ? { status: 'allowed', nextMode: state.nextMode } : denied();
  return state;
}

// Legacy (non-physical) fold of one mode segment (Plan 059 branch semantics).
function foldLegacySegment(events, active) {
  const canonical = [];
  for (const event of events) {
    const prior = canonical.find((item) => item.event_type === event.event_type);
    if (prior) {
      if (JSON.stringify(prior.metadata) !== JSON.stringify(event.metadata)) return denied();
    } else canonical.push(event);
  }
  const types = canonical.map((event) => event.event_type);
  const newSequence = types[3] === 'completion_prepared';
  const expectedPrefix = newSequence
    ? ['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome']
    : ['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'review_outcome'];
  if (types.length > expectedPrefix.length || types.some((type, position) => type !== expectedPrefix[position])) return denied();
  if (types.length === 1) return { status: 'resume_reserved', nextMode: active.reviewMode };
  if (types.length === 2) return { status: 'uncertain', code: 'SPAWN_ENTERED_UNCERTAIN' };
  if (types.length === 3) return { status: 'spawn_accepted', nextMode: active.reviewMode };
  if (types.length === 4) {
    if (newSequence) return { status: 'prepared', nextMode: active.reviewMode };
    return { status: 'uncertain', code: 'SPAWN_RETURNED_UNCERTAIN' };
  }
  if (types.length === 5) {
    if (newSequence) return { status: 'prepared', nextMode: active.reviewMode };
    return nextOutcome(active, outcomeOf(canonical[4].metadata, active.reviewGate), 'completed');
  }
  const outcome = outcomeOf(canonical[5].metadata, active.reviewGate);
  if (canonical[3].metadata.intendedOutcome !== outcome) return denied();
  return nextOutcome(active, outcome, 'completed', {}, true);
}

// Shared mode-segment walker: groups rows by identity in legal mode order and
// delegates the per-segment fold; denied/uncertain/terminal fan-out and the final
// allowed check are identical for legacy and physical histories. advance returns
// false (deny), true (advance expectedMode), or a final state to return.
function foldModeSegments(reviewRows, requested, foldSegment, advance) {
  let expectedMode = 'initial';
  let index = 0;
  while (index < reviewRows.length) {
    const first = reviewRows[index];
    if (first.identity.reviewMode !== expectedMode) return denied();
    const active = first.identity;
    const segment = [];
    while (index < reviewRows.length && sameIdentity(reviewRows[index].identity, active)) segment.push(reviewRows[index++]);
    const state = foldSegment(segment, active);
    if (state.status === 'denied' || state.status === 'uncertain') return state;
    if (state.status === 'terminal' || state.status === 'expansion_pending') return index !== reviewRows.length ? denied() : state;
    const outcome = advance(state, active, index === reviewRows.length, requested);
    if (outcome === false) return denied();
    if (outcome === true) { expectedMode = state.nextMode; continue; }
    return outcome;
  }
  return requested.reviewMode === expectedMode ? { status: 'allowed', nextMode: expectedMode } : denied();
}

// Multi-mode physical folding: mode segments in legal order, advancing the
// expected mode only on semantic review_outcome; mixed legacy+physical rows
// inside one mode and unknown permutations fail closed.
function foldPhysicalMultiMode(reviewRows, requested) {
  return foldModeSegments(reviewRows, requested, (segment, active) => {
    // resume authorized/consumed rows are structurally non-physical (holdId-bound)
    // and belong to the physical segment; any other non-physical row is mixed and
    // fails closed.
    const structuralRows = segment.filter((row) => !['review_resume_authorized', 'review_resume_consumed'].includes(row.event_type));
    const physicalRows = structuralRows.filter((row) => physicalOf(row.metadata));
    if (physicalRows.length !== 0 && physicalRows.length !== structuralRows.length) return denied();
    return physicalRows.length === structuralRows.length ? foldPhysicalAttempts(segment, active) : foldLegacySegment(segment, active);
  }, (state, active, atEnd, requested) => {
    if (state.status === 'physical_completed' || state.status === 'completed') return true;
    return atEnd && sameIdentity(active, requested) ? state : false;
  });
}

export function allowedCompletionOutcome(identity, outcome) {
  if (!validateReviewIdentity(identity).ok || typeof outcome !== 'string') return false;
  const normalized = CANONICAL_OUTCOMES.has(outcome) ? outcome : normalizeReviewVerdict(identity.reviewGate, outcome);
  return normalized === 'CHANGES_REQUESTED' && identity.reviewMode === 'review2' || normalized === 'USER_DECISION_REQUIRED' && !identity.reviewMode.startsWith('correction') || Boolean(nextAfter(identity.reviewMode, normalized));
}

export function foldReviewHistory(rows, requested) {
  if (!validateReviewIdentity(requested).ok || !Array.isArray(rows)) return denied();
  let reviewRows = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !row.metadata || row.metadata.planId !== requested.planId || row.metadata.reviewGate !== requested.reviewGate) continue;
    if (!EVENT_TYPES.has(row.event_type)) return denied();
    const identity = identityFrom(row.metadata);
    if (!identity) return denied();
    reviewRows.push({ event_type: row.event_type, metadata: row.metadata, identity });
  }
  if (!reviewRows.length) return requested.reviewMode === 'initial' ? { status: 'allowed', nextMode: 'initial' } : denied();
  if (reviewRows.some((row) => physicalOf(row.metadata))) {
    if (reviewRows.every((row) => sameIdentity(row.identity, requested))) return foldPhysicalHistory(reviewRows, requested);
    // CRITICAL-1: never strip physical fields from non-requested rows (that
    // degraded physical retry/hold/abort into inert legacy spawn_accepted);
    // fold each mode segment in legal order instead.
    return foldPhysicalMultiMode(reviewRows, requested);
  }
  if (reviewRows.length === 1 && reviewRows[0].event_type === 'review_outcome' && sameIdentity(reviewRows[0].identity, requested)) {
    const terminal = nextAfter(requested.reviewMode, outcomeOf(reviewRows[0].metadata, requested.reviewGate));
    if (terminal?.terminal) return { status: 'terminal', terminal: terminal.terminal };
  }
  for (let left = 0; left < reviewRows.length; left++) {
    for (let right = left + 1; right < reviewRows.length; right++) {
      if (reviewRows[left].identity.reviewMode === reviewRows[right].identity.reviewMode && reviewRows[left].identity.attemptId !== reviewRows[right].identity.attemptId) return denied();
    }
  }

  return foldModeSegments(reviewRows, requested, foldLegacySegment, (state, active, _atEnd, requested) => {
    if (state.status === 'resume_reserved' || state.status === 'spawn_accepted' || state.status === 'prepared') return sameIdentity(active, requested) ? state : false;
    return true;
  });
}
