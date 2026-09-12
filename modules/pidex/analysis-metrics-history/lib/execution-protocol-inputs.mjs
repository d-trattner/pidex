// Module-owned executable inputs for the host recovery protocol fingerprint.
// Include this descriptor itself so changing the input set invalidates old scopes.
// Pure metadata: do not import lifecycle execution and introduce a runtime cycle.
export const executionProtocolInputs = Object.freeze([
  'modules/pidex/analysis-metrics-history/lib/execution-protocol-inputs.mjs',
  'modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs',
]);
