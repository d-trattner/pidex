import { readFileSync } from 'node:fs';

const DIGEST = /^[a-f0-9]{64}$/;

/** Loads source-owned canonical Plan046 result examples without depending on agents.output process evidence. */
export function loadPlan046ImpactResultExamples() {
  return readFileSync(new URL('./plan046-impact-result-examples.tsv', import.meta.url), 'utf8').trimEnd().split(/\r?\n/).map((line) => {
    const first = line.indexOf('\t'); const second = line.indexOf('\t', first + 1);
    if (first !== 64 || second !== 129) throw new Error('PLAN046_RESULT_FIXTURE_INVALID');
    const identity_digest = line.slice(0, first); const result_digest = line.slice(first + 1, second); const json = line.slice(second + 1);
    if (!DIGEST.test(identity_digest) || !DIGEST.test(result_digest) || !json.startsWith('{"schema":"passive-impact-')) throw new Error('PLAN046_RESULT_FIXTURE_INVALID');
    return Object.freeze({ identity_digest, result_digest, bytes: Buffer.from(json, 'utf8') });
  });
}

/** Reuses the tracked evaluator-input golden catalog as the accepted opening example. */
export function loadPlan046EvaluatorInputExampleBytes() {
  const catalog = JSON.parse(readFileSync(new URL('./passive-impact-v1-golden.json', import.meta.url), 'utf8'));
  const bytes = catalog?.evaluator_input_vectors?.[0]?.bytes;
  if (typeof bytes !== 'string' || !bytes.startsWith('{"schema":"rule-impact-evaluator-input-v1"')) throw new Error('PLAN046_EVALUATOR_FIXTURE_INVALID');
  return Buffer.from(bytes, 'utf8');
}
