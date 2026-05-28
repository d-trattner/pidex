import { createFileRoute } from '@tanstack/react-router';

import { getQualityHistory } from '../../../lib/server/quality';
import { errorResponse, jsonResponse } from '../../../lib/server/response';

export const Route = createFileRoute('/api/quality/history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await getQualityHistory(new URL(request.url).search));
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'quality history failed'), 500);
        }
      },
    },
  },
});
