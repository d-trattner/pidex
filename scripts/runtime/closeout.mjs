#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmPipelineCloseout } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';

export function closeoutCli(argv, env = process.env) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const values = {};
  const flags = new Set(['--project', '--plan', '--pipeline-id', '--state-dir', '--event', '--message']);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flags.has(flag) || flag in values || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('PIPELINE_CLOSEOUT_SYNTAX');
    values[flag] = argv[++i];
  }
  if (!values['--project'] || !values['--plan'] || !values['--pipeline-id']) throw new Error('PIPELINE_CLOSEOUT_SYNTAX');
  const event = values['--event'] ?? 'pipeline_completed';
  const status = { pipeline_completed: 'completed', pipeline_failed: 'failed', pipeline_aborted: 'aborted', pipeline_cancelled: 'cancelled' }[event];
  const result = confirmPipelineCloseout({
    project: path.resolve(values['--project']), plan: values['--plan'], pipelineId: values['--pipeline-id'],
    stateDir: values['--state-dir'] ? path.resolve(values['--state-dir']) : resolveStateRoot({ root, env }),
    event, status, actor: 'orchestrator', source: 'manual', message: values['--message'] ?? 'Explicit local closeout confirmed',
  });
  return { status: 'confirmed', pipelineId: result.pipelineId, planId: result.record.plan_key, event: result.record.event_type, alreadyRecorded: result.alreadyRecorded };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(closeoutCli(process.argv.slice(2)))); }
  catch (error) {
    const code = /^(PIPELINE|REVIEW|PATH)_[A-Z_]+$/.test(error.message) ? error.message : 'PIPELINE_CLOSEOUT_UNAVAILABLE';
    console.error(JSON.stringify({ status: 'refused', code }));
    process.exitCode = code === 'PIPELINE_CLOSEOUT_SYNTAX' ? 2 : 3;
  }
}
