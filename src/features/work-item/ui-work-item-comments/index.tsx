import { MessageSquare, MessagesSquare, Send } from 'lucide-react';
import { useState } from 'react';

import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import { Button } from '@/common/ui/button';
import { Textarea } from '@/common/ui/textarea';
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
  onAddComment,
  isAddingComment = false,
}: {
  comments: WorkItemComment[];
  isLoading: boolean;
  error?: string | null;
  providerId?: string;
  emptyMessage?: string;
  title?: string;
  hideHeader?: boolean;
  onAddComment?: (text: string) => void | Promise<unknown>;
  isAddingComment?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const trimmedDraft = draft.trim();

  async function handleSubmit() {
    if (!trimmedDraft || !onAddComment) return;
    try {
      await onAddComment(trimmedDraft);
      setDraft('');
    } catch {
      // Mutation hook handles user-facing error toast. Keep draft for retry.
    }
  }

  const editor = onAddComment ? (
    <div className="border-glass-border/50 bg-bg-1/70 sticky bottom-0 -mx-5 mt-3 border-t px-5 pt-3 pb-1 backdrop-blur">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Write a comment..."
        rows={3}
        disabled={isAddingComment}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void handleSubmit();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-ink-4 text-[11px]">Cmd+Enter to post</span>
        <Button
          type="button"
          size="sm"
          variant="primary"
          icon={<Send className="h-3.5 w-3.5" />}
          loading={isAddingComment}
          disabled={!trimmedDraft}
          onClick={handleSubmit}
        >
          Post
        </Button>
      </div>
    </div>
  ) : null;

  if (hideHeader) {
    return (
      <div className="flex min-h-full flex-col">
        <div className="min-h-0 flex-1">
          <CommentsContent
            comments={comments}
            isLoading={isLoading}
            error={error}
            providerId={providerId}
            emptyMessage={emptyMessage}
          />
        </div>
        {editor}
      </div>
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
      {editor}
    </div>
  );
}
