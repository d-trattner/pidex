import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../../lib/server/response';
import { modelQuality } from '../../../lib/server/api';

export const Route = createFileRoute('/api/charts/model-quality')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return jsonResponse(await modelQuality(new URL(request.url).search));
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'model quality chart failed'), 500);
        }
      },
    },
  },
});
