import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/runs')({
  beforeLoad: () => {
    throw redirect({ to: '/runs' });
  },
});
