import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { admitRuleImpactInput, evaluateRuleImpact, pairedBootstrapDistribution, parseEvaluatorInputBytes } from './rule-impact-evaluator.mjs';
import { policyBytes, policyDigest, policyForTier } from './rule-impact-policy.mjs';
import { parseImpactEvaluationBytes } from './rule-impact-results.mjs';

const eligible = { input_id: `rule-impact-input:${'a'.repeat(64)}`, input_digest: 'a'.repeat(64), collection_disposition: 'eligible', tier: 'global', scope_id: null, target: { rule_id: 'pidex-global:pidex-implementer:quality', version_hash: 'b'.repeat(64), activation_epoch: 'epoch:1234567890abcdef12345678' } };

test('RA-02 rejects missing exact EI/policy authority', () => {
  assert.throws(() => evaluateRuleImpact(), /RULE_IMPACT_EVALUATOR_INPUT_INVALID/);
});

test('final EI envelope validates every family, external digest, and whole-array failure', () => {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/passive-impact-v1-golden.json', import.meta.url)));
  const vector = catalog.evaluator_input_vectors[0];
  const parsed = parseEvaluatorInputBytes(Buffer.from(vector.bytes), { expectedInputDigest: vector.evaluation_input_digest });
  assert.equal(parsed.families.length, 1);
  assert.equal(parsed.target_t0, parsed.target_epoch_opening.opened_at);
  const malformedLater = JSON.parse(vector.bytes);
  malformedLater.families.push({ ...malformedLater.families[0], family_id: malformedLater.families[0].family_id });
  assert.throws(() => parseEvaluatorInputBytes(Buffer.from(JSON.stringify(malformedLater)), { expectedInputDigest: createHash('sha256').update(JSON.stringify(malformedLater)).digest('hex') }), /RULE_IMPACT_EVALUATOR_INPUT_INVALID/);
});

test('Plan116B exact EI vectors parse every family/outcome and event effect', () => {
  const catalogs = ['passive-impact-v1-golden.json', 'project-passive-impact-v1-golden.json', 'passive-impact-observational.json']
    .map((name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));
  const vectors = catalogs.flatMap((catalog) => catalog.evaluator_input_vectors || []);
  const events = catalogs.flatMap((catalog) => catalog.epoch_event_vectors || []);
  assert.equal(vectors.length, 8);
  assert.equal(events.length, 20);
  for (const vector of vectors) {
    assert.equal(createHash('sha256').update(vector.bytes).digest('hex'), vector.evaluation_input_digest);
    assert.deepEqual(parseEvaluatorInputBytes(Buffer.from(vector.bytes, 'utf8'), { expectedInputDigest: vector.evaluation_input_digest }), JSON.parse(vector.bytes));
  }
  for (const event of events) {
    assert.equal(createHash('sha256').update(event.bytes).digest('hex'), event.canonical_example_sha256);
    assert.equal(parseEvaluatorInputBytes.validateEvent(JSON.parse(event.bytes)).effect, event.effect);
  }
  const policyEffects = Object.fromEntries(catalogs.flatMap((catalog) => catalog.policy_event_effects || []));
  assert.deepEqual(Object.fromEntries(events.filter(({ event_type }) => event_type !== 'reattested').map(({ event_type, effect }) => [event_type, effect])), policyEffects);
  const alias = JSON.parse(vectors[0].bytes);
  alias.family = alias.families[0]; delete alias.families;
  assert.throws(() => parseEvaluatorInputBytes(Buffer.from(JSON.stringify(alias)), { expectedInputDigest: createHash('sha256').update(JSON.stringify(alias)).digest('hex') }), /RULE_IMPACT_EVALUATOR_INPUT_INVALID/);
  const extra = JSON.parse(vectors[0].bytes);
  extra.unexpected = 'alias';
  assert.throws(() => parseEvaluatorInputBytes(Buffer.from(JSON.stringify(extra)), { expectedInputDigest: createHash('sha256').update(JSON.stringify(extra)).digest('hex') }), /RULE_IMPACT_EVALUATOR_INPUT_INVALID/);
});

function cohortInput() {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/passive-impact-v1-golden.json', import.meta.url)));
  const input = JSON.parse(catalog.evaluator_input_vectors[0].bytes);
  const base = input.families[0];
  const t0 = Date.parse(input.target_t0);
  const starts = { H2: -60, H1: -30, W1: 0, W2: 30 };
  input.families = Object.entries(starts).flatMap(([windowCode, offset]) => Array.from({ length: 30 }, (_, index) => {
    const family = structuredClone(base);
    const scope = `scope-${index % 2}`;
    family.family_kind = windowCode.startsWith('H') ? 'history' : 'post';
    family.window_code = windowCode;
    family.family_id = `${scope}/plan-${index % 5}/family-${windowCode}-${index}`;
    family.project_scope = scope;
    family.plan_id = `plan-${index % 5}`;
    family.run_family_id = `family-${windowCode}-${index}`;
    family.production_started_at = new Date(t0 + (offset + index) * 86400000).toISOString();
    family.terminal_finalized_at = new Date(Date.parse(family.production_started_at) + 3600000).toISOString();
    family.outcome.finalized_at = family.terminal_finalized_at;
    family.fingerprint.key.plan_id = family.plan_id;
    family.fingerprint.key.project_scope = scope;
    family.active_rules = [];
    family.non_target_rules = [];
    family.fingerprint.key.non_target_rules = [];
    if (family.family_kind === 'post') {
      family.target_presence = 'exact_active';
      family.target = structuredClone(input.evaluated_target);
      family.active_rules = [structuredClone(input.evaluated_target)];
      family.non_target_rules = [];
      family.fingerprint.key.non_target_rules = [];
    }
    family.fingerprint.key_digest = createHash('sha256').update(JSON.stringify(family.fingerprint.key)).digest('hex');
    return family;
  }));
  input.families.sort((left, right) => ['H2', 'H1', 'W1', 'W2'].indexOf(left.window_code) - ['H2', 'H1', 'W1', 'W2'].indexOf(right.window_code) || left.production_started_at.localeCompare(right.production_started_at) || left.family_id.localeCompare(right.family_id));
  const bytes = Buffer.from(JSON.stringify(input));
  return { bytes, digest: createHash('sha256').update(bytes).digest('hex') };
}

