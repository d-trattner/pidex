import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../lib/server/response';
import { queryRows } from '../../lib/server/db';

interface ProjectRow {
  name: string;
  path: string;
}

async function projectPath(project: string | null): Promise<string | null> {
  if (!project) return null;
  const rows = await queryRows<ProjectRow>(
    'SELECT p.path FROM projects p WHERE p.name = ? OR p.path = ? LIMIT 1',
    [project, project],
  );
  return rows[0]?.path || null;
}

function safeJoin(root: string, rel: string): string | null {
  if (!rel || rel.startsWith('/') || rel.includes('..')) return null;
  const target = path.resolve(path.join(root, rel));
  if (!target.startsWith(path.resolve(root))) return null;
  return target;
}

async function planDocument(root: string, planKey: string | null): Promise<string | null> {
  if (!planKey) return null;
  const normalized = planKey.replace('plan-', '').trim();
  const candidates: string[] = [
    path.join(root, 'agents.output', 'planning', `${normalized}.md`),
    path.join(root, 'agents.output', 'planning', `plan-${normalized}.md`),
    path.join(root, 'agents.output', `plan-${normalized}.md`),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export const Route = createFileRoute('/api/document')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const project = query.get('project');
        const contextFile = query.get('context_file');
        const planKey = query.get('plan_key');
        const requestedPath = query.get('path');

        const root = await projectPath(project);
        if (!root) {
          return errorResponse('unknown project', 404);
        }

        let resolved: string | null = null;
        if (requestedPath) {
          resolved = safeJoin(root, requestedPath);
        }

        if (contextFile) {
          resolved = safeJoin(root, contextFile);
        } else if (planKey) {
          resolved = await planDocument(root, planKey);
        }

        if (!resolved) {
          return errorResponse('document not found', 404);
        }

        try {
          const markdown = await fs.readFile(resolved, 'utf-8');
          return jsonResponse({ project, path: resolved, markdown });
        } catch {
          return errorResponse('document not found', 404);
        }
      },
    },
  },
});
