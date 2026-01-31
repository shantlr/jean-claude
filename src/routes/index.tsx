import { createFileRoute, redirect } from '@tanstack/react-router';

import { resolveLastLocationRedirect } from '@/lib/navigation';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const target = await resolveLastLocationRedirect();
    throw redirect(target);
  },
});