function evaluateFixture(input, evaluationAt = '2026-08-08T00:00:00.000Z') {
  const bytes = Buffer.from(JSON.stringify(input));
  return evaluateRuleImpact({ inputBytes: bytes, evaluationInputDigest: createHash('sha256').update(bytes).digest('hex'), policyBytes: policyBytes('global'), policyDigest: policyDigest('global'), evaluationAt });
}
function deadlineFixture(status, finalizedAt) {
  const { bytes } = cohortInput(); const input = JSON.parse(bytes); const t0 = Date.parse(input.target_t0);
  for (const entry of input.families.filter((item) => item.window_code === 'W1')) entry.outcome.finalized_at = input.target_t0;
  const family = input.families.find((entry) => entry.window_code === 'W1');
  family.outcome = status === 'finalized'
    ? { ...family.outcome, finalized_at: finalizedAt }
    : { status: 'missing', expected_dimension_ids: ['primary_harm'], deadline: new Date(t0 + 37 * 86400000).toISOString() };
  return input;
}
function eventFixture(type) {
  const { bytes } = cohortInput(); const input = JSON.parse(bytes); const catalog = JSON.parse(readFileSync(new URL('./fixtures/passive-impact-observational.json', import.meta.url)));
  const vector = catalog.epoch_event_vectors.find((item) => item.event_type === type);
  const event = JSON.parse(vector.bytes); const family = input.families.find((entry) => entry.window_code === 'W1');
  event.event_at = input.target_t0; event.rule_id = input.evaluated_target.rule_id; event.version_hash = input.evaluated_target.version_hash; event.activation_epoch = input.evaluated_target.activation_epoch;
  family.epoch_events = [event];
  return input;
}

test('BD-06 accepts exact 14-day gaps and rejects longer H1/W1 gaps', () => {
  const { bytes } = cohortInput(); const baseline = JSON.parse(bytes); const t0 = Date.parse(baseline.target_t0);
  for (const code of ['H2', 'H1', 'W1', 'W2']) {
    const members = baseline.families.filter((entry) => entry.window_code === code);
    members.forEach((entry, index) => { entry.production_started_at = new Date(t0 + ({ H2: -60, H1: -30, W1: 0, W2: 30 }[code] + (index < 14 ? 0 : index)) * 86400000).toISOString(); entry.terminal_finalized_at = new Date(Date.parse(entry.production_started_at) + 3600000).toISOString(); });
  }
  const sortFamilies = (input) => input.families.sort((left, right) => ['H2', 'H1', 'W1', 'W2'].indexOf(left.window_code) - ['H2', 'H1', 'W1', 'W2'].indexOf(right.window_code) || left.production_started_at.localeCompare(right.production_started_at) || left.family_id.localeCompare(right.family_id));
  sortFamilies(baseline);
  const pass = evaluateFixture(baseline);
  assert.equal(pass.artifact.gate_operands.timing.passed, true);
  assert.equal(pass.artifact.gate_operands.timing.observed_max_gap_seconds.decimal, '1209600');
  const gap = structuredClone(baseline); const delayed = gap.families.filter((entry) => entry.window_code === 'H1')[14]; delayed.production_started_at = new Date(t0 - 15 * 86400000).toISOString(); delayed.terminal_finalized_at = new Date(t0 - 15 * 86400000 + 3600000).toISOString(); delayed.outcome.finalized_at = delayed.terminal_finalized_at;
  sortFamilies(gap);
  const failed = evaluateFixture(gap);
  assert.equal(failed.artifact.state, 'inconclusive');
  assert.equal(failed.artifact.reason, 'timing_gap');
  assert.equal(failed.artifact.gate_operands.timing.passed, false);
});

test('BD-07 accepts deadline equality and excludes late/future finalized outcomes', () => {
  const { bytes } = cohortInput(); const t0 = Date.parse(JSON.parse(bytes).target_t0); const deadline = new Date(t0 + 37 * 86400000).toISOString();
  const exact = evaluateFixture(deadlineFixture('finalized', deadline));
  assert.equal(exact.model.cohorts.W1.exclusions.missing_invalid_outcome?.length || 0, 0);
  for (const [finalizedAt, evaluationAt, expectedState] of [[new Date(t0 + 37 * 86400000 + 1).toISOString(), '2026-08-08T00:00:00.000Z', 'evaluated'], [new Date(t0 + 10 * 86400000).toISOString(), new Date(t0 + 9 * 86400000).toISOString(), 'collecting']]) {
    const result = evaluateFixture(deadlineFixture('finalized', finalizedAt), evaluationAt);
    // F138-02: future outcome remains provisional until freeze; it cannot produce interim cohort operands.
    if (expectedState === 'collecting') assert.equal(result.state, 'collecting');
    else assert.equal(result.model.cohorts.W1.exclusions.missing_invalid_outcome.length, 1);
  }
});

function sortFamilies(input) {
  input.families.sort((left, right) => ['H2', 'H1', 'W1', 'W2'].indexOf(left.window_code) - ['H2', 'H1', 'W1', 'W2'].indexOf(right.window_code) || left.production_started_at.localeCompare(right.production_started_at) || left.family_id.localeCompare(right.family_id));
  return input;
}
function setStarts(input, code, offsets) {
  const t0 = Date.parse(input.target_t0);
  input.families.filter((entry) => entry.window_code === code).forEach((entry, index) => {
    entry.production_started_at = new Date(t0 + offsets[index % offsets.length] * 86400000).toISOString();
    entry.terminal_finalized_at = new Date(Date.parse(entry.production_started_at) + 3600000).toISOString();
    entry.outcome.finalized_at = entry.terminal_finalized_at;
  });
}

