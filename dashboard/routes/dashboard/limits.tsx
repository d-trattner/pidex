import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/limits')({
  beforeLoad: () => {
    throw redirect({ to: '/limits' });
  },
});
