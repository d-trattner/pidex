import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/analysis')({
  beforeLoad: () => {
    throw redirect({ to: '/analysis' });
  },
});
