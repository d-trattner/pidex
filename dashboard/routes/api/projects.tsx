import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../lib/server/response';
import { listProjects } from '../../lib/server/api';

export const Route = createFileRoute('/api/projects')({
  server: {
    handlers: {
      GET: async () => {
        const projects = await listProjects();
        return jsonResponse({ projects });
      },
    },
  },
});
