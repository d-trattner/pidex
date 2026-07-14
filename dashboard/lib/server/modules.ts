import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { PIDEX_ROOT } from './paths.ts';

type ModuleManifest = {
  id: string;
  name?: string;
  kind: 'core-required' | 'core-toggleable' | 'optional-internal';
  default_enabled?: boolean;
  dependencies?: string[];
  capabilities?: Array<{
    id: string;
    kind: string;
    phases: string[];
    scope: string;
    importance: string;
    mutability: string[];
    allowed_agents: string[];
    supported_platforms?: string[];
  }>;
};

type ModuleConfig = { modules?: Record<string, { enabled?: boolean }> };

type EvidenceRow = {
  type?: string;
  module_id?: string;
  capability_id?: string;
  status?: string;
  exit_code?: number;
  ended_at?: string;
  timestamp?: string;
};

export type ModuleStatus = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  locked: boolean;
  source: string;
  dependencies: string[];
  capabilities: Array<{
    id: string;
    kind: string;
    phases: string[];
    scope: string;
    importance: string;
    mutability: string[];
    allowed_agents: string[];
    supported_platforms: string[];
    latest_evidence: EvidenceRow | null;
  }>;
};

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function walkModuleManifests(root: string): string[] {
  const modulesRoot = path.join(root, 'modules');
  const files: string[] = [];
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === 'module.json') files.push(full);
    }
  }
  walk(modulesRoot);
  return files.sort();
}

function moduleState(root: string, manifest: ModuleManifest): { enabled: boolean; locked: boolean; source: string } {
  if (manifest.kind === 'core-required') return { enabled: true, locked: true, source: 'core-required' };
  const base = readJson<ModuleConfig>(path.join(root, 'config', 'modules.json'), { modules: {} });
  const local = readJson<ModuleConfig>(path.join(root, 'config', 'modules.local.json'), { modules: {} });
  const configured = { ...(base.modules || {}), ...(local.modules || {}) }[manifest.id];
  if (configured && typeof configured.enabled === 'boolean') return { enabled: configured.enabled, locked: false, source: 'config' };
  return { enabled: manifest.default_enabled !== false, locked: false, source: 'manifest-default' };
}

function readEvidence(root: string): Map<string, EvidenceRow> {
  const evidenceDir = path.join(root, 'state', 'modules', 'evidence');
  const latest = new Map<string, EvidenceRow>();
  if (!existsSync(evidenceDir)) return latest;
  for (const file of readdirSync(evidenceDir).filter((name) => name.endsWith('.jsonl')).sort()) {
    const full = path.join(evidenceDir, file);
    for (const line of readFileSync(full, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as EvidenceRow;
        if (!row.capability_id) continue;
        latest.set(row.capability_id, row);
      } catch {
        // Ignore malformed runtime evidence lines; dashboard is read-only and best-effort.
      }
    }
  }
  return latest;
}

export function getModulesStatus(root = PIDEX_ROOT): { ok: true; runtime_root: string; modules: ModuleStatus[]; totals: { modules: number; enabled: number; capabilities: number } } {
  const evidence = readEvidence(root);
  const modules = walkModuleManifests(root).map((file) => {
    const manifest = readJson<ModuleManifest>(file, { id: path.basename(path.dirname(file)), kind: 'optional-internal', capabilities: [] });
    const state = moduleState(root, manifest);
    const capabilities = (manifest.capabilities || []).map((capability) => ({
      id: capability.id,
      kind: capability.kind,
      phases: capability.phases || [],
      scope: capability.scope,
      importance: capability.importance,
      mutability: capability.mutability || [],
      allowed_agents: capability.allowed_agents || [],
      supported_platforms: capability.supported_platforms || [],
      latest_evidence: evidence.get(capability.id) || null,
    }));
    return {
      id: manifest.id,
      name: manifest.name || manifest.id,
      kind: manifest.kind,
      enabled: state.enabled,
      locked: state.locked,
      source: state.source,
      dependencies: manifest.dependencies || [],
      capabilities,
    };
  });
  return {
    ok: true,
    runtime_root: path.basename(root) || 'pidex',
    modules,
    totals: {
      modules: modules.length,
      enabled: modules.filter((module) => module.enabled).length,
      capabilities: modules.reduce((sum, module) => sum + module.capabilities.length, 0),
    },
  };
}
