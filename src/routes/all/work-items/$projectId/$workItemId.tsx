import { createFileRoute } from '@tanstack/react-router';

import { WorkItemDetails } from '@/features/feed/ui-work-item-details';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

const FEED_NAVIGATION_DEBOUNCE_MS = 100;

export const Route = createFileRoute('/all/work-items/$projectId/$workItemId')({
  component: WorkItemPage,
});

function WorkItemPage() {
  const { projectId, workItemId } = Route.useParams();
  const debouncedProjectId = useDebouncedValue(
    projectId,
    FEED_NAVIGATION_DEBOUNCE_MS,
  );
  const debouncedWorkItemId = useDebouncedValue(
    workItemId,
    FEED_NAVIGATION_DEBOUNCE_MS,
  );

  return (
    <div className="h-full min-w-0 flex-1">
      <WorkItemDetails
        projectId={debouncedProjectId}
        workItemId={Number(debouncedWorkItemId)}
      />
    </div>
  );
}
