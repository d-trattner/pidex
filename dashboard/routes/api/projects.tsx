import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../lib/server/response';
import { listProjects } from '../../lib/server/api';

export const Route = createFileRoute('/api/projects')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const projects = await listProjects(new URL(request.url).search);
        return jsonResponse({ projects });
      },
    },
  },
});
