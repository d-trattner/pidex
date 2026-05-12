import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../lib/server/response';
import { tokenConsumption } from '../../lib/server/api';

export const Route = createFileRoute('/api/token-consumption')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await tokenConsumption(new URL(request.url).search));
        } catch {
          return errorResponse('token consumption failed', 500);
        }
      },
    },
  },
});
