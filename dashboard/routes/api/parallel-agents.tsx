import { createFileRoute } from '@tanstack/react-router';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import { errorResponse, jsonResponse } from '../../lib/server/response';
import { authorizeProviderLimitsRequest } from '../../lib/server/provider-limits-auth';
import { PIDEX_ROOT } from '../../lib/server/paths';
const SCRIPT = path.join(PIDEX_ROOT, 'modules', 'pidex', 'parallel-agents', 'scripts', 'status.mjs');
function mergedPayload() {
  const status = JSON.parse(runStatus(['show', '--json']) || '{}');
  const agents = (status.agents || []).map((cfg: any) => ({
    agent: cfg.agent,
    enabled: Boolean(cfg.enabled),
    trigger: cfg.trigger || null,
    mode: cfg.mode || 'opportunistic',
    timeoutSeconds: cfg.timeout_seconds || 600,
    notifyOnUnavailable: Boolean(cfg.notify_on_unavailable ?? true),
    providerModels: (cfg.provider_models || []).map((pm: any) => ({
      laneId: pm.lane_id,
      provider: pm.provider,
      model: pm.model,
      effort: pm.effort || 'medium',
      enabled: Boolean(pm.enabled ?? true),
      lastStatus: pm.last_status ?? null,
      lastAttemptAt: pm.last_attempt_at ?? null,
      lastSuccessAt: pm.last_success_at ?? null,
      lastFailureAt: pm.last_failure_at ?? null,
      warningActive: Boolean(pm.warning_active),
      warningType: pm.warning_type ?? null,
      lastMessage: pm.last_message ?? null,
    })),
  }));
  return { ok: status.ok === true, enabled: Boolean(status.enabled), configPath: status.config_path, configSource: status.config_source, configWritable: status.config_writable === true, statePath: status.state_path, agents, warnings: status.warnings || [], updatedAt: status.updated_at || null };
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
