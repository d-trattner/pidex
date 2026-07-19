const MODES = ['initial', 'correction1', 'review1', 'correction2', 'review2'];
const EVENT_TYPES = new Set(['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'review_outcome']);
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const PLAN = /^plan-\d{1,3}$/;
const GATES = new Set(['critic', 'code-review', 'security', 'qa']);
const VERDICTS = {
  critic: { APPROVED: 'APPROVED', APPROVED_WITH_COMMENTS: 'APPROVED', REJECTED: 'CHANGES_REQUESTED' },
  'code-review': { APPROVED: 'APPROVED', APPROVED_WITH_COMMENTS: 'APPROVED', REJECTED: 'CHANGES_REQUESTED' },
  security: { APPROVED: 'APPROVED', APPROVED_WITH_CONTROLS: 'CHANGES_REQUESTED', REJECTED: 'CHANGES_REQUESTED' },
  qa: { COMPLETE: 'APPROVED', FAILED: 'CHANGES_REQUESTED' },
};
const CANONICAL_OUTCOMES = new Set(['APPROVED', 'accepted', 'CHANGES_REQUESTED', 'READY_FOR_REVIEW', 'SUBMITTED', 'closed']);

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

export function allowedCompletionOutcome(identity, outcome) {
  if (!validateReviewIdentity(identity).ok || typeof outcome !== 'string') return false;
  return Boolean(nextAfter(identity.reviewMode, CANONICAL_OUTCOMES.has(outcome) ? outcome : normalizeReviewVerdict(identity.reviewGate, outcome)));
}

export function foldReviewHistory(rows, requested) {
  if (!validateReviewIdentity(requested).ok || !Array.isArray(rows)) return denied();
  const reviewRows = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !row.metadata || row.metadata.runFamilyId !== requested.runFamilyId) continue;
    if (!EVENT_TYPES.has(row.event_type)) return denied();
    const identity = identityFrom(row.metadata);
    if (!identity || identity.planId !== requested.planId) return denied();
    if (identity.reviewGate !== requested.reviewGate) continue;
    reviewRows.push({ event_type: row.event_type, metadata: row.metadata, identity });
  }
  if (!reviewRows.length) return requested.reviewMode === 'initial' ? { status: 'allowed', nextMode: 'initial' } : denied();
  if (reviewRows.length === 1 && reviewRows[0].event_type === 'review_outcome' && sameIdentity(reviewRows[0].identity, requested)) {
    const terminal = nextAfter(requested.reviewMode, outcomeOf(reviewRows[0].metadata, requested.reviewGate));
    if (terminal?.terminal) return { status: 'terminal', terminal: terminal.terminal };
  }
  for (let left = 0; left < reviewRows.length; left++) {
    for (let right = left + 1; right < reviewRows.length; right++) {
      if (reviewRows[left].identity.reviewMode === reviewRows[right].identity.reviewMode && reviewRows[left].identity.attemptId !== reviewRows[right].identity.attemptId) return denied();
    }
  }

  let expectedMode = 'initial';
  let index = 0;
  while (index < reviewRows.length) {
    const first = reviewRows[index];
    if (first.identity.reviewMode !== expectedMode) return denied();
    const active = first.identity;
    const events = [];
    while (index < reviewRows.length && sameIdentity(reviewRows[index].identity, active)) {
      events.push(reviewRows[index++]);
    }
    const canonical = [];
    for (const event of events) {
      const prior = canonical.find((item) => item.event_type === event.event_type);
      if (prior) {
        if (JSON.stringify(prior.metadata) !== JSON.stringify(event.metadata)) return denied();
      } else canonical.push(event);
    }
    const types = canonical.map((event) => event.event_type);
    const expectedPrefix = ['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'review_outcome'];
    if (types.some((type, position) => type !== expectedPrefix[position])) return denied();
    if (types.length === 1) return sameIdentity(active, requested) ? { status: 'resume_reserved', nextMode: expectedMode } : denied();
    if (types.length === 2) return { status: 'uncertain', code: 'SPAWN_ENTERED_UNCERTAIN' };
    if (types.length === 3) return sameIdentity(active, requested) ? { status: 'spawn_accepted', nextMode: expectedMode } : denied();
    if (types.length === 4) return { status: 'uncertain', code: 'SPAWN_RETURNED_UNCERTAIN' };
    const next = nextAfter(active.reviewMode, outcomeOf(canonical[4].metadata, active.reviewGate));
    if (!next) return denied();
    if (next.terminal) {
      if (index !== reviewRows.length) return denied();
      return { status: 'terminal', terminal: next.terminal };
    }
    expectedMode = next.nextMode;
  }
  return requested.reviewMode === expectedMode ? { status: 'allowed', nextMode: expectedMode } : denied();
}
