import { PIDEX_ROOT } from './paths.ts';
import { projectDecisionStatus, type DecisionStatus } from '../../../scripts/runtime/decision-status.mjs';
// @ts-expect-error Existing Node runtime observer owns bounded source/config reads.
import { observeRuntime } from '../../../scripts/runtime/status.mjs';
// @ts-expect-error Shared runtime module owns state-root resolution.
import { resolveStateRoot } from '../../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';

// No DB refresh, caller-supplied root, stored Pi receipt or inferred installation.
export function readDashboardDecisionStatus(observe = observeRuntime): DecisionStatus {
  try {
    const raw = observe({ bootstrapRoot: PIDEX_ROOT, runtimeRoot: PIDEX_ROOT, stateRoot: resolveStateRoot({ root: PIDEX_ROOT }) }, { observer: 'dashboard' });
    return projectDecisionStatus(raw, { observer: 'dashboard' });
  } catch {
    // Do not return filesystem paths, raw errors or environment/config values.
    return projectDecisionStatus(null, { observer: 'dashboard' });
  }
}
