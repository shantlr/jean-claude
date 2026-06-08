import { createFileRoute } from '@tanstack/react-router';

import { PrDetail } from '@/features/pull-request/ui-pr-detail';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

const FEED_NAVIGATION_DEBOUNCE_MS = 100;

export const Route = createFileRoute('/all/prs/$projectId/$prId')({
  component: AllPrPage,
});

function AllPrPage() {
  const { projectId, prId } = Route.useParams();
  const debouncedProjectId = useDebouncedValue(
    projectId,
    FEED_NAVIGATION_DEBOUNCE_MS,
  );
  const debouncedPrId = useDebouncedValue(prId, FEED_NAVIGATION_DEBOUNCE_MS);

  return (
    <PrDetail
      key={`${debouncedProjectId}:${debouncedPrId}`}
      projectId={debouncedProjectId}
      prId={Number(debouncedPrId)}
    />
  );
}
