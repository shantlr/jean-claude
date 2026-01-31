import clsx from 'clsx';
import { MessageSquare, FileCode } from 'lucide-react';

import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import type { AzureDevOpsCommentThread } from '@/lib/api';
import { formatRelativeTime } from '@/lib/time';

import { PrCommentForm } from '../ui-pr-comment-form';

function getStatusBadge(status: AzureDevOpsCommentThread['status']) {
  const colors: Record<string, string> = {
    active: 'bg-blue-900/50 text-blue-400',
    fixed: 'bg-green-900/50 text-green-400',
    wontFix: 'bg-neutral-700 text-neutral-400',
    closed: 'bg-neutral-700 text-neutral-400',
    byDesign: 'bg-purple-900/50 text-purple-400',
    pending: 'bg-yellow-900/50 text-yellow-400',
    unknown: 'bg-neutral-700 text-neutral-400',
  };

  const labels: Record<string, string> = {
    active: 'Active',
    fixed: 'Resolved',
    wontFix: "Won't fix",
    closed: 'Closed',
    byDesign: 'By design',
    pending: 'Pending',
    unknown: 'Unknown',
  };

  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
        colors[status] || colors.unknown,
      )}
    >
      {labels[status] || labels.unknown}
    </span>
  );
}

export function PrComments({
  threads,
  onAddComment,
  isAddingComment,
}: {
  threads: AzureDevOpsCommentThread[];
  onAddComment: (content: string) => void;
  isAddingComment?: boolean;
}) {
  // Filter out deleted threads and system-generated threads
  const visibleThreads = threads.filter(
    (t) => !t.isDeleted && t.comments.length > 0 && t.comments[0].content,
  );

  // Separate PR-level comments from file-level comments
  const prComments = visibleThreads.filter((t) => !t.threadContext);
  const fileComments = visibleThreads.filter((t) => t.threadContext);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {visibleThreads.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            No comments yet
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* PR-level comments */}
            {prComments.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
                  <MessageSquare className="h-3 w-3" />
                  General Comments
                </div>
                {prComments.map((thread) => (
                  <CommentThread key={thread.id} thread={thread} />
                ))}
              </div>
            )}

            {/* File-level comments */}
            {fileComments.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
                  <FileCode className="h-3 w-3" />
                  File Comments
                </div>
                {fileComments.map((thread) => (
                  <CommentThread key={thread.id} thread={thread} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add comment form */}
      <div className="border-t border-neutral-700 p-4">
        <PrCommentForm onSubmit={onAddComment} isSubmitting={isAddingComment} />
      </div>
    </div>
  );
}

function CommentThread({ thread }: { thread: AzureDevOpsCommentThread }) {
  return (
    <div className="rounded-lg bg-neutral-800/50 p-3">
      {/* File context if present */}
      {thread.threadContext && (
        <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
          <span className="font-mono">{thread.threadContext.filePath}</span>
          {thread.threadContext.rightFileStart && (
            <span>Line {thread.threadContext.rightFileStart.line}</span>
          )}
          {getStatusBadge(thread.status)}
        </div>
      )}

      {/* Comments in thread */}
      <div className="flex flex-col gap-3">
        {thread.comments.map((comment, index) => (
          <div
            key={comment.id}
            className={clsx(index > 0 && 'border-t border-neutral-700 pt-3')}
          >
            <div className="mb-1 flex items-center gap-2">
              {comment.author.imageUrl && (
                <img
                  src={comment.author.imageUrl}
                  alt={comment.author.displayName}
                  className="h-5 w-5 rounded-full"
                />
              )}
              <span className="text-sm font-medium text-neutral-200">
                {comment.author.displayName}
              </span>
              <span className="text-xs text-neutral-500">
                {formatRelativeTime(comment.publishedDate)}
              </span>
            </div>
            <div className="text-sm text-neutral-300">
              <MarkdownContent content={comment.content} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