test('F138-01 BD6 rejects every global cross-window gap and accepts canonical timestamp ties', () => {
  const fixture = () => JSON.parse(cohortInput().bytes);
  const crossGapCases = [
    ['H2/H1', (input) => { setStarts(input, 'H2', [-30 - 1 / 24]); setStarts(input, 'H1', [-14]); setStarts(input, 'W1', [0, 14, 16]); setStarts(input, 'W2', [30]); }],
    ['H1/W1 T0', (input) => { setStarts(input, 'H2', [-30 - 1 / 24]); setStarts(input, 'H1', [-15]); setStarts(input, 'W1', [0, 14, 16]); setStarts(input, 'W2', [30]); }],
    ['W1/W2', (input) => { setStarts(input, 'H2', [-30 - 1 / 24]); setStarts(input, 'H1', [-29, -15, -14]); setStarts(input, 'W1', [0, 14]); setStarts(input, 'W2', [30]); }],
  ];
  for (const [name, arrange] of crossGapCases) {
    const input = fixture(); arrange(input); const result = evaluateFixture(sortFamilies(input));
    assert.equal(result.artifact.state, 'inconclusive', name);
    assert.equal(result.artifact.reason, 'timing_gap', name);
    assert.equal(result.artifact.gate_operands.timing.passed, false, name);
    assert.ok(Number(result.artifact.gate_operands.timing.observed_max_gap_seconds.decimal) > 1209600, name);
  }
  const tied = fixture();
  setStarts(tied, 'H2', [-30 - 1 / 24]); setStarts(tied, 'H1', [-29, -15, -14]); setStarts(tied, 'W1', [0, 14, 16]); setStarts(tied, 'W2', [30]);
  const result = evaluateFixture(sortFamilies(tied));
  assert.equal(result.artifact.gate_operands.timing.passed, true);
  assert.equal(result.artifact.gate_operands.timing.observed_max_gap_seconds.decimal, '1209600');
});

test('F138-02 BD7 collects every provisional failure until exact T0+67d freeze', () => {
  const base = () => JSON.parse(cohortInput().bytes);
  const t0 = Date.parse(base().target_t0);
  const provisional = [
    ['floor', (input) => { input.families = input.families.filter((entry) => entry.window_code !== 'W2' || !entry.family_id.endsWith('-29')); }, t0 + 10 * 86400000],
    ['timing', (input) => { setStarts(input, 'H2', [-30 - 1 / 24]); setStarts(input, 'H1', [-15]); }, t0 + 10 * 86400000],
    ['missing', (input) => { input.families.find((entry) => entry.window_code === 'W1').outcome = { status: 'missing', expected_dimension_ids: ['primary_harm'], deadline: new Date(t0 + 37 * 86400000).toISOString() }; }, t0 + 50 * 86400000],
    ['late', (input) => { input.families.find((entry) => entry.window_code === 'W1').outcome.finalized_at = new Date(t0 + 38 * 86400000).toISOString(); }, t0 + 50 * 86400000],
    ['future', (input) => { input.families.find((entry) => entry.window_code === 'W1').outcome.finalized_at = new Date(t0 + 11 * 86400000).toISOString(); }, t0 + 10 * 86400000],
    ['outcome', (input) => { input.families.find((entry) => entry.window_code === 'W1').outcome.definition_id = 'wrong'; }, t0 + 10 * 86400000],
  ];
  for (const [name, arrange, at] of provisional) {
    const input = base(); arrange(input); const result = evaluateFixture(sortFamilies(input), new Date(at).toISOString());
    assert.equal(result.state, 'collecting', name);
    assert.equal(result.artifact.state, 'collecting', name);
    assert.equal(result.model.bootstrap_effects, null, name);
    assert.equal(result.artifact.gate_operands, null, name);
    assert.deepEqual(result.artifact.quality_flags, [], name);
    assert.deepEqual(result.artifact.cohorts, [], name);
    assert.deepEqual(result.artifact.collection_progress, { observed_at: new Date(at).toISOString(), h2_source_count: 30, h1_source_count: 30, w1_source_count: 30, w2_source_count: name === 'floor' ? 29 : 30 }, name);
  }
  const boundary = evaluateFixture(base(), new Date(t0 + 67 * 86400000).toISOString());
  assert.notEqual(boundary.state, 'collecting');
  assert.notEqual(boundary.model.bootstrap_effects, null);
  const future = base(); future.families.find((entry) => entry.window_code === 'W1').outcome.finalized_at = new Date(t0 + 68 * 86400000).toISOString();
  const finalized = evaluateFixture(sortFamilies(future), new Date(t0 + 67 * 86400000).toISOString());
  assert.equal(finalized.model.cohorts.W1.exclusions.missing_invalid_outcome.length, 1);
});

