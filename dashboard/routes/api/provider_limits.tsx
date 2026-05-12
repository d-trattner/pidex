import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../lib/server/response';
import { parseBool } from '../../lib/server/filters';
import { getLimits, setProfile } from '../../lib/server/limits';
import { authorizeProviderLimitsRequest } from '../../lib/server/provider-limits-auth';

export const Route = createFileRoute('/api/provider_limits')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'GET' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);
        const query = new URL(request.url).searchParams;
        const includeHistorical = parseBool(query.get('show_historical'), false);
        const payload = await getLimits({ includeHistorical });
        return jsonResponse(payload);
      },
      POST: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'POST' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);
        const form = new URL(request.url).searchParams;
        const body = (await request.json().catch(() => ({}))) as { profile?: string; name?: string };
        const profile = body.profile || body.name || form.get('profile') || form.get('name');

        if (!profile) {
          return errorResponse('profile is required', 400);
        }

        try {
          const payload = await setProfile(profile);
          return jsonResponse(payload);
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'unable to set profile'), 400);
        }
      },
    },
  },
});
