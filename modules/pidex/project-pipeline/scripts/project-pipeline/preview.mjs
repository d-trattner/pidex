#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocatePreviewPorts, candidateRanges, choosePreviewBindMode, parsePreviewPortConfig, resolveOperatorHost } from './ports.mjs';
import { ensurePreviewContainerPublished, publishedPortsForContainer } from './lifecycle.mjs';
import { createProcessManager } from './process.mjs';
import { loadProjectRecord, saveProjectRecord, safeProjectId } from './registry.mjs';

export function parsePreviewArgs(argv) {
  const separator = argv.indexOf('--');
  const prefix = separator === -1 ? argv : argv.slice(0, separator);
  const tail = separator === -1 ? [] : argv.slice(separator + 1);
  const out = { json: false };
  for (let i = 0; i < prefix.length; i += 1) {
    const arg = prefix[i];
    if (['start', 'status', 'logs', 'stop'].includes(arg) && !out.action) out.action = arg;
    else if (arg === '--pidex-root') out.pidexRoot = prefix[++i];
    else if (arg === '--project-id') out.projectId = prefix[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown preview argument: ${arg}`);
  }
  if (!out.help && !out.action) throw new Error('preview action is required');
  if (!out.help && !out.pidexRoot) throw new Error('--pidex-root is required');
  if (!out.help && !out.projectId) throw new Error('--project-id is required');
  if (out.action === 'start') {
    if (!tail.length) throw new Error('preview start requires -- command');
    out.command = tail;
  } else if (tail.length) throw new Error(`preview ${out.action} does not accept a command tail`);
  return out;
}

function commandLabel(command) {
  return command.join(' ').replace(/(token|secret|password)=[^\s]+/gi, '$1=<redacted>').slice(0, 160);
}

const CONTAINER_PROCESS_MANAGER_PATH = '/cache/pidex-preview/manager/process.mjs';
const CONTAINER_PROCESS_STATE_ROOT = '/cache/pidex-preview';
const CONTAINER_WORKSPACE = '/workspace';

function docker(args) {
  const proc = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (proc.status !== 0) {
    const error = new Error('docker operation failed');
    error.status = proc.status;
    error.stdout = proc.stdout;
    error.stderr = proc.stderr;
    throw error;
  }
  return proc.stdout;
}

function dockerOutput(result) {
  if (typeof result === 'string') return result;
  if (result && typeof result.stdout === 'string') return result.stdout;
  return String(result || '');
}

function tryParseContainerJson(output) {
  try {
    const text = String(output || '').trim();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function parseContainerJson(output) {
  return tryParseContainerJson(output) || { ok: false, status: 'failed', error_category: 'preview_container_exec_invalid_json' };
}

export function createDockerExecProcessManager(record, options = {}) {
  const containerName = record?.docker?.container_name;
  if (!containerName) return createFailClosedProcessManager('preview_container_boundary_unavailable');
  const runner = options.runner || docker;
  const localProcessManager = fileURLToPath(new URL('./process.mjs', import.meta.url));

  function ensureManager() {
    runner(['exec', '--user', 'node', containerName, 'mkdir', '-p', path.dirname(CONTAINER_PROCESS_MANAGER_PATH)]);
    runner(['cp', localProcessManager, `${containerName}:${CONTAINER_PROCESS_MANAGER_PATH}`]);
  }

  function execManager(action, args = {}) {
    try {
      ensureManager();
      const cli = ['exec', '--user', 'node', '--workdir', CONTAINER_WORKSPACE, containerName, 'node', CONTAINER_PROCESS_MANAGER_PATH, action, '--json', '--state-root', CONTAINER_PROCESS_STATE_ROOT, '--workspace', CONTAINER_WORKSPACE, '--process-name', args.processName || 'preview'];
      if (args.containerPort) cli.push('--port', String(args.containerPort));
      if (args.maxBytes) cli.push('--max-bytes', String(args.maxBytes));
      if (args.readinessTimeoutMs) cli.push('--readiness-timeout-ms', String(args.readinessTimeoutMs));
      if (args.stopTimeoutMs) cli.push('--stop-timeout-ms', String(args.stopTimeoutMs));
      if (action === 'start') cli.push('--', ...(args.command || []));
      return parseContainerJson(dockerOutput(runner(cli)));
    } catch (error) {
      const helperResult = tryParseContainerJson(error?.stdout);
      if (helperResult) return helperResult;
      return { ok: false, status: 'failed', error_category: 'preview_container_exec_failed' };
    }
  }

  return {
    start: (args = {}) => execManager('start', args),
    status: (args = {}) => execManager('status', args),
    logs: (args = {}) => execManager('logs', args),
    stop: (args = {}) => execManager('stop', args),
  };
}

function createFailClosedProcessManager(errorCategory) {
  const failed = async () => ({ ok: false, status: 'failed', error_category: errorCategory });
  return { start: failed, status: failed, logs: failed, stop: failed };
}

function processManagerFor(options = {}, record = undefined) {
  if (options.processManager) return options.processManager;
  if (options.processStateRoot || options.workspace) return createProcessManager({ stateRoot: options.processStateRoot, workspace: options.workspace, readinessTimeoutMs: options.readinessTimeoutMs, stopTimeoutMs: options.stopTimeoutMs });
  return createDockerExecProcessManager(record, options);
}

export function adoptPublishedPreviewPorts(record, options = {}) {
  if (record.preview?.ports) return record;
  let published = [];
  try { published = publishedPortsForContainer(record, options.runner); } catch { return record; }
  if (!published.length) return record;
  const env = options.env || process.env;
  const config = parsePreviewPortConfig(env);
  const expectedHostBind = options.hostBind || choosePreviewBindMode({ platform: options.platform || process.platform, headless: options.headless, remote: options.remote, env });
  const publishedSet = new Set(published.map((port) => `${port.hostBind}:${port.hostPort}:${port.containerPort}`));
  for (const candidate of candidateRanges(config)) {
    let complete = true;
    for (let offset = 0; offset < candidate.size; offset += 1) {
      const hostPort = candidate.base + offset;
      const containerPort = candidate.container_base + offset;
      if (!publishedSet.has(`${expectedHostBind}:${hostPort}:${containerPort}`)) {
        complete = false;
        break;
      }
    }
    if (!complete) continue;
    const previousGeneration = Number(record.preview?.ports?.generation || 0);
    return {
      ...record,
      schema_version: 2,
      features: { ...(record.features || {}), preview_ports: true },
      preview: {
        ...(record.preview || {}),
        ports: {
          base: candidate.base,
          size: candidate.size,
          host_bind: expectedHostBind,
          container_base: candidate.container_base,
          assigned_at: new Date().toISOString(),
          assigned_by: 'adopt-published',
          generation: previousGeneration + 1,
        },
      },
    };
  }
  return record;
}

export async function previewStart(options) {
  const projectId = safeProjectId(options.projectId);
  const existingRecord = loadProjectRecord(options.pidexRoot, projectId);
  let record = existingRecord.preview?.ports ? existingRecord : adoptPublishedPreviewPorts(existingRecord, options);
  if (record !== existingRecord) saveProjectRecord(options.pidexRoot, record);
  if (!record.preview?.ports) record = (await allocatePreviewPorts(options.pidexRoot, projectId, options)).record;
  const lifecycleManager = options.lifecycleManager || { ensurePreviewContainerPublished };
  const published = await lifecycleManager.ensurePreviewContainerPublished({
    pidexRoot: options.pidexRoot,
    projectId,
    record,
    runner: options.runner,
    verifyPublishedPorts: options.verifyPublishedPorts,
    reassignPorts: options.reassignPorts || ((reassignOptions) => allocatePreviewPorts(options.pidexRoot, projectId, { ...options, ...reassignOptions })),
  });
  if (!published.ok) return { ok: false, action: 'start', project_id: projectId, status: 'failed', error_category: published.error_category || 'preview_recreate_blocked' };
  record = published.record;
  const ports = record.preview.ports;
  const operator = resolveOperatorHost({ hostBind: ports.host_bind, env: options.env || process.env, projectHost: record.preview?.host?.operator_host, networkInterfaces: options.networkInterfaces });
  const hostPort = ports.base;
  const containerPort = ports.container_base;
  const operatorUrl = `http://${operator.operatorHost}:${hostPort}`;
  const manager = processManagerFor(options, record);
  const started = await manager.start({ projectId, processName: 'preview', command: options.command, hostPort, containerPort, hostBind: ports.host_bind, env: { ...(options.commandEnv || {}), HOST: '0.0.0.0', PORT: String(containerPort), PIDEX_PREVIEW_HOST: '0.0.0.0', PIDEX_PREVIEW_PORT: String(containerPort) }, readinessTimeoutMs: options.readinessTimeoutMs });
  const ok = started.ok === true;
  record.preview = {
    ...(record.preview || {}),
    host: { operator_host: operator.operatorHost, operator_host_source: operator.source, updated_at: new Date().toISOString() },
    processes: {
      ...(record.preview?.processes || {}),
      preview: {
        status: ok ? 'running' : 'failed',
        operator_url: ok ? operatorUrl : '',
        host_bind: ports.host_bind,
        host_port: hostPort,
        container_port: containerPort,
        health_path: '/',
        started_at: ok ? new Date().toISOString() : '',
        stopped_at: '',
        last_error_category: ok ? '' : (started.error_category || 'preview_process_start_failed'),
        command_label: commandLabel(options.command || []),
      },
    },
  };
  saveProjectRecord(options.pidexRoot, record);
  if (!ok) return { ok: false, action: 'start', project_id: projectId, status: 'failed', error_category: started.error_category || 'preview_process_start_failed' };
  return {
    ok: true,
    action: 'start',
    project_id: projectId,
    status: 'running',
    operator_url: operatorUrl,
    host_bind: ports.host_bind,
    host_port: hostPort,
    container_port: containerPort,
    operator_host_source: operator.source,
    exposure_note: ports.host_bind === '0.0.0.0' ? 'Exposure: preview is bound to all interfaces on this Docker host. PIDEX did not open firewalls or tunnels.' : '',
  };
}

function previewPortsFromRecord(record) {
  const ports = record.preview?.ports;
  const processState = record.preview?.processes?.preview || {};
  return {
    hostPort: processState.host_port || ports?.base,
    containerPort: processState.container_port || ports?.container_base || ports?.base,
  };
}

export async function previewStatus(options) {
  const projectId = safeProjectId(options.projectId);
  const record = loadProjectRecord(options.pidexRoot, projectId);
  const ports = previewPortsFromRecord(record);
  const manager = processManagerFor(options, record);
  const status = await manager.status({ processName: 'preview', containerPort: ports.containerPort });
  const processState = record.preview?.processes?.preview || {};
  return { ok: status.ok !== false, action: 'status', project_id: projectId, status: status.status, operator_url: processState.operator_url || '', host_port: ports.hostPort, container_port: ports.containerPort, error_category: status.error_category || '' };
}

export async function previewLogs(options) {
  const projectId = safeProjectId(options.projectId);
  const record = loadProjectRecord(options.pidexRoot, projectId);
  const ports = previewPortsFromRecord(record);
  const manager = processManagerFor(options, record);
  const logs = await manager.logs({ processName: 'preview', containerPort: ports.containerPort, maxBytes: options.maxBytes });
  return { ok: logs.ok !== false, action: 'logs', project_id: projectId, status: logs.status || 'ok', log_excerpt: logs.text || '', error_category: logs.error_category || '' };
}

export async function previewStop(options) {
  const projectId = safeProjectId(options.projectId);
  const record = loadProjectRecord(options.pidexRoot, projectId);
  const ports = previewPortsFromRecord(record);
  const manager = processManagerFor(options, record);
  const stopped = await manager.stop({ processName: 'preview', containerPort: ports.containerPort, stopTimeoutMs: options.stopTimeoutMs });
  record.preview = record.preview || {};
  record.preview.processes = record.preview.processes || {};
  record.preview.processes.preview = { ...(record.preview.processes.preview || {}), status: stopped.ok ? 'stopped' : 'stopping', stopped_at: new Date().toISOString(), last_error_category: stopped.error_category || '' };
  saveProjectRecord(options.pidexRoot, record);
  return { ok: stopped.ok !== false, action: 'stop', project_id: projectId, status: stopped.status, error_category: stopped.error_category || '' };
}

export function summarizePreviewResult(result) {
  if (result.ok && result.action === 'start') {
    return [
      `Preview ready for ${result.project_id}:`,
      result.operator_url,
      result.exposure_note || undefined,
      '',
      `Logs: /pdproject preview logs ${result.project_id}`,
      `Stop: /pdproject preview stop ${result.project_id}`,
    ].filter((line) => line !== undefined).join('\n');
  }
  if (!result.ok && result.error_category === 'preview_operator_host_unknown') return 'Preview port is bound, but PIDEX could not determine the host/IP to show your browser. Set PIDEX_PROJECT_PIPELINE_PREVIEW_HOST and retry.';
  if (!result.ok && result.error_category === 'preview_port_not_listening') return `Preview process started but did not become reachable on the assigned port before timeout. Check bounded logs with /pdproject preview logs ${result.project_id}.`;
  if (!result.ok) return 'Preview could not safely reserve a local port range for this Project Pipeline sandbox. No fallback was used.';
  return `${result.project_id}: preview status=${result.status || 'unknown'}`;
}

function usage() { return 'Usage: preview.mjs start|status|logs|stop --pidex-root PATH --project-id ID [--json] -- <command>'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parsePreviewArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    let result;
    if (args.action === 'start') result = await previewStart(args);
    else if (args.action === 'status') result = await previewStatus(args);
    else if (args.action === 'logs') result = await previewLogs(args);
    else if (args.action === 'stop') result = await previewStop(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : summarizePreviewResult(result));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    const result = { ok: false, action: 'preview', error_category: error.category || 'preview_failed' };
    console.error(JSON.stringify(result));
    console.error(usage());
    process.exit(2);
  }
}
