import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../lib/server/response';
import { listPipelines } from '../../lib/server/api';

export const Route = createFileRoute('/api/pipelines')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rows = await listPipelines(new URL(request.url).search);
        return jsonResponse(rows);
      },
    },
  },
});
