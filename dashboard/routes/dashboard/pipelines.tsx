import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/pipelines')({
  beforeLoad: () => {
    throw redirect({ to: '/pipelines' });
  },
});