test('F137-02 BD8 preserves every close-epoch discontinuity before later gates; exclude-family stays cohort-local', () => {
  const close = ['target_paused', 'target_deactivated', 'target_reactivated', 'target_version_changed', 'policy_changed', 'unknown_carryover', 'pipeline_outage', 'recorder_outage', 'clock_skew_unresolved', 'exposure_gap', 'source_lost', 'mirror_lost', 'concurrent_target_rule_change'];
  const closeInput = eventFixture(close[0]); const closeFamily = closeInput.families.find((entry) => entry.window_code === 'W1');
  closeFamily.epoch_events = close.map((type, index) => ({ ...eventFixture(type).families.find((entry) => entry.window_code === 'W1').epoch_events[0], event_at: new Date(Date.parse(closeInput.target_t0) + index).toISOString() }));
  const closeResult = evaluateFixture(closeInput);
  assert.equal(closeResult.artifact.state, 'inconclusive');
  assert.equal(closeResult.artifact.reason, 'provenance_failed');
  assert.deepEqual(closeResult.artifact.gate_operands.provenance.discontinuities, close);
  const excluded = ['concurrent_non_target_rule_change', 'concurrent_model_change', 'concurrent_pipeline_change', 'concurrent_outcome_change', 'concurrent_config_change', 'concurrent_authority_change'];
  const excludedInput = eventFixture(excluded[0]); const excludedFamily = excludedInput.families.find((entry) => entry.window_code === 'W1');
  excludedFamily.epoch_events = excluded.map((type, index) => ({ ...eventFixture(type).families.find((entry) => entry.window_code === 'W1').epoch_events[0], event_at: new Date(Date.parse(excludedInput.target_t0) + index).toISOString() }));
  const excludedResult = evaluateFixture(excludedInput);
  assert.equal(excludedResult.model.cohorts.W1.exclusions.concurrent_change.length, 1);
  assert.equal(excludedResult.artifact.gate_operands.provenance.passed, true);
});

test('F137-09 project catalog has exact project EI authority and full evaluator-golden fields', () => {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/project-passive-impact-v1-golden.json', import.meta.url)));
  const vectors = catalog.evaluator_input_vectors;
  assert.ok(vectors.length > 0);
  for (const vector of vectors) {
    const input = JSON.parse(vector.bytes);
    assert.equal(input.evaluated_target.tier, 'project');
    assert.equal(typeof input.evaluated_target.scope_id, 'string');
    assert.ok(input.evaluated_target.scope_id);
    assert.equal(input.evaluated_target.scope_id, input.families[0].project_scope);
    assert.equal(input.families[0].provenance.policy_id, 'project-passive-impact-v1');
  }
  const golden = catalog.full_evaluator_golden;
  assert.match(golden?.bytes || '', /^\{.+\}$/);
  assert.match(golden?.digest || '', /^[a-f0-9]{64}$/);
  assert.match(golden?.draw_digest || '', /^[a-f0-9]{64}$/);
  const evaluation = evaluateRuleImpact({ inputBytes: Buffer.from(golden.input_bytes), evaluationInputDigest: golden.input_digest, policyBytes: policyBytes('project'), policyDigest: policyDigest('project'), evaluationAt: '2026-08-08T00:00:00.000Z' });
  assert.equal(evaluation.bytes.toString('utf8'), golden.bytes);
  assert.equal(evaluation.digest, golden.digest);
  assert.equal(evaluation.model.bootstrap_effects.draw_digest, golden.draw_digest);
  assert.equal(evaluation.artifact.tier, 'project');
});

test('BD1–BD15 collecting state exposes only frozen-safe source progress and tier isolation', () => {
  const { bytes, digest } = cohortInput();
  const evaluation = evaluateRuleImpact({ inputBytes: bytes, evaluationInputDigest: digest, policyBytes: policyBytes('global'), policyDigest: policyDigest('global'), evaluationAt: '2026-08-06T00:00:00.000Z' });
  assert.equal(evaluation.state, 'collecting', evaluation.model.disposition);
  assert.ok(Object.isFrozen(evaluation));
  // F138-02: no provisional cohort acceptance or comparison operands before fixed freeze.
  assert.deepEqual(Object.fromEntries(Object.entries(evaluation.model.cohorts).map(([code, cohort]) => [code, cohort.source_denominator_count])), { H2: 30, H1: 30, W1: 30, W2: 30 });
  assert.equal(evaluation.model.comparisons, undefined);
  assert.equal(evaluation.model.bootstrap_effects, null);
  assert.equal(evaluation.tier, 'global');
  assert.throws(() => { evaluation.model.cohorts.H2.source_denominator_count = 0; }, TypeError);
});

test('BD20–BD29 emits canonical collecting ER with nonself/full digests', () => {
  const { bytes, digest } = cohortInput();
  const evaluation = evaluateRuleImpact({ inputBytes: bytes, evaluationInputDigest: digest, policyBytes: policyBytes('global'), policyDigest: policyDigest('global'), evaluationAt: '2026-08-06T00:00:00.000Z' });
  const parsed = parseImpactEvaluationBytes(evaluation.bytes);
  assert.equal(parsed.artifact.state, 'collecting');
  assert.equal(parsed.result_digest, evaluation.digest);
  assert.equal(parsed.artifact.result_id, parsed.result_id);
  assert.deepEqual(parsed.bytes, evaluation.bytes);
  assert.equal(Object.isFrozen(evaluation.artifact), true);
});

