import { createFileRoute } from '@tanstack/react-router';

import { getQualityLatest } from '../../../lib/server/quality';
import { errorResponse, jsonResponse } from '../../../lib/server/response';

export const Route = createFileRoute('/api/quality/latest')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await getQualityLatest(new URL(request.url).search));
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'quality latest failed'), 500);
        }
      },
    },
  },
});
