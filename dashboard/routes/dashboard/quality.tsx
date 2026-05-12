import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/quality')({
  beforeLoad: () => {
    throw redirect({ to: '/quality' });
  },
});
