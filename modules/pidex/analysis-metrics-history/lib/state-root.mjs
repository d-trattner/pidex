import path from 'node:path';
import process from 'node:process';

// Plan 059 Slice 4 — single supported PIDEX state-root override.
// PIDEX_STATE_DIR is the canonical override and takes precedence; the historical
// RUNNING_PI_STATE_DIR name remains a legacy alias honored only when the canonical
// variable is unset. Every state-root consumer (host lifecycle extension, pipeline
// event.mjs, operator CLI orchestrator-events.mjs, dashboard ingest, metrics
// record) resolves through this helper so host lifecycle, CLI, and the project TBR
// serialization lock can never diverge under a single supported override.
// Precedence: PIDEX_STATE_DIR > RUNNING_PI_STATE_DIR > <root>/state.
export function resolveStateRoot({ root, env = process.env } = {}) {
  const canonical = typeof env?.PIDEX_STATE_DIR === 'string' && env.PIDEX_STATE_DIR ? env.PIDEX_STATE_DIR : undefined;
  const legacy = typeof env?.RUNNING_PI_STATE_DIR === 'string' && env.RUNNING_PI_STATE_DIR ? env.RUNNING_PI_STATE_DIR : undefined;
  const value = canonical || legacy;
  return value ? path.resolve(value) : path.join(root, 'state');
}
