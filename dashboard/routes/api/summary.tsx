import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../lib/server/response';
import { getSummary } from '../../lib/server/api';
import { readDashboardDecisionStatus } from '../../lib/server/decision-status';

export const Route = createFileRoute('/api/summary')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('view') === 'decision-status') return jsonResponse(readDashboardDecisionStatus());
        const summary = await getSummary(url.search);
        return jsonResponse(summary);
      },
    },
  },
});