test('BD16–BD19 emits exact framed 10k bootstrap effects, binary64 intervals, and independent comparison seeds', () => {
  const { bytes, digest } = cohortInput();
  const source = JSON.parse(bytes);
  for (const family of source.families) family.outcome.values.primary_harm = family.window_code.startsWith('W') ? 1 : 0;
  const exactBytes = Buffer.from(JSON.stringify(source));
  const exactDigest = createHash('sha256').update(exactBytes).digest('hex');
  const evaluation = evaluateRuleImpact({ inputBytes: exactBytes, evaluationInputDigest: exactDigest, policyBytes: policyBytes('global'), policyDigest: policyDigest('global'), evaluationAt: '2026-08-08T00:00:00.000Z' });
  const stage = evaluation.model.bootstrap_effects;
  assert.equal(stage.schema, 'rule-impact-bootstrap-effects-v1');
  assert.equal(stage.replicates, 10000);
  assert.equal(stage.dimensions.primary_harm.comparisons['W1/H1'].point.decimal, '0.9999999999999999');
  assert.equal(stage.dimensions.primary_harm.comparisons['W1/H1'].interval.lower.decimal, '0.9999999999999999');
  assert.equal(stage.dimensions.primary_harm.comparisons['W1/H1'].interval.upper.decimal, '0.9999999999999999');
  assert.notEqual(stage.dimensions.primary_harm.comparisons['W1/H1'].seed, stage.dimensions.primary_harm.comparisons['W2/H2'].seed);
  assert.equal(stage.draw_digest, JSON.parse(readFileSync(new URL('./fixtures/passive-impact-v1-golden.json', import.meta.url))).bootstrap_golden.draw_digest);
  assert.equal(stage.dimensions.primary_harm.comparisons['W1/H1'].point.bits, '3fefffffffffffff');
  assert.ok(Object.isFrozen(stage));
  const perturbed = structuredClone(source);
  perturbed.input_digest = 'f'.repeat(64);
  for (const family of perturbed.families) {
    family.provenance.measurement_input_digest = perturbed.input_digest;
    family.provenance.measurement_input_id = `rule-impact-input:${perturbed.input_digest}`;
  }
  const perturbedBytes = Buffer.from(JSON.stringify(perturbed));
  const perturbedEvaluation = evaluateRuleImpact({ inputBytes: perturbedBytes, evaluationInputDigest: createHash('sha256').update(perturbedBytes).digest('hex'), policyBytes: policyBytes('global'), policyDigest: policyDigest('global'), evaluationAt: '2026-08-08T00:00:00.000Z' });
  assert.notEqual(perturbedEvaluation.model.bootstrap_effects.draw_digest, stage.draw_digest);
});

test('F137-03 pairs post bootstrap replicates by ordinal; baseline remains independent', () => {
  const { bytes } = cohortInput();
  const input = JSON.parse(bytes);
  for (const family of input.families) {
    const index = Number(family.family_id.match(/(\d+)$/)[1]);
    family.outcome.values.primary_harm = {
      H2: index % 3 === 0 ? 0 : 1,
      H1: index % 2,
      W1: index % 3 === 0 ? 1 : 0,
      W2: index % 2,
    }[family.window_code];
  }
  const evaluation = evaluateFixture(input);
  const stage = evaluation.model.bootstrap_effects.dimensions.primary_harm.comparisons;
  const paired = stage['W1/H1'].normalized_replicates.map((left, ordinal) => left - stage['W2/H2'].normalized_replicates[ordinal]).sort((left, right) => left - right);
  const baseline = stage['H1/H2'].normalized_replicates;
  const post = evaluation.artifact.gate_operands.drift_consistency.post_w1h1_minus_w2h2;
  const drift = evaluation.artifact.gate_operands.drift_consistency.baseline_h1_h2;
  assert.equal(post.point.bits, (() => { const buffer = Buffer.allocUnsafe(8); buffer.writeDoubleBE(Number(stage['W1/H1'].point.decimal) - Number(stage['W2/H2'].point.decimal)); return buffer.toString('hex'); })());
  assert.equal(post.interval_lower.bits, (() => { const buffer = Buffer.allocUnsafe(8); buffer.writeDoubleBE(paired[249]); return buffer.toString('hex'); })());
  assert.equal(post.interval_upper.bits, (() => { const buffer = Buffer.allocUnsafe(8); buffer.writeDoubleBE(paired[9749]); return buffer.toString('hex'); })());
  assert.equal(drift.interval_lower.bits, stage['H1/H2'].interval.lower.bits);
  assert.equal(drift.interval_upper.bits, stage['H1/H2'].interval.upper.bits);
  assert.notEqual(post.interval_lower.bits, (() => { const buffer = Buffer.allocUnsafe(8); buffer.writeDoubleBE(Number(stage['W1/H1'].interval.lower.decimal) - Number(stage['W2/H2'].interval.upper.decimal)); return buffer.toString('hex'); })(), 'paired lower must not subtract marginal endpoints');
  assert.equal(baseline.length, 10000);
  assert.equal(stage['W1/H1'].normalized_replicates.length, 10000);
  assert.deepEqual({ point: post.point.bits, lower: post.interval_lower.bits, upper: post.interval_upper.bits, draw_digest: evaluation.model.bootstrap_effects.draw_digest }, { point: 'bca4000000000000', lower: 'bfcddddddddddde1', upper: '3fcddddddddddddd', draw_digest: 'c4bc53bcb8f59b46abc9e107597063680313076352f03e1795290895c131a89b' });
});

test('F137-03 paired bootstrap summary distinguishes correlated and anti-correlated marginals', () => {
  const left = Array.from({ length: 10000 }, (_, ordinal) => ordinal % 2 ? 2 : 0);
  const correlated = pairedBootstrapDistribution({ left_point: 1, right_point: 0.5, left_replicates: left, right_replicates: left.map((value) => value / 2) });
  const antiCorrelated = pairedBootstrapDistribution({ left_point: 1, right_point: 0.5, left_replicates: left, right_replicates: left.map((value) => 1 - value / 2) });
  assert.deepEqual(correlated, { point: { decimal: '0.5', bits: '3fe0000000000000' }, interval: { lower: { decimal: '0', bits: '0000000000000000' }, upper: { decimal: '1', bits: '3ff0000000000000' } } });
  assert.deepEqual(antiCorrelated, { point: { decimal: '0.5', bits: '3fe0000000000000' }, interval: { lower: { decimal: '-1', bits: 'bff0000000000000' }, upper: { decimal: '2', bits: '4000000000000000' } } });
});

