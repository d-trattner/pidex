import { createFileRoute } from '@tanstack/react-router';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { getQualityLatest, getQualityProjects } from '../../../lib/server/quality';
import { authorizeProviderLimitsRequest } from '../../../lib/server/provider-limits-auth';
import { errorResponse, jsonResponse } from '../../../lib/server/response';

const PIDEX_ROOT = path.resolve(process.cwd(), '..');
const REPORT_SCRIPT = path.join(PIDEX_ROOT, 'scripts', 'quality', 'report.mjs');

type RefreshResult = {
  project: string;
  project_path: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
};

function runReport(projectPath: string): RefreshResult {
  const proc = spawnSync(process.execPath, [REPORT_SCRIPT, '--project', projectPath, '--last', '10'], {
    cwd: PIDEX_ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    project: path.basename(projectPath) || projectPath,
    project_path: projectPath,
    ok: proc.status === 0,
    stdout: (proc.stdout || '').slice(-4000),
    stderr: (proc.stderr || '').slice(-4000),
    status: proc.status,
  };
}

export const Route = createFileRoute('/api/quality/refresh')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'POST' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);

        const url = new URL(request.url);
        const project = (url.searchParams.get('project') || '').trim();
        const targets: Array<{ project: string; project_path: string }> = [];

        if (project) {
          const latest = await getQualityLatest(url.search, PIDEX_ROOT);
          if (!latest.latest?.project_path) return errorResponse(`No quality project path found for ${project}`, 404);
          targets.push({ project: latest.latest.project, project_path: latest.latest.project_path });
        } else {
          const projects = await getQualityProjects('', PIDEX_ROOT);
          for (const item of projects.projects) {
            if (!item.project_path) continue;
            targets.push({ project: item.project, project_path: item.project_path });
          }
        }

        if (!targets.length) return errorResponse('No quality report targets found', 404);
        const results = targets.map((target) => ({ ...runReport(target.project_path), project: target.project }));
        const ok = results.every((result) => result.ok);
        return jsonResponse({ ok, generated_at: new Date().toISOString(), refreshed: results.length, results }, ok ? 200 : 500);
      },
    },
  },
});
