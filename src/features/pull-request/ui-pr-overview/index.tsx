import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import type { AzureDevOpsPullRequest } from '@/lib/api';

export function PrOverview({ pr }: { pr: AzureDevOpsPullRequest }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-3xl">
        <h2 className="mb-4 text-sm font-medium text-neutral-400">
          Description
        </h2>
        {pr.description.trim() ? (
          <div className="text-sm text-neutral-300">
            <MarkdownContent content={pr.description} />
          </div>
        ) : (
          <p className="text-sm italic text-neutral-500">No description</p>
        )}
      </div>
    </div>
  );
}
