import { createFileRoute } from '@tanstack/react-router';

import { PrListPage } from '@/features/pull-request/ui-pr-list-page';

export const Route = createFileRoute('/projects/$projectId/prs/')({
  component: ProjectPrList,
});

function ProjectPrList() {
  const { projectId } = Route.useParams();

  return <PrListPage projectId={projectId} basePath="project" />;
}
