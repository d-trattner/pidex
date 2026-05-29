import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../../lib/server/response';
import { authorizeProviderLimitsRequest } from '../../../lib/server/provider-limits-auth';
import { getContractGovernorStatus, saveContractGovernorLocalConfig } from '../../../lib/server/contract-governor';

export const Route = createFileRoute('/api/quality/contract-governor')({
  server: {
    handlers: {
      GET: async () => jsonResponse(await getContractGovernorStatus()),
      POST: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'POST' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);
        const body = await request.json().catch(() => ({}));
        try { return jsonResponse(await saveContractGovernorLocalConfig(body.config || body)); }
        catch (error) { return errorResponse(error instanceof Error ? error.message : 'save failed', 400); }
      },
    },
  },
});
