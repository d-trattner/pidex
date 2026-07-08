import { createFileRoute } from '@tanstack/react-router';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import { errorResponse, jsonResponse } from '../../lib/server/response';
import { authorizeProviderLimitsRequest } from '../../lib/server/provider-limits-auth';

const PIDEX_ROOT = path.resolve(process.cwd(), '..');
const SCRIPT = path.join(PIDEX_ROOT, 'modules', 'pidex', 'parallel-agents', 'scripts', 'status.mjs');
const CONFIG_PATH = path.join(PIDEX_ROOT, 'config', 'parallel-agents.json');
const LOCAL_CONFIG_PATH = path.join(PIDEX_ROOT, 'config', 'parallel-agents.local.json');
const STATE_PATH = path.join(PIDEX_ROOT, 'state', 'parallel-agents', 'status.json');

type ParallelConfig = {
  enabled?: boolean;
  agents?: Record<string, any>;
};

function readJson(file: string, fallback: any) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function laneId(agent: string, provider: string, model: string) { return `${agent}:${provider}:${model}`; }

function activeConfigPath() {
  return fs.existsSync(LOCAL_CONFIG_PATH) ? LOCAL_CONFIG_PATH : CONFIG_PATH;
}

function mergedPayload() {
  const configPath = activeConfigPath();
  const config = readJson(configPath, { enabled: false, agents: {} }) as ParallelConfig;
  const state = readJson(STATE_PATH, { lanes: {}, warnings: [] });
  const agents = Object.entries(config.agents || {}).map(([agent, cfg]: [string, any]) => {
    const providerModels = (cfg.provider_models || []).map((pm: any) => {
      const id = laneId(agent, pm.provider, pm.model);
      const st = state.lanes?.[id] || {};
      return {
        laneId: id,
        provider: pm.provider,
        model: pm.model,
        effort: pm.effort || 'medium',
        enabled: Boolean(pm.enabled ?? true),
        lastStatus: st.last_status ?? null,
        lastAttemptAt: st.last_attempt_at ?? null,
        lastSuccessAt: st.last_success_at ?? null,
        lastFailureAt: st.last_failure_at ?? null,
        warningActive: Boolean(st.warning_active),
        warningType: st.warning_type ?? null,
        lastMessage: st.last_message ?? null,
      };
    });
    return {
      agent,
      enabled: Boolean(cfg.enabled),
      trigger: cfg.trigger || null,
      mode: cfg.mode || 'opportunistic',
      timeoutSeconds: cfg.timeout_seconds || 600,
      notifyOnUnavailable: Boolean(cfg.notify_on_unavailable ?? true),
      providerModels,
    };
  });
  return { ok: fs.existsSync(configPath), enabled: Boolean(config.enabled), configPath, statePath: STATE_PATH, agents, warnings: state.warnings || [], updatedAt: state.updated_at || null };
}

function runStatus(args: string[]) {
  const proc = spawnSync(process.execPath, [SCRIPT, '--root', PIDEX_ROOT, ...args], { cwd: PIDEX_ROOT, encoding: 'utf8', timeout: 30_000 });
  if (proc.status !== 0) throw new Error((proc.stderr || proc.stdout || `status.mjs failed exit=${proc.status}`).trim());
  return proc.stdout.trim();
}

export const Route = createFileRoute('/api/parallel-agents')({
  server: {
    handlers: {
      GET: async () => jsonResponse(mergedPayload()),
      POST: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'POST' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);
        const body = (await request.json().catch(() => ({}))) as any;
        const action = body.action || new URL(request.url).searchParams.get('action') || 'save-config';
        try {
          if (action === 'clear') {
            if (!body.laneId) return errorResponse('laneId is required', 400);
            runStatus(['clear', '--lane', String(body.laneId)]);
            return jsonResponse(mergedPayload());
          }
          if (action === 'save-config') {
            runStatus(['save-config', '--config-json', JSON.stringify(body.config || body)]);
            return jsonResponse(mergedPayload());
          }
          return errorResponse('unknown action', 400);
        } catch (error) {
          return errorResponse(error instanceof Error ? error.message : 'parallel-agents update failed', 400);
        }
      },
    },
  },
});
