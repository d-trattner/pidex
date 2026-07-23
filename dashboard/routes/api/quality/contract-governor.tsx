import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../../lib/server/response';
import { getContractGovernorStatus } from '../../../lib/server/contract-governor';

export const Route = createFileRoute('/api/quality/contract-governor')({
  server: {
    handlers: {
      GET: async () => jsonResponse(await getContractGovernorStatus()),
      POST: async () => errorResponse('GOVERNOR_CONFIG_READ_ONLY', 405),
    },
  },
});
