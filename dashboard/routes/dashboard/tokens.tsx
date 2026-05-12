import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/tokens')({
  beforeLoad: () => {
    throw redirect({ to: '/tokens' });
  },
});
