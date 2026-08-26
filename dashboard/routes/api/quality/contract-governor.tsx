import { createFileRoute } from '@tanstack/react-router';

import { contractGovernorApiGet, contractGovernorApiPost, rejectContractGovernorWrite } from '../../../lib/server/contract-governor';

export const Route = createFileRoute('/api/quality/contract-governor')({
  server: {
    handlers: {
      GET: ({ request }) => contractGovernorApiGet(request),
      POST: ({ request }) => contractGovernorApiPost(request),
      PUT: rejectContractGovernorWrite,
      PATCH: rejectContractGovernorWrite,
      DELETE: rejectContractGovernorWrite,
    },
  },
});
