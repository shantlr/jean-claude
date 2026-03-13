import { createFileRoute } from '@tanstack/react-router';

import { FeedWorkItemDetails } from '@/features/feed/ui-feed-work-item-details';

export const Route = createFileRoute('/all/work-items/$projectId/$workItemId')({
  component: WorkItemPage,
});

function WorkItemPage() {
  const { projectId, workItemId } = Route.useParams();

  return (
    <FeedWorkItemDetails
      projectId={projectId}
      workItemId={Number(workItemId)}
    />
  );
}
