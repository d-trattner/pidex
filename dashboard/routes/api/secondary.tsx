import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../lib/server/response';
import { listSecondary } from '../../lib/server/api';

export const Route = createFileRoute('/api/secondary')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await listSecondary(new URL(request.url).search));
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'could not load secondary data'), 500);
        }
      },
    },
  },
});
