#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocatePreviewPorts, resolveOperatorHost } from './ports.mjs';
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

function defaultProcessManager() {
  return {
    async start() {
      return { ok: false, status: 'failed', error_category: 'preview_process_manager_unavailable' };
    },
  };
}

export async function previewStart(options) {
  const projectId = safeProjectId(options.projectId);
  const allocated = await allocatePreviewPorts(options.pidexRoot, projectId, options);
  const record = allocated.record;
  const ports = record.preview.ports;
  const operator = resolveOperatorHost({ hostBind: ports.host_bind, env: options.env || process.env, projectHost: record.preview?.host?.operator_host, networkInterfaces: options.networkInterfaces });
  const hostPort = ports.base;
  const containerPort = ports.container_base;
  const operatorUrl = `http://${operator.operatorHost}:${hostPort}`;
  const manager = options.processManager || defaultProcessManager();
  const started = await manager.start({ projectId, command: options.command, hostPort, containerPort, hostBind: ports.host_bind, env: { HOST: '0.0.0.0', PORT: String(containerPort), PIDEX_PREVIEW_HOST: '0.0.0.0', PIDEX_PREVIEW_PORT: String(containerPort) } });
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
    else {
      const record = loadProjectRecord(args.pidexRoot, args.projectId);
      result = { ok: true, action: args.action, project_id: record.project_id, status: record.preview?.processes?.preview?.status || 'stopped', operator_url: record.preview?.processes?.preview?.operator_url || '' };
    }
    console.log(args.json ? JSON.stringify(result, null, 2) : summarizePreviewResult(result));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    const result = { ok: false, action: 'preview', error_category: error.category || 'preview_failed' };
    console.error(JSON.stringify(result));
    console.error(usage());
    process.exit(2);
  }
}
