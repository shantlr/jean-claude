import type { MentionOption } from '@/common/ui/mention-textarea';
import type { CommentThread } from '@/features/common/ui-file-diff';
import type { AzureDevOpsCommentThread } from '@/lib/api';
import type { MentionDisplayNames } from '@/lib/azure-devops-mentions';
import type { PromptImagePart } from '@shared/agent-backend-types';

import { PrInlineCommentTimeline } from '../ui-pr-comments';

export function PrInlineCommentThread({
  thread,
  projectId,
  prId,
  providerId,
  mentionDisplayNames,
  mentionOptions,
  onSearchMentions,
  onUploadImage,
}: {
  thread: CommentThread;
  projectId: string;
  prId: number;
  providerId?: string;
  mentionDisplayNames?: MentionDisplayNames;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
}) {
  return (
    <PrInlineCommentTimeline
      threadId={thread.id}
      projectId={projectId}
      prId={prId}
      canResolve={isActiveThreadStatus(thread.status)}
      comments={thread.comments.map((comment) => ({
        id: comment.id ?? 0,
        content: comment.content,
        commentType: 'text',
        author: {
          displayName: comment.author,
          uniqueName: comment.uniqueName ?? comment.author,
          imageUrl: comment.imageUrl,
        },
        publishedDate: comment.publishedDate ?? new Date().toISOString(),
        lastUpdatedDate: comment.publishedDate ?? new Date().toISOString(),
      }))}
      providerId={providerId}
      mentionDisplayNames={mentionDisplayNames}
      mentionOptions={mentionOptions}
      onSearchMentions={onSearchMentions}
      onUploadImage={onUploadImage}
    />
  );
}

export function convertPrThreadsForFile(
  threads: AzureDevOpsCommentThread[],
  filePath: string,
): CommentThread[] {
  const normalizedPath = stripLeadingSlash(filePath);

  return threads
    .filter(
      (thread) =>
        stripLeadingSlash(thread.threadContext?.filePath ?? '') ===
          normalizedPath && thread.threadContext?.rightFileStart?.line,
    )
    .map((thread) => ({
      id: thread.id,
      line: thread.threadContext?.rightFileStart?.line,
      status: thread.status,
      comments: thread.comments.map((comment) => ({
        id: comment.id,
        author: comment.author.displayName,
        content: comment.content,
        publishedDate: comment.publishedDate,
        imageUrl: comment.author.imageUrl,
        uniqueName: comment.author.uniqueName,
      })),
    }));
}

function stripLeadingSlash(value: string) {
  return value.replace(/^\/+/, '');
}

function isActiveThreadStatus(status: string | undefined) {
  return status === 'active' || status === 'pending' || status === 'unknown';
}
