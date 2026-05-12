import test from 'node:test';
import assert from 'node:assert/strict';

import { paginateTokenBuckets } from './token-pagination.ts';

test('paginateTokenBuckets returns weekly page windows with has_older/has_newer', () => {
  const buckets = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];

  const newest = paginateTokenBuckets(buckets, { granularity: 'week', page: 0 });
  assert.equal(newest.buckets.length, 7);
  assert.equal(newest.has_older, true);
  assert.equal(newest.has_newer, false);

  const older = paginateTokenBuckets(buckets, { granularity: 'week', page: 1 });
  assert.deepEqual(older.buckets, ['2026-05-01']);
  assert.equal(older.has_older, false);
  assert.equal(older.has_newer, true);
});

test('paginateTokenBuckets returns monthly 12-bucket window', () => {
  const buckets = Array.from({ length: 14 }, (_, index) => `2025-${String(index + 1).padStart(2, '0')}`);
  const newest = paginateTokenBuckets(buckets, { granularity: 'month', page: 0 });

  assert.equal(newest.buckets.length, 12);
  assert.equal(newest.has_older, true);
  assert.equal(newest.has_newer, false);
});
