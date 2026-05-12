import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../../lib/server/response';
import { qualityChartData } from '../../../lib/server/api';

export const Route = createFileRoute('/api/charts/quality')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await qualityChartData(new URL(request.url).search));
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'quality chart failed'), 500);
        }
      },
    },
  },
});
