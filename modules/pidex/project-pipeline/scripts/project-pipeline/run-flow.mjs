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

export function parseCredentialEntries(options = {}) {
  const entries = [];
  for (const [kind, source] of Object.entries(options.credentials || {})) {
    if (source) entries.push({ kind, source });
  }
  return entries;
}

export function runProjectPipelineFlow(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = options.projectId;
  if (!projectId) throw new Error('--project-id is required');
  if (process.env.PIDEX_PROJECT_PIPELINE_CHILD === '1') return { ok: false, error: 'project-pipeline-recursion-guard' };
  let lifecycle;
  try {
    loadProjectRecord(pidexRoot, projectId);
    lifecycle = openProjectSandbox({ pidexRoot, projectId, runner: options.runner });
  } catch {
    lifecycle = createProjectSandbox({ pidexRoot, projectId, name: options.name || projectId, image: options.image, sourceKind: options.sourceKind || 'empty', sourceRef: options.source || options.url || '', runner: options.runner });
  }
  if (!lifecycle.ok) return { ok: false, error: 'lifecycle-failed', lifecycle, no_fallback: true };

  let source;
  try {
    if (options.source) source = importLocalProject({ pidexRoot, projectId, source: options.source, runner: options.runner });
    else if (options.url) source = cloneProject({ pidexRoot, projectId, url: options.url, branch: options.branch, runner: options.runner });
    else source = { ok: true, kind: 'empty' };
  } catch (error) {
    return { ok: false, error: 'source-init-failed', reason: error.message || String(error), lifecycle, no_fallback: true };
  }
  if (!source.ok) return { ok: false, error: 'source-init-failed', source, no_fallback: true };

  const entries = options.entries || parseCredentialEntries(options);
  let credentials = { ok: true, inventory: [] };
  try {
    if (entries.length) {
      credentials = copySelectedCredentials({ pidexRoot, projectId, command: 'copy', acknowledgeTrustedPersistentContainer: options.acknowledgeTrustedPersistentContainer === true, entries, runner: options.runner });
      if (!credentials.ok) return { ok: false, error: 'credential-bootstrap-failed', credentials, no_fallback: true };
    }
  } catch (error) {
    return { ok: false, error: 'credential-bootstrap-failed', reason: error.message || String(error), lifecycle, source, no_fallback: true };
  }

  if (!options.agent) return { ok: true, lifecycle, source, credentials, run: undefined, no_fallback: true };
  let run;
  try {
    run = runProjectPipelineAgent({ pidexRoot, projectId, agent: options.agent, task: options.task || '', archiveFromContainer: true, runner: options.runner, archiveCopyRunner: options.runner });
  } catch (error) {
    return { ok: false, error: 'agent-run-failed', reason: error.message || String(error), lifecycle, source, credentials, no_fallback: true };
  }
  if (!run.ok) return { ok: false, error: 'agent-run-failed', lifecycle, source, credentials, run, no_fallback: true };
  return { ok: true, lifecycle, source, credentials, run, archive_context_file: run.archive_context_file, no_fallback: true };
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
    else if (arg === '--agent') out.agent = argv[++i];
    else if (arg === '--task') out.task = argv[++i];
    else if (arg === '--pi-auth') out.credentials['pi-auth'] = argv[++i];
    else if (arg === '--pi-settings') out.credentials['pi-settings'] = argv[++i];
    else if (arg === '--codex-auth') out.credentials['codex-auth'] = argv[++i];
    else if (arg === '--acknowledge-trusted-persistent-container') out.acknowledgeTrustedPersistentContainer = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: run-flow.mjs --pidex-root PATH --project-id ID [--source PATH|--url URL] [--pi-auth FILE --acknowledge-trusted-persistent-container] [--agent pidex-* --task TEXT] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = runProjectPipelineFlow(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : (result.ok ? 'ok' : result.error));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
