import { createFileRoute } from '@tanstack/react-router';

import { getModulesStatus } from '../../lib/server/modules';
import { jsonResponse } from '../../lib/server/response';

export const Route = createFileRoute('/api/modules')({
  server: {
    handlers: {
      GET: async () => jsonResponse(getModulesStatus()),
    },
  },
});
