#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectHostCloseout } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';
export function closeoutStatusCli(argv, env = process.env) {
  const values = {}; const allowed = ['--project', '--plan', '--pipeline-id', '--dispatch-id', '--state-dir'];
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!allowed.includes(key) || Object.hasOwn(values, key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('PIPELINE_CLOSEOUT_SYNTAX');
    values[key] = argv[++i];
  }
  if (allowed.slice(0, 4).some(k => !values[k])) throw new Error('PIPELINE_CLOSEOUT_SYNTAX');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  return inspectHostCloseout({ stateDir: values['--state-dir'] ? path.resolve(values['--state-dir']) : resolveStateRoot({ root, env }), project: path.resolve(values['--project']), planId: values['--plan'], pipelineId: values['--pipeline-id'], dispatchId: values['--dispatch-id'] });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(closeoutStatusCli(process.argv.slice(2)))); }
  catch (e) { console.error(JSON.stringify({ status: 'unavailable', code: /^PIPELINE_CLOSEOUT_[A-Z_]+$/.test(e.message) ? e.message : 'PIPELINE_CLOSEOUT_UNAVAILABLE' })); process.exitCode = 2; }
}