test('BD20–BD26 closes a complete frozen cohort into total ER operands', () => {
  const { bytes, digest } = cohortInput();
  const evaluation = evaluateRuleImpact({ inputBytes: bytes, evaluationInputDigest: digest, policyBytes: policyBytes('global'), policyDigest: policyDigest('global'), evaluationAt: '2026-08-08T00:00:00.000Z' });
  assert.equal(evaluation.state, 'frozen');
  const parsed = parseImpactEvaluationBytes(evaluation.bytes);
  assert.equal(parsed.artifact.state, 'frozen');
  assert.equal(parsed.artifact.cohorts.length, 4);
  assert.equal(parsed.artifact.comparisons.length, 4);
  assert.equal(parsed.artifact.gate_operands.gate_results.all, true);
  assert.equal(parsed.artifact.reason, 'frozen_no_repeated_harm');
});

test('BD-08 treats W2 end as excluded while closing only events inside fixed windows', () => {
  const afterWindow = eventFixture('target_paused');
  const at = Date.parse(afterWindow.target_t0) + 60 * 86400000;
  afterWindow.families.find((entry) => entry.window_code === 'W1').epoch_events[0].event_at = new Date(at + 1).toISOString();
  assert.equal(evaluateFixture(afterWindow).artifact.gate_operands.provenance.passed, true);
  const boundary = structuredClone(afterWindow);
  boundary.families.find((entry) => entry.window_code === 'W1').epoch_events[0].event_at = new Date(at).toISOString();
  assert.equal(evaluateFixture(boundary).artifact.gate_operands.provenance.passed, true);
});

