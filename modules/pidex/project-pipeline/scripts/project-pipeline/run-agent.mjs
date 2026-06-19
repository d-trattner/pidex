#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadProjectRecord, saveProjectRecord } from './registry.mjs';
import { syncProjectArchive } from './archive-sync.mjs';

const CHILD_ENV = 'PIDEX_PROJECT_PIPELINE_CHILD';

function docker(args, opts = {}) {
  const proc = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
  return { status: proc.status ?? 1, stdout: proc.stdout || '', stderr: proc.stderr || '' };
}

export function copyArchiveWorkspaceFromContainer(record, runner = docker) {
  const temp = mkdtempSync(path.join(tmpdir(), 'pidex-project-archive-'));
  const workspace = path.join(temp, 'workspace');
  mkdirSync(workspace, { recursive: true });
  const warnings = [];
  for (const source of ['agents.output', 'wiki']) {
    const proc = runner(['cp', `${record.docker.container_name}:/workspace/${source}`, path.join(workspace, source)]);
    if (proc.status !== 0) warnings.push({ source, reason: 'container-source-missing-or-copy-failed', stderr: proc.stderr || proc.stdout || '' });
  }
  return { temp, workspace, warnings };
}

export function extractRouting(finalText) {
  const text = String(finalText || '');
  const match = text.match(/<!--\s*ROUTING([\s\S]*?)-->/i);
  if (!match) return undefined;
  const routing = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (m) routing[m[1]] = m[2].trim();
  }
  return routing;
}

export function validateRouting(routing) {
  if (!routing) return { ok: false, reason: 'routing-missing' };
  if (!routing.context_file) return { ok: false, reason: 'context-file-missing' };
  const context = String(routing.context_file).replaceAll('\\', '/');
  if (!context.startsWith('agents.output/') || context.includes('..')) return { ok: false, reason: `context-file-invalid:${routing.context_file}` };
  return { ok: true, context_file: context };
}

