import { createFileRoute } from '@tanstack/react-router';

import { getQualityProjects } from '../../../lib/server/quality';
import { errorResponse, jsonResponse } from '../../../lib/server/response';

export const Route = createFileRoute('/api/quality/projects')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await getQualityProjects(new URL(request.url).search));
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'quality projects failed'), 500);
        }
      },
    },
  },
});
