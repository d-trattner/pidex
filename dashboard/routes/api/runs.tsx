import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../lib/server/response';
import { listRuns } from '../../lib/server/api';

export const Route = createFileRoute('/api/runs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rows = await listRuns(new URL(request.url).search);
        return jsonResponse(rows);
      },
    },
  },
});
