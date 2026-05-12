import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '../../../lib/server/response';
import { listAnalysis } from '../../../lib/server/analysis';

export const Route = createFileRoute('/api/analysis/plans')({
  server: {
    handlers: {
      GET: async () => jsonResponse(await listAnalysis('plans')),
    },
  },
});
