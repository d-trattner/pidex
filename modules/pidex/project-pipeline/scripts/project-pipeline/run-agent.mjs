#!/usr/bin/env node
import { dockerSpawnSync } from './docker-spawn.mjs';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadProjectRecord, saveProjectRecord } from './registry.mjs';
import { syncProjectArchive } from './archive-sync.mjs';
import { syncProjectMirror } from './project-mirror.mjs';

const CHILD_ENV = 'PIDEX_PROJECT_PIPELINE_CHILD';

function docker(args, opts = {}) {
  const proc = dockerSpawnSync(args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
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
  const matches = [...text.matchAll(/<!--\s*ROUTING([\s\S]*?)-->/gi)];
  const match = matches.at(-1);
  if (!match) return undefined;
  const routing = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (m) routing[m[1]] = m[2].trim();
  }
  return routing;
}

export function normalizeExpectedArtifactPath(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('expected artifact path is required');
  if (raw.includes('\0')) throw new Error('expected artifact path contains a NUL byte');
  if (raw.includes('\\')) throw new Error('expected artifact path must use POSIX separators; backslashes are not allowed');
  if (path.posix.isAbsolute(raw)) throw new Error('expected artifact path must be relative');
  const normalized = path.posix.normalize(raw);
  if (normalized !== raw || normalized.includes('..') || !normalized.startsWith('agents.output/') || normalized === 'agents.output/') throw new Error(`expected artifact path must be a normalized file under agents.output/: ${value}`);
  return normalized;
}

export function validateRouting(routing) {
  if (!routing) return { ok: false, reason: 'routing-missing' };
  if (!routing.context_file) return { ok: false, reason: 'context-file-missing' };
  try { return { ok: true, context_file: normalizeExpectedArtifactPath(routing.context_file) }; }
  catch { return { ok: false, reason: `context-file-invalid:${routing.context_file}` }; }
}

const MANIFEST_EXCLUDED_NAMES = new Set(['.git', 'node_modules', '.pnpm-store', '.cache']);

function hashBuffer(value) { return createHash('sha256').update(value).digest('hex'); }

function localWorkspaceManifest(root) {
  const manifest = {};
  let fileCount = 0;
  let totalBytes = 0;
  const walk = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (MANIFEST_EXCLUDED_NAMES.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) manifest[childRel] = `symlink:${readlinkSync(full)}`;
      else if (stat.isDirectory()) walk(full, childRel);
      else if (stat.isFile()) {
        fileCount += 1; totalBytes += stat.size;
        if (fileCount > 50_000 || totalBytes > 512 * 1024 * 1024 || stat.size > 50 * 1024 * 1024) throw new Error('workspace manifest bounds exceeded');
        manifest[childRel] = `file:${stat.mode}:${stat.size}:${hashBuffer(readFileSync(full))}`;
      }
      else manifest[childRel] = `other:${stat.mode}:${stat.size}`;
    }
  };
  walk(root);
  return manifest;
}

const CONTAINER_FILE_SCRIPT = String.raw`
const fs=require('fs'); const p=require('path'); const rel=process.argv[1];
try { const full=p.join('/workspace',rel); const st=fs.lstatSync(full); if(!st.isFile()) throw new Error('not-file'); const real=fs.realpathSync(full); if(!real.startsWith('/workspace/')) throw new Error('escape'); const text=fs.readFileSync(real,'utf8'); process.stdout.write(JSON.stringify({exists:true,nonempty:text.trim().length>0,text:text.slice(0,2097152)})); }
catch(e){ process.stdout.write(JSON.stringify({exists:false,nonempty:false,text:''})); }
`;

const CONTAINER_MANIFEST_SCRIPT = String.raw`
const fs=require('fs'); const p=require('path'); const c=require('crypto'); const out={}; const excluded=new Set(['.git','node_modules','.pnpm-store','.cache']); let fileCount=0,totalBytes=0;
function walk(dir,rel=''){ for(const name of fs.readdirSync(dir)){ if(excluded.has(name)) continue; const child=rel?rel+'/'+name:name; const full=p.join(dir,name); const st=fs.lstatSync(full); if(st.isSymbolicLink()) out[child]='symlink:'+fs.readlinkSync(full); else if(st.isDirectory()) walk(full,child); else if(st.isFile()){ fileCount++; totalBytes+=st.size; if(fileCount>50000||totalBytes>536870912||st.size>52428800) throw new Error('workspace manifest bounds exceeded'); const h=c.createHash('sha256').update(fs.readFileSync(full)).digest('hex'); out[child]='file:'+st.mode+':'+st.size+':'+h; } else out[child]='other:'+st.mode+':'+st.size; } }
walk('/workspace'); process.stdout.write(JSON.stringify(out));
`;

