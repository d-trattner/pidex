export const DECISION_STATUS_SCHEMA: 'pidex-decision-status-v1';
export interface DecisionFact { state: string; label: string; detail: string }
export interface DecisionStatus {
  schema: typeof DECISION_STATUS_SCHEMA;
  observed_at: string;
  observer: 'pi' | 'cli' | 'dashboard';
  runtime_status: string;
  observer_note: string;
  source_commit: string | null;
  loaded_source_commit: string | null;
  selected_baseline_id: string | null;
  bound_baseline_id: string | null;
  scope: string | null;
  source: DecisionFact;
  validation: DecisionFact;
  load: DecisionFact;
  installation: DecisionFact;
  readiness: DecisionFact;
  task_completion: DecisionFact;
  dispatch_policy_hint: string;
  reasons: string[];
  next_action: { id: string; text: string; automatic: false };
}
export function projectDecisionStatus(runtime: unknown, options?: { observer?: DecisionStatus['observer']; observedAt?: string }): DecisionStatus;
export function isDecisionStatus(value: unknown): value is DecisionStatus;
export function formatDecisionStatus(decision: DecisionStatus): string;
