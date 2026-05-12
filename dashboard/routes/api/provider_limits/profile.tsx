import { createFileRoute } from '@tanstack/react-router';

import { errorResponse, jsonResponse } from '../../../lib/server/response';
import { getLimits, setProfile } from '../../../lib/server/limits';
import { authorizeProviderLimitsRequest } from '../../../lib/server/provider-limits-auth';

export const Route = createFileRoute('/api/provider_limits/profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'GET' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);
        const payload = await getLimits({ includeHistorical: false });
        return jsonResponse({
          active_profile: payload.active_profile,
          profiles: payload.profiles,
        });
      },
      POST: async ({ request }) => {
        const auth = authorizeProviderLimitsRequest(request, { method: 'POST' });
        if (!auth.allowed) return errorResponse(auth.error || 'forbidden', auth.status || 403);
        const body = (await request.json().catch(() => ({}))) as { profile?: string };
        const form = new URL(request.url).searchParams;
        const profile = body.profile || form.get('profile');

        if (!profile) {
          return errorResponse('name is required', 400);
        }

        try {
          const payload = await setProfile(profile);
          return jsonResponse({ profile: payload.active_profile, ...payload });
        } catch (error) {
          return errorResponse(String(error instanceof Error ? error.message : 'invalid profile'), 400);
        }
      },
    },
  },
});