const bdMatrixInput = cohortInput();
const bdMatrixEvaluation = evaluateRuleImpact({ inputBytes: bdMatrixInput.bytes, evaluationInputDigest: bdMatrixInput.digest, policyBytes: policyBytes('global'), policyDigest: policyDigest('global'), evaluationAt: '2026-08-08T00:00:00.000Z' });
function refreshedEvaluation(input) {
  input.impact_contract_digest = createHash('sha256').update(JSON.stringify(input.impact_contract)).digest('hex');
  for (const family of input.families) {
    family.fingerprint.key_digest = createHash('sha256').update(JSON.stringify(family.fingerprint.key)).digest('hex');
    family.provenance.impact_contract_digest = input.impact_contract_digest;
  }
  return evaluateFixture(sortFamilies(input));
}
function bdMutation(name) {
  const number = Number(name.match(/BD-(\d+)/)[1]);
  const input = () => JSON.parse(bdMatrixInput.bytes);
  const evaluate = (mutate) => { const value = input(); mutate(value); return refreshedEvaluation(value); };
  const parserRejects = (mutate) => { const value = input(); mutate(value); const bytes = Buffer.from(JSON.stringify(value)); assert.throws(() => parseEvaluatorInputBytes(bytes, { expectedInputDigest: createHash('sha256').update(bytes).digest('hex') }), /RULE_IMPACT_EVALUATOR_INPUT_INVALID/); };
  const family = (value, code, index = 0) => value.families.filter((entry) => entry.window_code === code)[index];
  switch (number) {
    case 1: { const result = evaluate((value) => { family(value, 'W1').outcome.values.primary_harm = 2; }); assert.equal(result.artifact.reason, 'count_below_floor'); assert.equal(result.artifact.cohorts.find((row) => row.cohort_id === 'W1').missing_count, 1); break; }
    case 2: { const result = evaluate((value) => { for (const entry of value.families) entry.outcome.values.primary_harm = entry.window_code.startsWith('W') ? 0 : 1; }); assert.equal(result.artifact.dimensions[0].effects.find((row) => row.comparison_id === 'W1/H1').point.bits, 'bfefffffffffffff'); break; }
    case 3: parserRejects((value) => { const entry = family(value, 'H1'); entry.family_id = family(value, 'H1', 1).family_id; }); break;
    case 4: parserRejects((value) => { const entry = family(value, 'H1'); entry.target_presence = 'exact_active'; entry.target = structuredClone(value.evaluated_target); }); break;
    case 5: { const result = evaluate((value) => { const entry = family(value, 'W2'); const end = Date.parse(value.target_t0) + 60 * 86400000; entry.production_started_at = new Date(end).toISOString(); entry.terminal_finalized_at = new Date(end + 3600000).toISOString(); entry.outcome.finalized_at = entry.terminal_finalized_at; }); assert.equal(result.artifact.reason, 'count_below_floor'); assert.equal(result.artifact.cohorts.find((row) => row.cohort_id === 'W2').count, 29); break; }
    case 9: { const result = evaluate((value) => { family(value, 'W1').raw_pre_outcome_covariates.complexity = 99; }); assert.equal(result.artifact.reason, 'count_below_floor'); assert.equal(result.artifact.cohorts.find((row) => row.cohort_id === 'W1').evidence_excluded_count, 1); break; }
    case 10: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code === 'W1').slice(0, 7).forEach((entry, index) => { entry.fingerprint.key.plan_id = `unsupported-${index}`; entry.plan_id = `unsupported-${index}`; }); }); assert.equal(result.artifact.reason, 'support_ratio_below_floor'); assert.equal(result.artifact.gate_operands.support.find((row) => row.cohort_id === 'W1').passed, false); break; }
    case 11: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code === 'W1' && /-(?:0|10|20)$/.test(entry.family_id)).forEach((entry) => { entry.fingerprint.key.plan_id = 'required-absent'; entry.plan_id = 'required-absent'; }); }); assert.equal(result.artifact.reason, 'count_below_floor'); const required = result.model.required_absent_strata.find((row) => row.code === 'W1' && row.count === 3); assert.equal(required?.threshold, 3); break; }
    case 12: { const result = evaluate((value) => { for (const code of ['W1', 'H1']) value.families.filter((entry) => entry.window_code === code).slice(0, 6).forEach((entry) => { entry.fingerprint.key.plan_id = 'weighted-cell'; entry.plan_id = 'weighted-cell'; }); }); assert.equal(result.artifact.gate_operands.weighting.find((row) => row.comparison_id === 'W1/H1').stratum_masses[createHash('sha256').update(JSON.stringify(family(input(), 'W1').fingerprint.key)).digest('hex')], 1 / 12); break; }
    case 13: { const result = evaluate((value) => { value.families = value.families.filter((entry) => entry !== family(value, 'W2')); }); assert.equal(result.artifact.reason, 'count_below_floor'); assert.equal(result.artifact.gate_operands.floors.find((row) => row.cohort_id === 'W2').count, 29); break; }
    case 14: assert.throws(() => policyForTier('foreign'), /RULE_IMPACT_TIER_INVALID/); break;
    case 15: assert.deepEqual(admitRuleImpactInput({ ...eligible, tier: 'project', scope_id: null }), { admitted: false, reason: 'tier_scope_invalid' }); break;
    case 16: { const result = evaluate((value) => { value.input_digest = 'f'.repeat(64); value.families.forEach((entry) => { entry.provenance.measurement_input_digest = value.input_digest; entry.provenance.measurement_input_id = `rule-impact-input:${value.input_digest}`; }); }); assert.notEqual(result.model.bootstrap_effects.draw_digest, bdMatrixEvaluation.model.bootstrap_effects.draw_digest); break; }
    case 17: { const result = evaluate((value) => { value.input_digest = 'e'.repeat(64); value.families.forEach((entry) => { entry.provenance.measurement_input_digest = value.input_digest; entry.provenance.measurement_input_id = `rule-impact-input:${value.input_digest}`; }); }); assert.notEqual(result.model.bootstrap_effects.dimensions.primary_harm.comparisons['W1/H1'].seed, bdMatrixEvaluation.model.bootstrap_effects.dimensions.primary_harm.comparisons['W1/H1'].seed); break; }
    case 18: parserRejects((value) => { family(value, 'W1').outcome.values.primary_harm = Number.NaN; }); break;
    case 19: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code === 'W1').forEach((entry, index) => { entry.outcome.values.primary_harm = index % 2; }); }); assert.notEqual(result.model.bootstrap_effects.dimensions.primary_harm.comparisons['W1/H1'].point.bits, bdMatrixEvaluation.model.bootstrap_effects.dimensions.primary_harm.comparisons['W1/H1'].point.bits); assert.equal(result.model.bootstrap_effects.dimensions.primary_harm.comparisons['W1/H1'].normalized_replicates.length, 10000); break; }
    case 20: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code === 'W1').forEach((entry) => { entry.raw_pre_outcome_covariates.complexity = 10; }); }); assert.equal(result.artifact.reason, 'balance_failed'); assert.equal(result.artifact.gate_operands.balance.find((row) => row.comparison_id === 'W1/H1').passed, false); break; }
    case 21: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code === 'H2').forEach((entry) => { entry.outcome.values.primary_harm = 0; }); value.families.filter((entry) => entry.window_code === 'H1').forEach((entry) => { entry.outcome.values.primary_harm = 1; }); }); assert.equal(result.artifact.reason, 'baseline_drift_failed'); assert.equal(result.artifact.gate_operands.drift_consistency.baseline_h1_h2.passed, false); break; }
    case 22: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code === 'W1').slice(0, 2).forEach((entry) => { entry.outcome = { status: 'missing', expected_dimension_ids: ['primary_harm'], deadline: new Date(Date.parse(value.target_t0) + 37 * 86400000).toISOString() }; }); }); assert.equal(result.artifact.reason, 'count_below_floor'); assert.equal(result.artifact.gate_operands.missingness.cohorts.find((row) => row.cohort_id === 'W1').passed, false); break; }
    case 23: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code === 'W1').slice(0, 7).forEach((entry) => { entry.epoch_events = [{ ...structuredClone(eventFixture('concurrent_model_change').families.find((item) => item.window_code === 'W1').epoch_events[0]), event_at: value.target_t0, rule_id: value.evaluated_target.rule_id, version_hash: value.evaluated_target.version_hash, activation_epoch: value.evaluated_target.activation_epoch }]; }); }); assert.equal(result.artifact.reason, 'count_below_floor'); assert.equal(result.artifact.gate_operands.evidence_exclusions.cohorts.find((row) => row.cohort_id === 'W1').passed, false); break; }
    case 24: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code.startsWith('H')).forEach((entry) => { entry.outcome.values.primary_harm = 0; }); value.families.filter((entry) => entry.window_code.startsWith('W')).forEach((entry) => { entry.outcome.values.primary_harm = 1; }); }); assert.equal(result.artifact.state, 'repeated_observational_harm'); assert.equal(result.artifact.gate_operands.primary.every((row) => row.passed), true); break; }
    case 25: { const result = evaluate((value) => { const guardrail = structuredClone(value.impact_contract.dimensions[0]); guardrail.id = 'z_guardrail'; guardrail.role = 'guardrail'; value.impact_contract.dimensions.push(guardrail); value.families.forEach((entry) => { entry.outcome.values.primary_harm = entry.window_code.startsWith('W') ? 1 : 0; entry.outcome.values.z_guardrail = entry.window_code.startsWith('W') ? 0 : 1; }); }); assert.equal(result.artifact.reason, 'guardrail_failed'); assert.equal(result.artifact.gate_operands.guardrails.every((row) => row.passed), false); break; }
    case 26: { const result = evaluate((value) => { value.families.filter((entry) => entry.window_code.startsWith('H')).forEach((entry) => { entry.outcome.values.primary_harm = 0; }); value.families.filter((entry) => entry.window_code === 'W1').forEach((entry) => { entry.outcome.values.primary_harm = 1; }); value.families.filter((entry) => entry.window_code === 'W2').forEach((entry) => { entry.outcome.values.primary_harm = 0; }); }); assert.equal(result.artifact.state, 'inconclusive'); assert.equal(result.artifact.reason, 'post_consistency_failed'); break; }
    default: throw new Error(`missing BD mutation ${number}`);
  }
}

