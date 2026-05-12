import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/live')({
  beforeLoad: () => {
    throw redirect({ to: '/live' });
  },
});
