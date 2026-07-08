import { createFileRoute } from '@tanstack/react-router';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

import { PIDEX_ROOT } from '../../../lib/server/paths';
import { errorResponse, jsonResponse } from '../../../lib/server/response';
const SCRIPT = path.join(PIDEX_ROOT, 'modules', 'pidex', 'parallel-agents', 'scripts', 'status.mjs');

export const Route = createFileRoute('/api/parallel-agents/models')({
  server: {
    handlers: {
      GET: async () => {
        const proc = spawnSync(process.execPath, [SCRIPT, '--root', PIDEX_ROOT, 'models', '--json'], { cwd: PIDEX_ROOT, encoding: 'utf8', timeout: 30_000 });
        if (proc.status !== 0) return errorResponse((proc.stderr || proc.stdout || 'model discovery failed').trim(), 500);
        try { return jsonResponse(JSON.parse(proc.stdout)); }
        catch { return errorResponse('model discovery returned invalid JSON', 500); }
      },
    },
  },
});
