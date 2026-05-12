import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../lib/server/response';
import { getLiveState } from '../../lib/server/api';

export const Route = createFileRoute('/api/live')({
  server: {
    handlers: {
      GET: async ({ request }) => jsonResponse(await getLiveState(new URL(request.url).search)),
    },
  },
});
