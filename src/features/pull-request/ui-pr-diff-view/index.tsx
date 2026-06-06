import { useMemo } from 'react';

import type { MentionOption } from '@/common/ui/mention-textarea';
import {
  FileDiffContent,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import type { DiffFile } from '@/features/common/ui-file-diff';
import type {
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
} from '@/lib/api';
import type { MentionDisplayNames } from '@/lib/azure-devops-mentions';
import type { PromptImagePart } from '@shared/agent-backend-types';

import { PrCommentForm } from '../ui-pr-comment-form';
import {
  convertPrThreadsForFile,
  PrInlineCommentThread,
} from '../ui-pr-inline-comment-thread';

export function PrDiffView({
  file,
  baseContent,
  headContent,
  isLoadingContent,
  threads,
  projectId,
  prId,
  providerId,
  onAddFileComment,
  onUploadImage,
  isAddingComment,
  mentionDisplayNames,
  mentionOptions = [],
  onSearchMentions,
}: {
  file: AzureDevOpsFileChange;
  baseContent: string;
  headContent: string;
  isLoadingContent: boolean;
  threads: AzureDevOpsCommentThread[];
  projectId: string;
  prId: number;
  providerId?: string;
  onAddFileComment: (params: {
    filePath: string;
    line: number;
    lineEnd?: number;
    content: string;
  }) => void;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
  isAddingComment?: boolean;
  mentionDisplayNames?: MentionDisplayNames;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
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
    () => convertPrThreadsForFile(threads, file.path),
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
      renderThread={(thread) => (
        <PrInlineCommentThread
          thread={thread}
          projectId={projectId}
          prId={prId}
          providerId={providerId}
          mentionDisplayNames={mentionDisplayNames}
          mentionOptions={mentionOptions}
          onSearchMentions={onSearchMentions}
          onUploadImage={onUploadImage}
        />
      )}
      onAddComment={onAddFileComment}
      isAddingComment={isAddingComment}
      CommentForm={(props) => (
        <PrCommentForm
          {...props}
          uploadImage={onUploadImage}
          mentionOptions={mentionOptions}
          onSearchMentions={onSearchMentions}
        />
      )}
    />
  );
}
