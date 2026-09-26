import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createBootstrapDrawHasher } from './rule-impact-evaluator.mjs';
import { policyForTier } from './rule-impact-policy.mjs';

// Independent, deliberately allocation-heavy reference encoder. Do not derive
// offsets or expected bytes from the optimized implementation.
function reference(tags, seed, cohort, stratum, replicate, draw) {
  const integer = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; };
  const fields = [[tags.seed, seed], [tags.replicate, integer(replicate)], [tags.cohort_code, Buffer.from(cohort)], [tags.stratum_ordinal, integer(stratum)], [tags.draw, integer(draw)]];
  const frame = Buffer.concat(fields.map(([tag, payload]) => {
    const bytes = Buffer.alloc(5 + payload.length);
    bytes[0] = tag; bytes.writeUInt32BE(payload.length, 1); payload.copy(bytes, 5);
    return bytes;
  }));
  return createHash('sha256').update(frame).digest();
}

test('reused frames match independent SHA-256 framing for all 10,000 replicate ordinals', () => {
  for (const [tier, cohort, stratum, fill] of [['global', 'W1', 0, 0], ['project', 'H2', 17, 255], ['global', 'longer-ü-code', 0xffffffff, 71]]) {
    const tags = policyForTier(tier).bootstrap.frame.tags;
    const seed = Buffer.alloc(32, fill);
    const hash = createBootstrapDrawHasher({ tags, seed, cohortCode: cohort, stratumOrdinal: stratum });
    for (let replicate = 0; replicate < 10000; replicate++) {
      const draw = replicate % 31;
      assert.deepEqual(hash(replicate, draw), reference(tags, seed, cohort, stratum, replicate, draw));
    }
    for (const replicate of [0, 0xffffffff, 256, 65536]) assert.deepEqual(hash(replicate, 0xffffffff), reference(tags, seed, cohort, stratum, replicate, 0xffffffff));
    const retained = hash(0, 0); const copy = Buffer.from(retained);
    hash(1, 1);
    assert.deepEqual(retained, copy, 'returned digest must not alias mutable frame');
    seed.fill(22);
    assert.deepEqual(hash(0, 0), copy, 'frame owns its seed bytes');
  }
});

test('interleaved cohort hashers keep independent frames and reject invalid counters', () => {
  const tags = policyForTier('global').bootstrap.frame.tags; const seed = Buffer.alloc(32, 99);
  const left = createBootstrapDrawHasher({ tags, seed, cohortCode: 'W1', stratumOrdinal: 3 });
  const right = createBootstrapDrawHasher({ tags, seed, cohortCode: 'H1', stratumOrdinal: 3 });
  const first = left(0, 0); right(0, 0); left(8, 2);
  assert.deepEqual(left(0, 0), first);
  assert.notDeepEqual(first, right(0, 0));
  for (const invalid of [-1, 0x100000000, 1.5, NaN, Infinity, '1']) {
    assert.throws(() => left(invalid, 0));
    assert.throws(() => left(0, invalid));
  }
});
