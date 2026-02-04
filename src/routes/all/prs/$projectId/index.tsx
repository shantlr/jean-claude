import { createFileRoute } from '@tanstack/react-router';

import { PrListPage } from '@/features/pull-request/ui-pr-list-page';

export const Route = createFileRoute('/all/prs/$projectId/')({
  component: AllPrList,
});

function AllPrList() {
  const { projectId } = Route.useParams();

  return <PrListPage projectId={projectId} basePath="all" />;
}
