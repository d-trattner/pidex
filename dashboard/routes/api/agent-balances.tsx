import { createFileRoute } from '@tanstack/react-router';

import { deleteBalanceProvider, getAgentBalances, recordBalanceSnapshot } from '../../lib/server/agent-balances';
import { authorizeProviderLimitsRequest } from '../../lib/server/provider-limits-auth';
import { errorResponse, jsonResponse } from '../../lib/server/response';

export const Route = createFileRoute('/api/agent-balances')({
  server: {
    handlers: {
      GET: async () => jsonResponse(await getAgentBalances()),
      POST: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'POST' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);
        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const action = String(body.action || 'record-snapshot');
          if (action === 'record-snapshot') {
            return jsonResponse(await recordBalanceSnapshot({
              provider: String(body.provider || ''),
              label: body.label ? String(body.label) : undefined,
              kind: body.kind === 'balance_top_up' ? 'balance_top_up' : 'balance_update',
              balance_usd: Number(body.balance_usd ?? body.balanceUsd),
            }));
          }
          if (action === 'delete-provider') {
            if (!body.provider) return errorResponse('provider is required', 400);
            return jsonResponse(await deleteBalanceProvider(String(body.provider)));
          }
          return errorResponse('unknown action', 400);
        } catch (error) {
          return errorResponse(error instanceof Error ? error.message : 'agent balance update failed', 400);
        }
      },
    },
  },
});