function readWorkspaceArtifact(record, relativePath, runner, archiveWorkspace) {
  if (archiveWorkspace) {
    const full = path.join(archiveWorkspace, ...relativePath.split('/'));
    if (!existsSync(full) || !lstatSync(full).isFile()) return { exists: false, nonempty: false, text: '' };
    const realRoot = realpathSync(archiveWorkspace);
    const real = realpathSync(full);
    const relative = path.relative(realRoot, real);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return { exists: false, nonempty: false, text: '' };
    const text = readFileSync(real, 'utf8').slice(0, 2 * 1024 * 1024);
    return { exists: true, nonempty: text.trim().length > 0, text };
  }
  const proc = runner(['exec', '--user', 'node', '--workdir', '/workspace', record.docker.container_name, 'node', '-e', CONTAINER_FILE_SCRIPT, relativePath]);
  if (proc.status !== 0) return { exists: false, nonempty: false, text: '' };
  try { return JSON.parse(proc.stdout || '{}'); } catch { return { exists: false, nonempty: false, text: '' }; }
}

function captureWorkspaceManifest(record, runner, archiveWorkspace) {
  if (archiveWorkspace) return localWorkspaceManifest(archiveWorkspace);
  const proc = runner(['exec', '--user', 'node', '--workdir', '/workspace', record.docker.container_name, 'node', '-e', CONTAINER_MANIFEST_SCRIPT]);
  if (proc.status !== 0) throw new Error('workspace manifest capture failed');
  return JSON.parse(proc.stdout || '{}');
}

export function diffWorkspaceManifests(before = {}, after = {}, allowedPath) {
  const changed = new Set();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) if (before[key] !== after[key]) changed.add(key);
  return { changed_paths: [...changed].sort(), unauthorized_paths: [...changed].filter((key) => key !== allowedPath).sort() };
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
      `Run PIDEX project-pipeline child agent. Agent: ${params.agent}. Working directory is /workspace.${params.expectedInputPaths?.length ? ` Exact input artifact(s): ${params.expectedInputPaths.join(', ')}.` : ''}${params.expectedOutputPath ? ` Exact assigned output artifact: ${params.expectedOutputPath}. Write no other artifact path.` : ''} Task:\n${params.task || ''}\n\nWrite the required artifact under /workspace/agents.output/**. Finish with an HTML comment ROUTING block exactly like:\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\nreason: short reason\ncontext_file: ${params.expectedOutputPath || 'agents.output/path/to/artifact.md'}\n-->\nThe context_file value must be a relative agents.output/** path, never an absolute path.`
    ]
  };
}

