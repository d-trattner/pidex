import { createFileRoute } from '@tanstack/react-router';

import { contractGovernorReadResponse, rejectContractGovernorWrite } from '../../../lib/server/contract-governor';

export const Route = createFileRoute('/api/quality/contract-governor')({
  server: {
    handlers: {
      GET: () => contractGovernorReadResponse(),
      POST: rejectContractGovernorWrite,
    },
  },
});