export function projectRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `pprun-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildDockerExecArgs(record, params = {}) {
  const projectRun = params.project_run_id || projectRunId();
  const payload = Buffer.from(JSON.stringify({ agent: params.agent, task: params.task, cwd: '/workspace', provider: params.providerOverride, model: params.modelOverride, effort: params.effortOverride, tools: params.tools || [] })).toString('base64');
  return {
    project_run_id: projectRun,
    args: [
      'exec',
      '--user', 'node',
      '--workdir', '/workspace',
      '--env', `${CHILD_ENV}=1`,
      '--env', `PIDEX_PROJECT_ID=${record.project_id}`,
      '--env', `PIDEX_PROJECT_RUN_ID=${projectRun}`,
      '--env', `PIDEX_PROJECT_AGENT_PAYLOAD=${payload}`,
      record.docker.container_name,
      'pi',
      '--print',
      `Run PIDEX project-pipeline child agent. Agent: ${params.agent}. Working directory is /workspace. Task:\n${params.task || ''}\n\nWrite the required artifact under /workspace/agents.output/**. Finish with an HTML comment ROUTING block exactly like:\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\nreason: short reason\ncontext_file: agents.output/path/to/artifact.md\n-->\nThe context_file value must be a relative agents.output/** path, never an absolute path.`
    ]
  };
}

export function runProjectPipelineAgent(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  if (process.env[CHILD_ENV] === '1') return { ok: false, exitCode: 2, error: 'project-pipeline-recursion-guard', reason: 'project-pipeline child must not docker-exec itself' };
  const project_run_id = options.project_run_id || projectRunId();
  const runner = options.runner || ((args) => docker(args));
  const built = buildDockerExecArgs(record, { ...options, project_run_id });
  const started = new Date().toISOString();
  record.status = 'running';
  record.runs = [...(record.runs || []), { project_run_id, agent: options.agent || '', container_exec_id: '', started_at: started, archive_sync_status: 'pending', image_digest: record.docker.image || '', config_bundle_hash: options.configBundleHash || '', credential_inventory_hash: options.credentialInventoryHash || '' }];
  saveProjectRecord(pidexRoot, record);
  const proc = runner(built.args);
  const finalText = `${proc.stdout || ''}${proc.stderr ? `\nSTDERR:\n${proc.stderr}` : ''}`;
  const routing = extractRouting(finalText);
  const routingCheck = validateRouting(routing);
  const loaded = loadProjectRecord(pidexRoot, record.project_id);
  const runEntry = loaded.runs.find((run) => run.project_run_id === project_run_id) || loaded.runs.at(-1);
  if (runEntry) {
    runEntry.ended_at = new Date().toISOString();
    runEntry.exit_code = proc.status;
    runEntry.container_exec_id = options.containerExecId || project_run_id;
    if (routingCheck.ok) runEntry.context_file = routingCheck.context_file;
  }
  loaded.status = proc.status === 0 && routingCheck.ok ? 'sync-pending' : 'ready';
  saveProjectRecord(pidexRoot, loaded);
  if (proc.status !== 0) return { ok: false, exitCode: proc.status, error: 'child-pi-failed', finalText, routing };
  if (!routingCheck.ok) return { ok: false, exitCode: 1, error: 'routing-invalid', reason: routingCheck.reason, finalText, routing };
  let archiveSyncReport;
  let archiveContextFile;
  let copiedArchiveWorkspace;
  if (options.archiveWorkspace || options.archiveFromContainer !== false) {
    copiedArchiveWorkspace = options.archiveWorkspace ? undefined : copyArchiveWorkspaceFromContainer(record, options.archiveCopyRunner || runner);
    const archiveWorkspace = options.archiveWorkspace || copiedArchiveWorkspace.workspace;
    archiveSyncReport = syncProjectArchive({ workspace: archiveWorkspace, pidexRoot, projectId: record.project_id });
    if (copiedArchiveWorkspace?.warnings?.length) archiveSyncReport.warnings.push(...copiedArchiveWorkspace.warnings);
    const afterSync = loadProjectRecord(pidexRoot, record.project_id);
    const afterRun = afterSync.runs.find((run) => run.project_run_id === project_run_id) || afterSync.runs.at(-1);
    archiveContextFile = path.join(pidexRoot, 'state', 'project-archives', record.project_id, routingCheck.context_file);
    if (afterRun) {
      afterRun.archive_sync_status = archiveSyncReport.ok ? 'complete' : 'failed';
      if (archiveSyncReport.ok) afterRun.archive_context_file = archiveContextFile;
    }
    afterSync.status = archiveSyncReport.ok ? 'ready' : 'sync-failed';
    saveProjectRecord(pidexRoot, afterSync);
    if (!archiveSyncReport.ok) {
      if (copiedArchiveWorkspace) rmSync(copiedArchiveWorkspace.temp, { recursive: true, force: true });
      return { ok: false, exitCode: 1, error: 'archive-sync-failed', finalText, routing, archiveSyncReport };
    }
    if (!existsSync(archiveContextFile)) {
      const missingRecord = loadProjectRecord(pidexRoot, record.project_id);
      const missingRun = missingRecord.runs.find((run) => run.project_run_id === project_run_id) || missingRecord.runs.at(-1);
      if (missingRun) missingRun.archive_sync_status = 'failed';
      missingRecord.status = 'sync-failed';
      saveProjectRecord(pidexRoot, missingRecord);
      if (copiedArchiveWorkspace) rmSync(copiedArchiveWorkspace.temp, { recursive: true, force: true });
      return { ok: false, exitCode: 1, error: 'archive-context-missing', reason: `routed context file not found in archive: ${routingCheck.context_file}`, finalText, routing, archiveSyncReport };
    }
    if (copiedArchiveWorkspace) rmSync(copiedArchiveWorkspace.temp, { recursive: true, force: true });
  }
  return { ok: true, exitCode: 0, finalText, routing, context_file: routingCheck.context_file, archive_context_file: archiveContextFile, archive_sync_status: archiveSyncReport ? 'complete' : 'pending', archiveSyncReport, containerExecId: project_run_id, project_run_id, warnings: archiveSyncReport ? [] : ['archive sync pending; archive_context_file not available until sync completes'] };
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--agent') out.agent = argv[++i];
    else if (arg === '--task') out.task = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: run-agent.mjs --pidex-root PATH --project-id ID --agent pidex-* --task TEXT --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = runProjectPipelineAgent(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : (result.ok ? result.context_file : result.error));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