export function runProjectPipelineAgent(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  if (process.env[CHILD_ENV] === '1') return { ok: false, exitCode: 2, error: 'project-pipeline-recursion-guard', reason: 'project-pipeline child must not docker-exec itself' };
  const project_run_id = options.project_run_id || projectRunId();
  const runner = options.runner || ((args) => docker(args));
  let expectedOutputPath;
  let expectedInputPaths = [];
  try {
    if (options.expectedOutputPath) expectedOutputPath = normalizeExpectedArtifactPath(options.expectedOutputPath);
    const rawInputs = options.expectedInputPaths || (options.expectedInputPath ? [options.expectedInputPath] : []);
    expectedInputPaths = rawInputs.map(normalizeExpectedArtifactPath);
  } catch (error) {
    return { ok: false, exitCode: 2, error: 'expected-artifact-path-invalid', reason: error.message || String(error), project_run_id };
  }
  for (const input of expectedInputPaths) {
    const checked = readWorkspaceArtifact(record, input, runner, options.archiveWorkspace);
    if (!checked.exists) return { ok: false, exitCode: 1, error: 'expected-input-missing', reason: `expected input not found in /workspace: ${input}`, project_run_id };
  }
  if (expectedOutputPath && readWorkspaceArtifact(record, expectedOutputPath, runner, options.archiveWorkspace).exists) return { ok: false, exitCode: 1, error: 'expected-output-exists', reason: `refusing to overwrite expected output: ${expectedOutputPath}`, project_run_id };
  let beforeManifest;
  if (options.reviewWriteFence) {
    if (!expectedOutputPath) return { ok: false, exitCode: 2, error: 'write-fence-output-required', reason: 'review write fence requires expectedOutputPath', project_run_id };
    try { beforeManifest = captureWorkspaceManifest(record, runner, options.archiveWorkspace); }
    catch (error) { return { ok: false, exitCode: 1, error: 'write-fence-manifest-failed', reason: error.message || String(error), project_run_id }; }
  }
  const built = buildDockerExecArgs(record, { ...options, expectedInputPaths, expectedOutputPath, project_run_id });
  const started = new Date().toISOString();
  record.status = 'running';
  record.runs = [...(record.runs || []), { project_run_id, agent: options.agent || '', container_exec_id: '', started_at: started, archive_sync_status: 'pending', image_digest: record.docker.image || '', config_bundle_hash: options.configBundleHash || '', credential_inventory_hash: options.credentialInventoryHash || '' }];
  saveProjectRecord(pidexRoot, record);
  const proc = runner(built.args);
  const finalText = `${proc.stdout || ''}${proc.stderr ? `\nSTDERR:\n${proc.stderr}` : ''}`;
  let write_fence;
  if (options.reviewWriteFence) {
    try {
      const afterManifest = captureWorkspaceManifest(record, runner, options.archiveWorkspace);
      write_fence = { status: 'complete', ...diffWorkspaceManifests(beforeManifest, afterManifest, expectedOutputPath) };
    } catch (error) {
      write_fence = { status: 'failed', unauthorized_paths: [], reason: error.message || String(error) };
    }
  }
  let routing = extractRouting(finalText);
  let routingCheck = validateRouting(routing);
  let routing_recovered = false;
  const expectedArtifact = expectedOutputPath ? readWorkspaceArtifact(record, expectedOutputPath, runner, options.archiveWorkspace) : undefined;
  if (expectedOutputPath && routingCheck.ok && routingCheck.context_file !== expectedOutputPath) routingCheck = { ok: false, reason: `context-file-mismatch:${routingCheck.context_file}` };
  if (expectedOutputPath && !routingCheck.ok && (routingCheck.reason === 'routing-missing' || routingCheck.reason === 'context-file-missing')) {
    if (expectedArtifact?.exists && expectedArtifact.nonempty) {
      const artifactRouting = extractRouting(expectedArtifact.text);
      if (artifactRouting) {
        const artifactCheck = validateRouting(artifactRouting);
        routing = artifactRouting;
        routingCheck = artifactCheck.ok && artifactCheck.context_file !== expectedOutputPath
          ? { ok: false, reason: `context-file-mismatch:${artifactCheck.context_file}` }
          : artifactCheck;
        routing_recovered = routingCheck.ok;
      } else if (!options.requireExplicitRouting) {
        routing = { verdict: 'COMPLETE', route_to: 'orchestrator', reason: 'routing recovered from exact expected artifact', context_file: expectedOutputPath };
        routingCheck = { ok: true, context_file: expectedOutputPath };
        routing_recovered = true;
      }
    }
  }
  const loaded = loadProjectRecord(pidexRoot, record.project_id);
  const runEntry = loaded.runs.find((run) => run.project_run_id === project_run_id) || loaded.runs.at(-1);
  if (runEntry) {
    runEntry.ended_at = new Date().toISOString();
    runEntry.exit_code = proc.status;
    runEntry.container_exec_id = options.containerExecId || project_run_id;
    if (routingCheck.ok) runEntry.context_file = routingCheck.context_file;
  }
  let failure;
  if (proc.status !== 0) failure = { exitCode: proc.status, error: 'child-pi-failed' };
  else if (options.reviewWriteFence && write_fence?.status !== 'complete') failure = { exitCode: 1, error: 'write-fence-manifest-failed', reason: write_fence?.reason };
  else if (write_fence?.unauthorized_paths?.length) failure = { exitCode: 1, error: 'write-fence-violation', reason: 'review lane changed paths outside its assigned artifact' };
  else if (expectedOutputPath && (!expectedArtifact?.exists || !expectedArtifact.nonempty)) failure = { exitCode: 1, error: 'expected-output-missing', reason: `expected output missing or empty: ${expectedOutputPath}` };
  else if (!routingCheck.ok) failure = { exitCode: 1, error: 'routing-invalid', reason: routingCheck.reason };
  if (failure) {
    if (runEntry) {
      runEntry.error = failure.error;
      runEntry.reason = failure.reason || '';
      runEntry.archive_sync_status = 'failed';
      delete runEntry.context_file;
    }
    loaded.status = 'ready';
    saveProjectRecord(pidexRoot, loaded);
    return { ok: false, ...failure, finalText, routing, write_fence, project_run_id };
  }
  loaded.status = 'sync-pending';
  saveProjectRecord(pidexRoot, loaded);
  let archiveSyncReport;
  let archiveContextFile;
  let project_mirror;
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
    project_mirror = syncProjectMirror({ pidexRoot, projectId: record.project_id, internalDisposable: options.internalDisposable === true });
    const mirrorRecord = loadProjectRecord(pidexRoot, record.project_id);
    const mirrorRun = mirrorRecord.runs.find((run) => run.project_run_id === project_run_id) || mirrorRecord.runs.at(-1);
    const mirrorCounts = { copied: project_mirror.copied, updated: project_mirror.updated, deleted: project_mirror.deleted, conflicts: project_mirror.conflicts };
    if (mirrorRun) {
      mirrorRun.project_mirror_status = project_mirror.status;
      mirrorRun.project_mirror_degraded = project_mirror.degraded === true;
      mirrorRun.project_mirror_counts = mirrorCounts;
    }
    mirrorRecord.project_mirror = { status: project_mirror.status, degraded: project_mirror.degraded === true, counts: mirrorCounts, updated_at: new Date().toISOString() };
    saveProjectRecord(pidexRoot, mirrorRecord);
    if (copiedArchiveWorkspace) rmSync(copiedArchiveWorkspace.temp, { recursive: true, force: true });
  }
  return { ok: true, exitCode: 0, finalText, routing, routing_recovered, context_file: routingCheck.context_file, expected_context_file: expectedOutputPath, write_fence, archive_context_file: archiveContextFile, archive_sync_status: archiveSyncReport ? 'complete' : 'pending', archiveSyncReport, project_mirror, sync_degraded: project_mirror?.degraded === true, containerExecId: project_run_id, project_run_id, warnings: archiveSyncReport ? [] : ['archive sync pending; archive_context_file not available until sync completes'] };
}

