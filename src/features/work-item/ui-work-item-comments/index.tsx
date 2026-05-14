import { MessageSquare, MessagesSquare } from 'lucide-react';

import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import type { WorkItemComment } from '@/lib/api';

function formatCommentDate(value: string) {
  if (!value) return 'Unknown date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function CommentsContent({
  comments,
  isLoading,
  error,
  providerId,
  emptyMessage,
}: {
  comments: WorkItemComment[];
  isLoading: boolean;
  error?: string | null;
  providerId?: string;
  emptyMessage: string;
}) {
  if (isLoading) {
    return <div className="text-ink-3 py-6 text-sm">Loading comments...</div>;
  }

  if (error) {
    return (
      <div className="py-6">
        <p className="text-ink-2 text-sm">Unable to load comments.</p>
        <p className="text-ink-3 mt-1 text-xs">{error}</p>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <MessageSquare className="text-ink-4 h-8 w-8" />
        <p className="text-ink-3 max-w-56 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-2">
      {comments.map((comment) => (
        <div
          key={comment.id}
          className="rounded-md border px-3 py-2.5"
          style={{
            borderColor: 'oklch(1 0 0 / 0.06)',
            background: 'oklch(1 0 0 / 0.02)',
          }}
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="text-ink-1 font-medium">{comment.createdBy}</span>
            <span className="text-ink-4">&bull;</span>
            <span className="text-ink-3">
              {formatCommentDate(comment.createdDate)}
            </span>
          </div>
          <AzureHtmlContent
            html={comment.text}
            providerId={providerId}
            className="text-ink-2 text-xs"
            imageClassName="max-h-72 w-auto object-contain"
            enableImageModal
          />
        </div>
      ))}
    </div>
  );
}

export function WorkItemComments({
  comments,
  isLoading,
  error,
  providerId,
  emptyMessage = 'No comments yet.',
  title = 'Comments',
  hideHeader = false,
}: {
  comments: WorkItemComment[];
  isLoading: boolean;
  error?: string | null;
  providerId?: string;
  emptyMessage?: string;
  title?: string;
  hideHeader?: boolean;
}) {
  if (hideHeader) {
    return (
      <CommentsContent
        comments={comments}
        isLoading={isLoading}
        error={error}
        providerId={providerId}
        emptyMessage={emptyMessage}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2">
        <MessagesSquare className="text-ink-3 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-ink-1 text-sm font-medium">{title}</div>
          <div className="text-ink-3 text-xs">
            {isLoading
              ? 'Loading thread...'
              : error
                ? 'Unable to load comments'
                : `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`}
          </div>
        </div>
      </div>

      <div className="border-glass-border/50 mt-3 min-h-0 flex-1 overflow-y-auto border-t pt-3">
        <CommentsContent
          comments={comments}
          isLoading={isLoading}
          error={error}
          providerId={providerId}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}
