import { resolvePlanReviewAuthority } from '../../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';

// Fixture polling only. UNAVAILABLE means a validated live owner exhausted the
// short lock wait. Keep the caller's deadline; UNCERTAIN and history errors escape.
export function pollReviewAuthority(authority) {
  try { return resolvePlanReviewAuthority(authority); }
  catch (error) {
    if (error?.message === 'REVIEW_SELECTION_LOCK_UNAVAILABLE') return null;
    throw error;
  }
}
