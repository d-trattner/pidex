#!/usr/bin/env node
import net from 'node:net';
import os from 'node:os';
import { loadProjectRecord, saveProjectRecord, listProjectRecords, withRegistryLock } from './registry.mjs';

const TCP_MIN = 1;
const TCP_MAX = 65535;
const DEFAULTS = { base: 42000, poolSize: 2000, rangeSize: 20 };

export class PreviewPortError extends Error {
  constructor(category, message = category) {
    super(`${category}: ${message}`);
    this.name = 'PreviewPortError';
    this.category = category;
  }
}

function parseInteger(value, fallback, name) {
  const raw = value === undefined || value === '' ? String(fallback) : String(value);
  if (!/^[0-9]+$/.test(raw)) throw new PreviewPortError('preview_port_config_invalid', `${name} must be an integer`);
  return Number(raw);
}

export function parsePreviewPortConfig(env = process.env) {
  const base = parseInteger(env.PIDEX_PROJECT_PIPELINE_PORT_BASE, DEFAULTS.base, 'base');
  const poolSize = parseInteger(env.PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE, DEFAULTS.poolSize, 'pool size');
  const rangeSize = parseInteger(env.PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE, DEFAULTS.rangeSize, 'range size');
  if (base < TCP_MIN || base > TCP_MAX || poolSize <= 0 || rangeSize <= 0 || rangeSize > poolSize || base + poolSize - 1 > TCP_MAX) {
    throw new PreviewPortError('preview_port_config_invalid', 'preview port pool is outside valid TCP range');
  }
  return { base, poolSize, rangeSize };
}

export function candidateRanges(config) {
  const ranges = [];
  for (let base = config.base; base + config.rangeSize - 1 <= config.base + config.poolSize - 1; base += config.rangeSize) {
    ranges.push({ base, size: config.rangeSize, container_base: base });
  }
  return ranges;
}

function rangesOverlap(aBase, aSize, bBase, bSize) {
  return aBase <= bBase + bSize - 1 && bBase <= aBase + aSize - 1;
}

export async function probeHostPort(port, host = '127.0.0.1') {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

async function rangeAvailable(range, hostBind, probePort) {
  for (let port = range.base; port < range.base + range.size; port += 1) {
    if (!await probePort(port, hostBind)) return false;
  }
  return true;
}

export function choosePreviewBindMode(options = {}) {
  if (options.bind === '127.0.0.1' || options.bind === '0.0.0.0') return options.bind;
  if (options.platform === 'win32' || options.platform === 'darwin') return '127.0.0.1';
  if (options.headless === true || options.remote === true || options.env?.PIDEX_PROJECT_PIPELINE_PREVIEW_HOST) return '0.0.0.0';
  return '127.0.0.1';
}

function validateOperatorHost(value) {
  const host = String(value || '').trim();
  if (!host || /\s/.test(host) || host.includes('/') || host.includes('@') || host.includes(':') || host.includes('?') || host.includes('#')) return '';
  if (host === '0.0.0.0') return '';
  return host;
}

function detectedLanIpv4(networkInterfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, entries] of Object.entries(networkInterfaces || {})) {
    if (/docker|br-|veth|virbr|lo/i.test(name)) continue;
    for (const entry of entries || []) {
      if (entry?.family !== 'IPv4' || entry.internal) continue;
      const address = String(entry.address || '');
      if (!address || address.startsWith('169.254.')) continue;
      candidates.push({ name, address });
    }
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address));
  return candidates.length === 1 ? candidates[0].address : '';
}

export function resolveOperatorHost(options = {}) {
  if (options.hostBind === '127.0.0.1') return { operatorHost: 'localhost', source: 'local' };
  const envHost = validateOperatorHost(options.env?.PIDEX_PROJECT_PIPELINE_PREVIEW_HOST);
  if (envHost) return { operatorHost: envHost, source: 'env' };
  if (options.env?.PIDEX_PROJECT_PIPELINE_PREVIEW_HOST) throw new PreviewPortError('preview_operator_host_unknown', 'invalid explicit preview host');
  const saved = validateOperatorHost(options.projectHost);
  if (saved) return { operatorHost: saved, source: 'project-setting' };
  const detected = detectedLanIpv4(options.networkInterfaces);
  if (detected) return { operatorHost: detected, source: 'detected-lan-ip' };
  throw new PreviewPortError('preview_operator_host_unknown', 'set PIDEX_PROJECT_PIPELINE_PREVIEW_HOST and retry');
}

export async function allocatePreviewPorts(pidexRoot, projectId, options = {}) {
  const env = options.env || process.env;
  const config = parsePreviewPortConfig(env);
  const hostBind = options.hostBind || choosePreviewBindMode({ platform: options.platform || process.platform, headless: options.headless, remote: options.remote, env });
  const probePort = options.probePort || probeHostPort;
  const now = options.now || (() => new Date().toISOString());
  return await withRegistryLock(pidexRoot, 'preview-port-allocation', async () => {
    const target = loadProjectRecord(pidexRoot, projectId);
    const records = listProjectRecords(pidexRoot);
    const assigned = records
      .filter((record) => record.project_id !== target.project_id && record.preview?.ports)
      .map((record) => record.preview.ports);
    for (const candidate of candidateRanges(config)) {
      if (assigned.some((ports) => rangesOverlap(candidate.base, candidate.size, ports.base, ports.size))) continue;
      if (!await rangeAvailable(candidate, hostBind, probePort)) continue;
      const previousGeneration = Number(target.preview?.ports?.generation || 0);
      target.schema_version = 2;
      target.features = { ...(target.features || {}), preview_ports: true };
      target.preview = {
        ...(target.preview || {}),
        ports: {
          base: candidate.base,
          size: candidate.size,
          host_bind: hostBind,
          container_base: candidate.container_base,
          assigned_at: now(),
          assigned_by: target.preview?.ports ? 'reassign' : 'preview-enable',
          generation: previousGeneration + 1,
        },
      };
      saveProjectRecord(pidexRoot, target);
      return { ok: true, record: target, ports: target.preview.ports };
    }
    throw new PreviewPortError('preview_port_pool_exhausted', 'no preview port range available');
  });
}