for (const [name, positive] of [
  ['BD-01 excludes out-of-range primary outcome with exact missing operand', (artifact) => assert.equal(artifact.dimensions.filter((row) => row.role === 'primary').length, 1)],
  ['BD-02 flips post/history harm orientation with exact binary64 point', (artifact) => assert.equal(artifact.dimensions[0].effects[0].point.bits, '0000000000000000')],
  ['BD-03 rejects duplicate canonical family identity at EI parse', (artifact) => assert.equal(artifact.cohorts[0].source_denominator_count, 30)],
  ['BD-04 rejects history family carrying active target identity', (artifact) => assert.equal(artifact.lineage.activation_epoch, JSON.parse(bdMatrixInput.bytes).evaluated_target.activation_epoch)],
  ['BD-05 excludes W2 half-open end family from fixed cohort', (artifact) => assert.deepEqual(artifact.cohorts.map((row) => row.cohort_id), ['H2', 'H1', 'W1', 'W2'])],
  ['BD-09 excludes changed raw covariate fingerprint evidence', (artifact) => assert.equal(artifact.cohorts.every((row) => /^[a-f0-9]{64}$/.test(row.accepted_post_support_digest)), true)],
  ['BD-10 fails W1 four-way common-support ratio below 80 percent', (artifact) => assert.equal(artifact.gate_operands.support.every((row) => row.passed), true)],
  ['BD-11 records required absent stratum at exact three-family threshold', (artifact) => assert.equal(artifact.cohorts.every((row) => row.exclusions.find((item) => item.reason === 'unsupported_stratum').count === 0), true)],
  ['BD-12 recomputes exact W1/H1 stratum mass after cell mutation', (artifact) => assert.equal(artifact.gate_operands.weighting.length, 4)],
  ['BD-13 fails global W2 count floor after one-family removal', (artifact) => assert.equal(artifact.gate_operands.floors.every((row) => row.count === 30 && Number(row.ess.decimal) === 30 && row.plan_count === 5 && row.diversity_count === 2), true)],
  ['BD-14 rejects foreign tier policy lookup without floor fallback', () => { assert.equal(policyForTier('project').tier, 'project'); assert.throws(() => policyForTier('foreign'), /RULE_IMPACT_TIER_INVALID/); }],
  ['BD-15 rejects project admission without exact project scope', () => { assert.notEqual(policyDigest('global'), policyDigest('project')); assert.deepEqual(admitRuleImpactInput({ ...eligible, tier: 'project', scope_id: 'foreign' }), { admitted: false, reason: 'tier_scope_invalid' }); }],
  ['BD-16 changes bootstrap draw digest for changed input digest', (artifact) => assert.equal(bdMatrixEvaluation.model.bootstrap_effects.replicates, 10000)],
  ['BD-17 changes framed W1/H1 seed for changed input digest', () => assert.notEqual(bdMatrixEvaluation.model.bootstrap_effects.dimensions.primary_harm.comparisons['W1/H1'].seed, bdMatrixEvaluation.model.bootstrap_effects.dimensions.primary_harm.comparisons['W2/H2'].seed)],
  ['BD-18 rejects non-finite outcome before bootstrap arithmetic', (artifact) => assert.equal(artifact.dimensions.flatMap((row) => row.effects).every((row) => /^[a-f0-9]{16}$/.test(row.point.bits)), true)],
  ['BD-19 preserves ten-thousand replicate stage after outcome mutation', () => assert.equal(bdMatrixEvaluation.model.bootstrap_effects.dimensions.primary_harm.comparisons['W1/H1'].normalized_replicates.length, 10000)],
  ['BD-20 fails exact W1/H1 SMD balance after covariate shift', (artifact) => assert.equal(artifact.gate_operands.balance.every((row) => row.passed), true)],
  ['BD-21 fails baseline H1/H2 drift after outcome shift', (artifact) => assert.equal(artifact.gate_operands.drift_consistency.baseline_h1_h2.passed, true)],
  ['BD-22 fails W1 missingness gate after required outcomes disappear', (artifact) => assert.equal(artifact.gate_operands.missingness.cohorts.every((row) => row.rate.numerator === 0 && row.passed), true)],
  ['BD-23 fails W1 evidence-exclusion rate after concurrent events', (artifact) => assert.equal(artifact.gate_operands.evidence_exclusions.cohorts.every((row) => row.rate.numerator === 0 && row.passed), true)],
  ['BD-24 reaches repeated-harm state at exact primary materiality', (artifact) => { assert.equal(artifact.state, 'frozen'); assert.equal(artifact.reason, 'frozen_no_repeated_harm'); }],
  ['BD-25 fails guardrail gate for protective lower bound', (artifact) => assert.equal(artifact.gate_operands.guardrails.every((row) => row.passed), true)],
  ['BD-26 rejects discordant repeated primary harm through post-consistency gate', (artifact) => assert.deepEqual(artifact.quality_flags, [])],
].map(([name, positive]) => [name, positive])) {
  test(name, () => {
    const artifact = parseImpactEvaluationBytes(bdMatrixEvaluation.bytes).artifact;
    positive(artifact);
    bdMutation(name);
  });
}

test('Slice1 admits only eligible input into its exact tier policy pool', () => {
  const admitted = admitRuleImpactInput(eligible);
  assert.deepEqual(admitted, { admitted: true, tier: 'global', policy_id: 'passive-impact-v1', pool_key: `global\0\0${eligible.target.rule_id}\0${eligible.target.version_hash}\0${eligible.target.activation_epoch}` });
  assert.deepEqual(admitRuleImpactInput({ ...eligible, collection_disposition: 'blocked' }), { admitted: false, reason: 'input_not_eligible' });
  assert.deepEqual(admitRuleImpactInput({ ...eligible, tier: 'project', scope_id: 'foreign' }), { admitted: false, reason: 'tier_scope_invalid' });
});
