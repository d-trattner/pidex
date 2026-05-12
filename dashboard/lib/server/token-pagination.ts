export type TokenGranularity = 'week' | 'month';

export function paginateTokenBuckets(
  sortedBuckets: string[],
  options: { granularity: TokenGranularity; page: number },
): { buckets: string[]; has_older: boolean; has_newer: boolean } {
  const size = options.granularity === 'month' ? 12 : 7;
  const safePage = Math.max(0, Math.floor(options.page));
  const endExclusive = Math.max(0, sortedBuckets.length - safePage * size);
  const start = Math.max(0, endExclusive - size);
  const buckets = sortedBuckets.slice(start, endExclusive);

  return {
    buckets,
    has_older: start > 0,
    has_newer: endExclusive < sortedBuckets.length,
  };
}
