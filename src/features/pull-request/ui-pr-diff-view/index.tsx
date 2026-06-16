import { useCallback, useMemo } from 'react';

import type { MentionOption } from '@/common/ui/mention-textarea';
import type { LineRange } from '@/features/agent/ui-diff-view';
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
import { usePrFileDraftActions } from '@/stores/pr-comment-drafts';
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
  const { setDraft, clearDraft, getBody, getAllDrafts } = usePrFileDraftActions(
    prId,
    file.path,
  );

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

  // Restore all draft ranges as open forms on mount.
  // Read imperatively — does NOT subscribe, so no re-render on body edits.
  // getAllDrafts is stable per file.path (keyed by fKey), so this only recomputes on file switch.
  const defaultCommentFormLineRanges: LineRange[] = useMemo(() => {
    const drafts = getAllDrafts();
    return Object.values(drafts).map((d) => ({
      start: d.lineStart,
      end: d.lineEnd ?? d.lineStart,
    }));
  }, [getAllDrafts]);

  const handleCommentFormClose = useCallback(
    (range: LineRange) => {
      const lineEnd = range.end !== range.start ? range.end : undefined;
      clearDraft(range.start, lineEnd);
    },
    [clearDraft],
  );

  const handleBodyChange = useCallback(
    (body: string, lineStart: number, lineEnd?: number) => {
      if (body.trim()) {
        setDraft({ body, lineStart, lineEnd });
      } else {
        clearDraft(lineStart, lineEnd);
      }
    },
    [setDraft, clearDraft],
  );

  // Clear draft for submitted range
  const handleAddFileComment = useCallback(
    (params: {
      filePath: string;
      line: number;
      lineEnd?: number;
      content: string;
    }) => {
      clearDraft(params.line, params.lineEnd);
      onAddFileComment(params);
    },
    [onAddFileComment, clearDraft],
  );

  const renderCommentForm = useCallback(
    (props: {
      onSubmit: (content: string) => void;
      onCancel: () => void;
      lineStart: number;
      lineEnd?: number;
      isSubmitting?: boolean;
      placeholder?: string;
    }) => {
      const lineEnd = props.lineEnd !== undefined ? props.lineEnd : undefined;
      return (
        <PrCommentForm
          {...props}
          uploadImage={onUploadImage}
          mentionOptions={mentionOptions}
          onSearchMentions={onSearchMentions}
          initialBody={getBody(props.lineStart, lineEnd)}
          onBodyChange={(body) =>
            handleBodyChange(body, props.lineStart, lineEnd)
          }
        />
      );
    },
    [
      getBody,
      handleBodyChange,
      mentionOptions,
      onSearchMentions,
      onUploadImage,
    ],
  );

  const shouldKeepCommentFormRangeOnOpen = useCallback(
    (range: LineRange) => {
      const lineEnd = range.end !== range.start ? range.end : undefined;
      return Boolean(getBody(range.start, lineEnd).trim());
    },
    [getBody],
  );

  return (
    <FileDiffContent
      key={file.path}
      file={diffFile}
      oldContent={baseContent}
      newContent={headContent}
      isLoading={isLoadingContent}
      headerClassName="h-[40px] shrink-0"
      threads={fileThreads}
      defaultCommentFormLineRanges={defaultCommentFormLineRanges}
      onCommentFormClose={handleCommentFormClose}
      shouldKeepCommentFormRangeOnOpen={shouldKeepCommentFormRangeOnOpen}
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
      onAddComment={handleAddFileComment}
      isAddingComment={isAddingComment}
      renderCommentForm={renderCommentForm}
    />
  );
}
