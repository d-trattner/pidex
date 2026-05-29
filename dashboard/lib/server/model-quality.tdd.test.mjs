#!/usr/bin/env node
import assert from 'node:assert/strict';
import { summarizeModelQualityRows } from './model-quality.ts';

const rows = [
  { model: 'openai-codex/test-model', exit_code: 0, agent: 'pidex-planner', verdict: 'COMPLETE', gate: '', input_tokens: 100, output_tokens: 50, cost_usd: 0.001 },
  { model: 'openai-codex/test-model', exit_code: 1, agent: 'pidex-implementer', verdict: '', gate: '', input_tokens: 100, output_tokens: 50, cost_usd: 0.001 },
  { model: 'openai-codex/test-model', exit_code: 1, agent: 'pidex-critic', verdict: 'REJECTED', gate: '', input_tokens: 100, output_tokens: 50, cost_usd: 0.001 },
];

const result = summarizeModelQualityRows(rows);
assert.equal(result.length, 1);
assert.equal(result[0].model, 'test-model');
assert.equal(result[0].total_runs, 3);
assert.equal(result[0].success_rate, 33);
assert.equal(result[0].sigterm_rate, 67);
assert.equal(result[0].rejection_rate, 33);

const missingExitCodeRows = [
  { model: 'openrouter/unknown-exit', exit_code: null, agent: 'pidex-planner', verdict: '', gate: '' },
  { model: 'openrouter/unknown-exit', exit_code: null, agent: 'pidex-critic', verdict: '', gate: '' },
  { model: 'openrouter/unknown-exit', exit_code: null, agent: 'pidex-qa', verdict: '', gate: '' },
];
assert.equal(summarizeModelQualityRows(missingExitCodeRows)[0].success_rate, 100);
console.log('model-quality.ts tests passed');
