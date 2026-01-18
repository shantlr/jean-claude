import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // TODO: Redirect to last visited project
    throw redirect({ to: '/settings' });
  },
});
