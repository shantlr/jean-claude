import { createFileRoute } from '@tanstack/react-router';

import { PrDetail } from '@/features/pull-request/ui-pr-detail';

export const Route = createFileRoute('/all/prs/$projectId/$prId')({
  component: AllPrPage,
});

function AllPrPage() {
  const { projectId, prId } = Route.useParams();

  return <PrDetail projectId={projectId} prId={Number(prId)} />;
}
