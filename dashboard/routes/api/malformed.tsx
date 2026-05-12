import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../lib/server/response';
import { listMalformed } from '../../lib/server/api';

export const Route = createFileRoute('/api/malformed')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await listMalformed(new URL(request.url).search));
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'malformed query failed'), 500);
        }
      },
    },
  },
});
