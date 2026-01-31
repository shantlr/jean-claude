import { useMemo } from 'react';

import {
  FileDiffContent,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import type { DiffFile, CommentThread } from '@/features/common/ui-file-diff';
import type { AzureDevOpsFileChange, AzureDevOpsCommentThread } from '@/lib/api';

import { PrCommentForm } from '../ui-pr-comment-form';

// Convert Azure DevOps threads to the unified CommentThread format
function convertThreads(
  threads: AzureDevOpsCommentThread[],
  filePath: string,
): CommentThread[] {
  return threads
    .filter(
      (t) =>
        t.threadContext?.filePath === filePath ||
        t.threadContext?.filePath === `/${filePath}`,
    )
    .map((thread) => ({
      id: thread.id,
      line: thread.threadContext?.rightFileStart?.line,
      comments: thread.comments.map((c) => ({
        author: c.author.displayName,
        content: c.content,
      })),
    }));
}

export function PrDiffView({
  file,
  baseContent,
  headContent,
  isLoadingContent,
  threads,
  onAddFileComment,
  isAddingComment,
}: {
  file: AzureDevOpsFileChange;
  baseContent: string;
  headContent: string;
  isLoadingContent: boolean;
  threads: AzureDevOpsCommentThread[];
  onAddFileComment: (params: {
    filePath: string;
    line: number;
    lineEnd?: number;
    content: string;
  }) => void;
  isAddingComment?: boolean;
}) {
  // Convert to unified DiffFile type
  const diffFile: DiffFile = useMemo(
    () => ({
      path: file.path,
      status: normalizeAzureChangeType(file.changeType),
      originalPath: file.originalPath,
    }),
    [file.path, file.changeType, file.originalPath],
  );

  // Convert threads to unified format
  const fileThreads = useMemo(
    () => convertThreads(threads, file.path),
    [threads, file.path],
  );

  return (
    <FileDiffContent
      file={diffFile}
      oldContent={baseContent}
      newContent={headContent}
      isLoading={isLoadingContent}
      headerClassName="h-[40px] shrink-0"
      threads={fileThreads}
      onAddComment={onAddFileComment}
      isAddingComment={isAddingComment}
      CommentForm={PrCommentForm}
    />
  );
}