function takeArg(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = takeArg(argv, i++, arg);
    else if (arg === '--project-id') out.projectId = takeArg(argv, i++, arg);
    else if (arg === '--agent') out.agent = takeArg(argv, i++, arg);
    else if (arg === '--task') out.task = takeArg(argv, i++, arg);
    else if (arg === '--provider') out.providerOverride = takeArg(argv, i++, arg);
    else if (arg === '--model') out.modelOverride = takeArg(argv, i++, arg);
    else if (arg === '--effort') out.effortOverride = takeArg(argv, i++, arg);
    else if (arg === '--expected-input') out.expectedInputPath = takeArg(argv, i++, arg);
    else if (arg === '--expected-output') out.expectedOutputPath = takeArg(argv, i++, arg);
    else if (arg === '--review-write-fence') out.reviewWriteFence = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!out.help) {
    if (!out.projectId) throw new Error('--project-id is required');
    if (!out.agent) throw new Error('--agent is required');
    if (!out.task) throw new Error('--task is required');
  }
  return out;
}

function usage() { return 'Usage: run-agent.mjs --pidex-root PATH --project-id ID --agent pidex-* --task TEXT [--provider ID --model ID --effort LEVEL --expected-input agents.output/... --expected-output agents.output/... --review-write-fence] --json'; }

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
