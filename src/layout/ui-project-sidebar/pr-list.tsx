import { PrListItem } from '@/features/pull-request/ui-pr-list-item';
import type { AzureDevOpsPullRequest } from '@/lib/api';

export function PrList({
  projectId,
  pullRequests,
  isLoading,
  activePrId,
}: {
  projectId: string;
  pullRequests: AzureDevOpsPullRequest[];
  isLoading: boolean;
  activePrId?: string;
}) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading...
      </div>
    );
  }

  if (pullRequests.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        No pull requests
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {pullRequests.map((pr) => (
        <PrListItem
          key={pr.id}
          pr={pr}
          projectId={projectId}
          isActive={String(pr.id) === activePrId}
        />
      ))}
    </div>
  );
}
