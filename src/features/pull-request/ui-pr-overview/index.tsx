import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import type { AzureDevOpsPullRequestDetails } from '@/lib/api';

export function PrOverview({
  pr,
  providerId,
  bottomPadding = 0,
}: {
  pr: AzureDevOpsPullRequestDetails;
  providerId?: string;
  bottomPadding?: number;
}) {
  return (
    <div
      className="h-full overflow-y-auto p-4"
      style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
    >
      <div className="max-w-3xl">
        <h2 className="mb-4 text-sm font-medium text-neutral-400">
          Description
        </h2>
        {pr.description.trim() ? (
          <AzureMarkdownContent
            markdown={pr.description}
            providerId={providerId}
            className="text-sm text-neutral-300"
          />
        ) : (
          <p className="text-sm text-neutral-500 italic">No description</p>
        )}
      </div>
    </div>
  );
}
