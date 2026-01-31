import { createFileRoute } from '@tanstack/react-router';

import { PrDetail } from '@/features/pull-request/ui-pr-detail';

export const Route = createFileRoute('/projects/$projectId/prs/$prId')({
  component: PrPage,
});

function PrPage() {
  const { projectId, prId } = Route.useParams();

  return <PrDetail projectId={projectId} prId={Number(prId)} />;
}
