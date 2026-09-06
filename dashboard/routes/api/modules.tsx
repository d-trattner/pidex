import { createFileRoute } from '@tanstack/react-router';

import { moduleActionApiPost, rejectModuleActionWrite } from '../../lib/server/module-actions';
import { getModulesStatus } from '../../lib/server/modules';
import { jsonResponse } from '../../lib/server/response';

export const Route = createFileRoute('/api/modules')({
  server: {
    handlers: {
      GET: async () => jsonResponse(getModulesStatus()),
      POST: ({ request }) => moduleActionApiPost(request),
      PUT: rejectModuleActionWrite,
      PATCH: rejectModuleActionWrite,
      DELETE: rejectModuleActionWrite,
    },
  },
});
