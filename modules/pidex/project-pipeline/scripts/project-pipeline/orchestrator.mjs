#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProjectSandbox, openProjectSandbox } from './lifecycle.mjs';
import { importLocalProject } from './import-local.mjs';
import { cloneProject } from './clone.mjs';
import { copySelectedCredentials } from './credentials.mjs';
import { runProjectPipelineAgent } from './run-agent.mjs';
import { loadProjectRecord } from './registry.mjs';
import { parseCredentialEntries } from './run-flow.mjs';

export const DEFAULT_PROJECT_PIPELINE_PHASES = Object.freeze([
  'pidex-planner',
  'pidex-critic',
  'pidex-implementer',
  'pidex-code-reviewer',
  'pidex-security',
  'pidex-qa',
]);

export function parsePhaseList(value) {
  if (!value) return [...DEFAULT_PROJECT_PIPELINE_PHASES];
  const phases = String(value).split(',').map((part) => part.trim()).filter(Boolean);
  if (!phases.length) throw new Error('--phases must include at least one pidex-* agent');
  for (const phase of phases) {
    if (!/^pidex-[a-z0-9-]+$/.test(phase)) throw new Error(`invalid project-pipeline phase: ${phase}`);
  }
  return phases;
}

export function buildPhaseTask({ phase, initialTask, previous, phaseIndex, phaseCount }) {
  const lines = [
    `Project Pipeline in-container orchestration phase ${phaseIndex + 1}/${phaseCount}: ${phase}.`,
    'You are running inside the persistent Project Sandbox at /workspace.',
    'Do not use host-direct or hardened-pipeline fallback.',
    'Do not mirror source back to the host. Host archive sync is limited to agents.output/** and wiki/**.',
    `Original user task:\n${initialTask || ''}`,
  ];
  if (previous?.context_file) {
    lines.push(`Previous phase: ${previous.agent}`);
    lines.push(`Previous context file in the container: ${previous.context_file}`);
    lines.push('Read/use that context file if needed, then write your own full phase artifact under agents.output/**.');
  } else {
    lines.push('Write your full phase artifact under agents.output/**.');
  }
  lines.push('Finish with a ROUTING HTML comment whose context_file is your artifact path under agents.output/**.');
  return lines.join('\n\n');
}

function ensureSandboxAndSource(options, pidexRoot, projectId) {
  let lifecycle;
  try {
    loadProjectRecord(pidexRoot, projectId);
    lifecycle = openProjectSandbox({ pidexRoot, projectId, runner: options.runner });
  } catch {
    lifecycle = createProjectSandbox({ pidexRoot, projectId, name: options.name || projectId, image: options.image, sourceKind: options.sourceKind || 'empty', sourceRef: options.source || options.url || '', runner: options.runner });
  }
  if (!lifecycle.ok) return { ok: false, error: 'lifecycle-failed', lifecycle, no_fallback: true };

  try {
    if (options.source) return { ok: true, lifecycle, source: importLocalProject({ pidexRoot, projectId, source: options.source, runner: options.runner }) };
    if (options.url) return { ok: true, lifecycle, source: cloneProject({ pidexRoot, projectId, url: options.url, branch: options.branch, runner: options.runner }) };
    return { ok: true, lifecycle, source: { ok: true, kind: 'empty' } };
  } catch (error) {
    return { ok: false, error: 'source-init-failed', reason: error.message || String(error), lifecycle, no_fallback: true };
  }
}

export function runProjectPipelineOrchestration(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = options.projectId;
  if (!projectId) throw new Error('--project-id is required');
  if (process.env.PIDEX_PROJECT_PIPELINE_CHILD === '1') return { ok: false, error: 'project-pipeline-recursion-guard', no_fallback: true };
  const phases = Array.isArray(options.phases) ? options.phases : parsePhaseList(options.phases);
  const setup = ensureSandboxAndSource(options, pidexRoot, projectId);
  if (!setup.ok) return setup;
  if (setup.source?.ok === false) return { ok: false, error: 'source-init-failed', lifecycle: setup.lifecycle, source: setup.source, no_fallback: true };

  const entries = options.entries || parseCredentialEntries(options);
  let credentials = { ok: true, inventory: [] };
  try {
    if (entries.length) {
      credentials = copySelectedCredentials({ pidexRoot, projectId, command: 'copy', acknowledgeTrustedPersistentContainer: options.acknowledgeTrustedPersistentContainer === true, entries, runner: options.runner });
      if (!credentials.ok) return { ok: false, error: 'credential-bootstrap-failed', credentials, no_fallback: true };
    }
  } catch (error) {
    return { ok: false, error: 'credential-bootstrap-failed', reason: error.message || String(error), lifecycle: setup.lifecycle, source: setup.source, no_fallback: true };
  }

  const runs = [];
  let previous;
  for (let i = 0; i < phases.length; i += 1) {
    const agent = phases[i];
    const task = buildPhaseTask({ phase: agent, initialTask: options.task || '', previous, phaseIndex: i, phaseCount: phases.length });
    let run;
    try {
      run = runProjectPipelineAgent({
        pidexRoot,
        projectId,
        agent,
        task,
        archiveFromContainer: options.archiveFromContainer !== false,
        archiveWorkspace: options.archiveWorkspace,
        runner: options.runner,
        archiveCopyRunner: options.runner,
      });
    } catch (error) {
      return { ok: false, error: 'agent-run-failed', failed_agent: agent, reason: error.message || String(error), lifecycle: setup.lifecycle, source: setup.source, credentials, runs, no_fallback: true };
    }
    runs.push({ agent, ok: run.ok, context_file: run.context_file, archive_context_file: run.archive_context_file, project_run_id: run.project_run_id, archive_sync_status: run.archive_sync_status, error: run.error, reason: run.reason });
    if (!run.ok) return { ok: false, error: 'agent-run-failed', failed_agent: agent, lifecycle: setup.lifecycle, source: setup.source, credentials, runs, run, no_fallback: true };
    previous = { agent, context_file: run.context_file, archive_context_file: run.archive_context_file, project_run_id: run.project_run_id };
  }
  return { ok: true, lifecycle: setup.lifecycle, source: setup.source, credentials, phases, runs, final_context_file: previous?.context_file, final_archive_context_file: previous?.archive_context_file, no_fallback: true };
}

export function parseArgs(argv) {
  const out = { json: false, credentials: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--name') out.name = argv[++i];
    else if (arg === '--image') out.image = argv[++i];
    else if (arg === '--source') out.source = argv[++i];
    else if (arg === '--url') out.url = argv[++i];
    else if (arg === '--branch') out.branch = argv[++i];
    else if (arg === '--task') out.task = argv[++i];
    else if (arg === '--phases') out.phases = argv[++i];
    else if (arg === '--pi-auth') out.credentials['pi-auth'] = argv[++i];
    else if (arg === '--pi-settings') out.credentials['pi-settings'] = argv[++i];
    else if (arg === '--codex-auth') out.credentials['codex-auth'] = argv[++i];
    else if (arg === '--acknowledge-trusted-persistent-container') out.acknowledgeTrustedPersistentContainer = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (typeof out.phases === 'string') out.phases = parsePhaseList(out.phases);
  return out;
}

function usage() { return 'Usage: orchestrator.mjs --pidex-root PATH --project-id ID [--source PATH|--url URL] --task TEXT [--phases pidex-planner,pidex-critic,...] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = runProjectPipelineOrchestration(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : (result.ok ? result.final_context_file : result.error));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
