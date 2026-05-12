import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../lib/server/response';
import { getSummary } from '../../lib/server/api';

export const Route = createFileRoute('/api/summary')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const summary = await getSummary(new URL(request.url).search);
        return jsonResponse(summary);
      },
    },
  },
});
