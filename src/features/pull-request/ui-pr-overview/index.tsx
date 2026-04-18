import { Separator } from '@/common/ui/separator';
import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import type {
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommentThread,
} from '@/lib/api';

import { PrCommentForm } from '../ui-pr-comment-form';
import { PrComments } from '../ui-pr-comments';

export function PrOverview({
  pr,
  projectId,
  prId,
  providerId,
  threads = [],
  onAddComment,
  isAddingComment,
  bottomPadding = 0,
}: {
  pr: AzureDevOpsPullRequestDetails;
  projectId: string;
  prId: number;
  providerId?: string;
  threads?: AzureDevOpsCommentThread[];
  onAddComment?: (content: string) => void;
  isAddingComment?: boolean;
  bottomPadding?: number;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex-1 overflow-y-auto p-4"
        style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
      >
        <div className="max-w-3xl min-w-0">
          {/* Description */}
          <h2 className="text-ink-2 mb-4 text-sm font-medium">Description</h2>
          {pr.description.trim() ? (
            <AzureMarkdownContent
              markdown={pr.description}
              providerId={providerId}
              className="text-ink-1 text-sm"
            />
          ) : (
            <p className="text-ink-3 text-sm italic">No description</p>
          )}

          {/* Comments */}
          <div className="mt-8">
            <PrComments
              threads={threads}
              providerId={providerId}
              projectId={projectId}
              prId={prId}
            />
          </div>
        </div>
      </div>

      {/* Add comment form */}
      {onAddComment && (
        <>
          <Separator />
          <div className="p-4">
            <PrCommentForm
              onSubmit={onAddComment}
              isSubmitting={isAddingComment}
            />
          </div>
        </>
      )}
    </div>
  );
}
