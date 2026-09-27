import { writeSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

// Dedicated read-only process: the parent can stop synchronous filesystem I/O.
// No filenames, contents, configuration or environment values in progress.
const emit = event => writeSync(1, JSON.stringify(event) + '\n');
const started = performance.now();
emit({ event: 'start', scope: 'seed-dependency-digest', pid: process.pid });
try {
  if (process.argv.length !== 3) throw new Error('Expected one seed source');
  emit({ event: 'phase', operation: 'import-digest' });
  const { seedDependencyDigest } = await import('./dependency-digest.mjs');
  const seen = new Set(); let last = -Infinity; let largeReports = 0; let counts;
  const digest = seedDependencyDigest(process.argv[2], { onProgress: progress => {
    const now = performance.now(); counts = progress;
    const large = progress.operation === 'read-file' && progress.currentFileBytes >= 1024 * 1024 && largeReports < 32;
    if (!seen.has(progress.operation) || now - last >= 1000 || large || progress.operation === 'complete') {
      if (large) largeReports++;
      seen.add(progress.operation); last = now;
      emit({ event: 'progress', elapsedMs: now - started, ...progress });
    }
  } });
  emit({ event: 'complete', scope: 'seed-dependency-digest', digest, elapsedMs: performance.now() - started, counts });
} catch (error) {
  emit({ event: 'error', code: typeof error.code === 'string' ? error.code : 'DEPENDENCY_GUARD_REJECTED' });
  process.exitCode = 2;
}
