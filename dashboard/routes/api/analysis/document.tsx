import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../../lib/server/response';
import { readAnalysisDocument, resolveProjectDocumentFromPlan } from '../../../lib/server/analysis';
import { queryRows } from '../../../lib/server/db';

interface ProjectRow {
  project_slug: string;
  path: string;
}

async function resolveProjectPath(planKey?: string | null, project?: string | null): Promise<string | null> {
  if (project) {
    const rows = await queryRows<ProjectRow>(
      'SELECT p.name AS project_slug, p.path FROM projects p WHERE p.name = ? OR p.path = ? LIMIT 1',
      [project, project],
    );
    if (rows[0]?.path) return rows[0].path;
  }

  if (!project && !planKey) return null;
  return null;
}

export const Route = createFileRoute('/api/analysis/document')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const path = query.get('path');
        const planKey = query.get('plan_key');
        const project = query.get('project');

        if (path) {
          const doc = await readAnalysisDocument(path);
          return doc ? jsonResponse(doc) : errorResponse('document not found', 404);
        }

        const projectPath = await resolveProjectPath(planKey, project);
        const resolved = await resolveProjectDocumentFromPlan(projectPath || '', planKey);

        if (!resolved) {
          return errorResponse('document not found', 404);
        }

        const doc = await readAnalysisDocument(resolved);
        return doc ? jsonResponse({ path: resolved, markdown: doc.markdown }) : errorResponse('document not found', 404);
      },
    },
  },
});
