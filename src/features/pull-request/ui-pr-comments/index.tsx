import clsx from 'clsx';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  GitPullRequest,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import {
  EMPTY_MENTION_OPTIONS,
  decodeMentionDisplayNames,
  encodeMentionDisplayNames,
  type MentionOption,
} from '@/common/ui/mention-textarea';
import { UserAvatar } from '@/common/ui/user-avatar';
import { getLanguageFromPath } from '@/features/agent/ui-diff-view/language-utils';
import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import { InlineCommentComposer } from '@/features/common/ui-inline-comments';
import {
  useAddThreadReply,
  useCurrentAzureUser,
  useDeleteThreadComment,
  usePullRequestFileContent,
  useUpdateThreadComment,
  useUpdateThreadStatus,
} from '@/hooks/use-pull-requests';
import type { AzureDevOpsCommentThread } from '@/lib/api';
import {
  replaceAzureDevOpsMentions,
  type MentionDisplayNames,
} from '@/lib/azure-devops-mentions';
import { encodeProxyUrl } from '@/lib/azure-image-proxy';
import { formatRelativeTime } from '@/lib/time';
import type { PromptImagePart } from '@shared/agent-backend-types';

import { PrCommentForm, uploadImagesIntoMarkdown } from '../ui-pr-comment-form';

export type PrTimelineComment = AzureDevOpsCommentThread['comments'][number];

type ThreadStatus = AzureDevOpsCommentThread['status'];

const ACTIVE_STATUSES = new Set<ThreadStatus>(['active', 'pending', 'unknown']);

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-acc/50 text-acc-ink' },
  fixed: { label: 'Resolved', color: 'bg-status-done/50 text-status-done' },
  wontFix: { label: "Won't fix", color: 'bg-glass-medium text-ink-2' },
  closed: { label: 'Closed', color: 'bg-glass-medium text-ink-2' },
  byDesign: { label: 'By design', color: 'bg-acc/50 text-acc-ink' },
  pending: { label: 'Pending', color: 'bg-yellow-900/50 text-status-run' },
  unknown: { label: 'Unknown', color: 'bg-glass-medium text-ink-2' },
};

const SETTABLE_STATUSES: ThreadStatus[] = [
  'active',
  'fixed',
  'wontFix',
  'closed',
  'byDesign',
  'pending',
];

export function PrComments({
  threads,
  providerId,
  projectId,
  prId,
  onAddComment,
  onUploadImage,
  isAddingComment,
  onOpenFilePreview,
  mentionDisplayNames,
  mentionOptions = EMPTY_MENTION_OPTIONS,
  onSearchMentions,
}: {
  threads: AzureDevOpsCommentThread[];
  providerId?: string;
  projectId: string;
  prId: number;
  onAddComment?: (content: string) => void;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
  isAddingComment?: boolean;
  onOpenFilePreview?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd: number;
  }) => void;
  mentionDisplayNames?: MentionDisplayNames;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
}) {
  const [expandedResolved, setExpandedResolved] = useState<
    Record<number, boolean>
  >({});

  const visibleThreads = useMemo(
    () =>
      threads.filter(
        (thread) =>
          !thread.isDeleted &&
          thread.comments.length > 0 &&
          thread.comments[0].content,
      ),
    [threads],
  );

  const orderedThreads = useMemo(
    () =>
      [...visibleThreads].sort(
        (a, b) =>
          new Date(b.comments[0]?.publishedDate ?? 0).getTime() -
          new Date(a.comments[0]?.publishedDate ?? 0).getTime(),
      ),
    [visibleThreads],
  );

  const unresolvedCount = useMemo(
    () => orderedThreads.filter((thread) => isActiveThread(thread)).length,
    [orderedThreads],
  );

  const toggleResolvedThread = useCallback((threadId: number) => {
    setExpandedResolved((current) => ({
      ...current,
      [threadId]: !current[threadId],
    }));
  }, []);

  return (
    <section className="border-glass-border bg-bg-1/60 overflow-visible rounded-lg border">
      <div className="border-glass-border/60 flex items-center gap-2 border-b px-3.5 py-2.5">
        <GitPullRequest className="text-ink-3 h-3.5 w-3.5" />
        <h3 className="text-ink-0 text-sm font-medium">Conversation</h3>
        <span className="bg-glass-medium text-ink-3 rounded px-1.5 py-0.5 font-mono text-[11px]">
          {orderedThreads.length}
        </span>
        <div className="flex-1" />
        {unresolvedCount > 0 ? (
          <span className="text-ink-2 inline-flex items-center gap-1.5 text-xs">
            <span className="bg-acc h-1.5 w-1.5 rounded-full" />
            {unresolvedCount} unresolved
          </span>
        ) : (
          <span className="text-status-done inline-flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All resolved
          </span>
        )}
      </div>

      {onAddComment && (
        <div className="border-glass-border/60 bg-bg-1/50 border-b px-3.5 py-3">
          <PrCommentForm
            onSubmit={onAddComment}
            isSubmitting={isAddingComment}
            uploadImage={onUploadImage}
            placeholder="Start a new comment thread..."
            mentionOptions={mentionOptions}
            onSearchMentions={onSearchMentions}
          />
        </div>
      )}

      {orderedThreads.length === 0 ? (
        <div className="text-ink-3 py-6 text-center text-sm">
          No comments yet
        </div>
      ) : (
        <div>
          {orderedThreads.map((thread, index) => {
            const resolved = !isActiveThread(thread);
            const collapsed = resolved && !expandedResolved[thread.id];

            return (
              <CommentThread
                key={thread.id}
                thread={thread}
                providerId={providerId}
                projectId={projectId}
                prId={prId}
                collapsed={collapsed}
                onToggleResolved={() => toggleResolvedThread(thread.id)}
                showDivider={index > 0}
                onOpenFilePreview={onOpenFilePreview}
                mentionDisplayNames={mentionDisplayNames}
                mentionOptions={mentionOptions}
                onSearchMentions={onSearchMentions}
                onUploadImage={onUploadImage}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusDropdown({
  status,
  threadId,
  projectId,
  prId,
}: {
  status: ThreadStatus;
  threadId: number;
  projectId: string;
  prId: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const updateStatus = useUpdateThreadStatus(projectId, prId);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = useCallback(
    (newStatus: ThreadStatus) => {
      if (newStatus !== status) {
        updateStatus.mutate({ threadId, status: newStatus });
      }
      setIsOpen(false);
    },
    [status, threadId, updateStatus],
  );

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={clsx(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase transition-opacity hover:opacity-80',
          config.color,
        )}
      >
        {config.label}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {isOpen && (
        <div className="border-glass-border bg-bg-1 absolute top-full right-0 z-50 mt-1 min-w-[120px] rounded-lg border py-1 shadow-lg">
          {SETTABLE_STATUSES.map((settableStatus) => {
            const settableConfig = STATUS_CONFIG[settableStatus];
            return (
              <button
                key={settableStatus}
                type="button"
                onClick={() => handleSelect(settableStatus)}
                className={clsx(
                  'hover:bg-glass-medium flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                  settableStatus === status ? 'text-ink-0' : 'text-ink-2',
                )}
              >
                <span
                  className={clsx(
                    'inline-block h-2 w-2 rounded-full',
                    settableConfig.color,
                  )}
                />
                {settableConfig.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThreadReplyForm({
  threadId,
  projectId,
  prId,
  canResolve,
  mentionOptions = EMPTY_MENTION_OPTIONS,
  onSearchMentions,
  onUploadImage,
}: {
  threadId: number;
  projectId: string;
  prId: number;
  canResolve: boolean;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const addReply = useAddThreadReply(projectId, prId);
  const updateStatus = useUpdateThreadStatus(projectId, prId);

  const handleResolve = useCallback(() => {
    updateStatus.mutate({ threadId, status: 'fixed' });
  }, [threadId, updateStatus]);

  if (!isExpanded) {
    return (
      <div className="mt-3 flex items-center gap-2 pl-[37px]">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="border-glass-border bg-bg-2/70 text-ink-3 hover:text-ink-1 flex min-h-8 flex-1 items-center rounded-md border px-3 text-left text-xs transition-colors"
        >
          Reply...
        </button>
        {canResolve && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResolve}
            loading={updateStatus.isPending}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            className="text-status-done"
          >
            Resolve
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 pl-[37px]">
      <PrCommentForm
        onSubmit={(content) => {
          addReply.mutate(
            { threadId, content },
            { onSuccess: () => setIsExpanded(false) },
          );
        }}
        onCancel={() => setIsExpanded(false)}
        placeholder="Write a reply..."
        uploadImage={onUploadImage}
        mentionOptions={mentionOptions}
        onSearchMentions={onSearchMentions}
        isSubmitting={addReply.isPending}
      />
      {canResolve && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResolve}
            loading={updateStatus.isPending}
            className="text-status-done"
          >
            Resolve
          </Button>
        </div>
      )}
    </div>
  );
}

const CONTEXT_LINES = 2;

function ThreadCodePreview({
  filePath,
  startLine,
  endLine,
  projectId,
  prId,
  onOpenFilePreview,
}: {
  filePath: string;
  startLine: number;
  endLine: number;
  projectId: string;
  prId: number;
  onOpenFilePreview?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd: number;
  }) => void;
}) {
  const { data: fileContent } = usePullRequestFileContent(
    projectId,
    prId,
    filePath,
    'head',
  );
  const [tokens, setTokens] = useState<ThemedToken[][]>([]);

  const { snippetLines, firstLineNumber } = useMemo(() => {
    if (!fileContent) return { snippetLines: [], firstLineNumber: startLine };
    const allLines = fileContent.split('\n');
    const from = Math.max(0, startLine - 1 - CONTEXT_LINES);
    const to = Math.min(allLines.length, endLine + CONTEXT_LINES);
    return {
      snippetLines: allLines.slice(from, to),
      firstLineNumber: from + 1,
    };
  }, [fileContent, startLine, endLine]);

  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);

  useEffect(() => {
    if (snippetLines.length === 0) return;
    const code = snippetLines.join('\n');
    codeToTokens(code, { lang: language, theme: 'github-dark' })
      .then((result) => setTokens(result.tokens))
      .catch(() => {
        codeToTokens(code, { lang: 'text', theme: 'github-dark' }).then(
          (result) => setTokens(result.tokens),
        );
      });
  }, [snippetLines, language]);

  if (!fileContent || snippetLines.length === 0) return null;

  const preview = (
    <div className="border-glass-border overflow-hidden rounded-md border">
      <div className="bg-bg-0/30 overflow-x-auto font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {snippetLines.map((line, index) => {
              const lineNumber = firstLineNumber + index;
              const isHighlighted =
                lineNumber >= startLine && lineNumber <= endLine;
              const lineTokens = tokens[index] ?? [];

              return (
                <tr
                  key={lineNumber}
                  className={clsx(isHighlighted && 'bg-acc/10')}
                >
                  <td
                    className={clsx(
                      'w-8 pr-1 text-right align-top select-none',
                      isHighlighted ? 'text-acc-ink' : 'text-ink-4',
                    )}
                  >
                    {lineNumber}
                  </td>
                  <td className="pr-2 whitespace-pre-wrap">
                    {lineTokens.length > 0 ? (
                      lineTokens.map((token, tokenIndex) => (
                        <span key={tokenIndex} style={{ color: token.color }}>
                          {token.content}
                        </span>
                      ))
                    ) : (
                      <span className="text-ink-1">{line}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!onOpenFilePreview) return <div className="mb-3">{preview}</div>;

  return (
    <button
      type="button"
      onClick={() =>
        onOpenFilePreview({ filePath, lineStart: startLine, lineEnd: endLine })
      }
      className="group mb-3 block w-full cursor-pointer text-left"
      title="Open file preview"
    >
      <div className="ring-acc/0 group-hover:ring-acc/45 rounded-md transition-shadow group-hover:ring-1">
        {preview}
      </div>
    </button>
  );
}

function CommentThread({
  thread,
  providerId,
  projectId,
  prId,
  collapsed,
  onToggleResolved,
  showDivider,
  onOpenFilePreview,
  mentionDisplayNames,
  mentionOptions,
  onSearchMentions,
  onUploadImage,
}: {
  thread: AzureDevOpsCommentThread;
  providerId?: string;
  projectId: string;
  prId: number;
  collapsed: boolean;
  onToggleResolved: () => void;
  showDivider: boolean;
  onOpenFilePreview?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd: number;
  }) => void;
  mentionDisplayNames?: MentionDisplayNames;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
}) {
  const resolved = !isActiveThread(thread);

  return (
    <div
      className={clsx(
        showDivider &&
          'border-glass-border-strong border-t shadow-[0_-1px_0_rgba(255,255,255,0.03)]',
        resolved
          ? 'border-l-status-done/50 border-l-2'
          : 'border-l-acc-line border-l-2',
        collapsed ? 'bg-bg-0/30 hover:bg-bg-1/70' : 'bg-bg-1/50',
      )}
    >
      {collapsed ? (
        <CollapsedThread
          thread={thread}
          onExpand={onToggleResolved}
          mentionDisplayNames={mentionDisplayNames}
        />
      ) : (
        <ExpandedThread
          thread={thread}
          providerId={providerId}
          projectId={projectId}
          prId={prId}
          onCollapseResolved={onToggleResolved}
          onOpenFilePreview={onOpenFilePreview}
          mentionDisplayNames={mentionDisplayNames}
          mentionOptions={mentionOptions}
          onSearchMentions={onSearchMentions}
          onUploadImage={onUploadImage}
        />
      )}
    </div>
  );
}

function ExpandedThread({
  thread,
  providerId,
  projectId,
  prId,
  onCollapseResolved,
  onOpenFilePreview,
  mentionDisplayNames,
  mentionOptions,
  onSearchMentions,
  onUploadImage,
}: {
  thread: AzureDevOpsCommentThread;
  providerId?: string;
  projectId: string;
  prId: number;
  onCollapseResolved: () => void;
  onOpenFilePreview?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd: number;
  }) => void;
  mentionDisplayNames?: MentionDisplayNames;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
}) {
  const resolved = !isActiveThread(thread);
  const updateStatus = useUpdateThreadStatus(projectId, prId);
  const fileStart = thread.threadContext?.rightFileStart?.line;
  const fileEnd = thread.threadContext?.rightFileEnd?.line ?? fileStart;
  const lastComment = thread.comments[thread.comments.length - 1];

  const handleReopen = useCallback(() => {
    updateStatus.mutate({ threadId: thread.id, status: 'active' });
  }, [thread.id, updateStatus]);

  return (
    <div>
      {resolved && (
        <div
          role="button"
          tabIndex={0}
          onClick={onCollapseResolved}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onCollapseResolved();
            }
          }}
          className="border-glass-border/60 bg-glass-light/40 hover:bg-glass-light flex w-full items-center gap-2 border-b px-4 py-3 text-left transition-colors"
        >
          <CheckCircle2 className="text-status-done h-4 w-4" />
          <span className="text-ink-2 flex-1 text-xs">
            Resolved by{' '}
            <span className="text-ink-1 font-medium">
              {lastComment?.author.displayName ?? 'someone'}
            </span>
            {lastComment && (
              <span className="text-ink-4">
                {' '}
                - {formatRelativeTime(lastComment.publishedDate)}
              </span>
            )}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              handleReopen();
            }}
            loading={updateStatus.isPending}
          >
            Reopen
          </Button>
          <ChevronUp className="text-ink-3 h-3.5 w-3.5" />
        </div>
      )}

      <div className={resolved ? 'px-4 pt-4 pb-4' : 'px-4 py-4'}>
        {thread.threadContext && (
          <div className="mb-3 flex items-center gap-2 pl-[37px]">
            <FileText className="text-ink-4 h-3 w-3" />
            <span className="border-glass-border bg-bg-2 text-ink-3 rounded border px-1.5 py-0.5 font-mono text-[11px]">
              {thread.threadContext.filePath}
              {fileStart ? `:${fileStart}` : ''}
            </span>
          </div>
        )}

        {thread.threadContext && fileStart && fileEnd && (
          <div className="pl-[37px]">
            <ThreadCodePreview
              filePath={thread.threadContext.filePath}
              startLine={fileStart}
              endLine={fileEnd}
              projectId={projectId}
              prId={prId}
              onOpenFilePreview={onOpenFilePreview}
            />
          </div>
        )}

        <div className="relative">
          {thread.comments.map((comment, index) => (
            <ThreadComment
              key={comment.id}
              comment={comment}
              providerId={providerId}
              connect={index < thread.comments.length - 1 || !resolved}
              mentionDisplayNames={mentionDisplayNames}
              threadId={thread.id}
              projectId={projectId}
              prId={prId}
              mentionOptions={mentionOptions}
              onSearchMentions={onSearchMentions}
              onUploadImage={onUploadImage}
            />
          ))}
        </div>

        <ThreadReplyForm
          threadId={thread.id}
          projectId={projectId}
          prId={prId}
          canResolve={!resolved}
          mentionOptions={mentionOptions}
          onSearchMentions={onSearchMentions}
          onUploadImage={onUploadImage}
        />

        <div className="mt-3 flex justify-end">
          <StatusDropdown
            status={thread.status}
            threadId={thread.id}
            projectId={projectId}
            prId={prId}
          />
        </div>
      </div>
    </div>
  );
}

function ThreadComment({
  comment,
  providerId,
  connect,
  mentionDisplayNames,
  threadId,
  projectId,
  prId,
  mentionOptions = EMPTY_MENTION_OPTIONS,
  onSearchMentions,
  onUploadImage,
}: {
  comment: AzureDevOpsCommentThread['comments'][number];
  providerId?: string;
  connect: boolean;
  mentionDisplayNames?: MentionDisplayNames;
  threadId: number;
  projectId: string;
  prId: number;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
}) {
  const avatarUrl =
    comment.author.imageUrl && providerId
      ? encodeProxyUrl(providerId, comment.author.imageUrl)
      : comment.author.imageUrl;
  const decodedCommentContent = useMemo(
    () => decodeMentionDisplayNames(comment.content, mentionOptions),
    [comment.content, mentionOptions],
  );
  const { data: currentUser } = useCurrentAzureUser(projectId);
  const updateComment = useUpdateThreadComment(projectId, prId);
  const deleteComment = useDeleteThreadComment(projectId, prId);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(decodedCommentContent);
  const [editError, setEditError] = useState<string | null>(null);
  const [isUploadingEditImages, setIsUploadingEditImages] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const currentUserEmail = currentUser?.emailAddress.toLowerCase();
  const commentUserEmail = comment.author.uniqueName.toLowerCase();
  const canEdit =
    !!currentUser &&
    (currentUser.id === comment.author.id ||
      currentUser.identityId === comment.author.id ||
      currentUserEmail === commentUserEmail);

  const saveEdit = async (body: string, images: PromptImagePart[] = []) => {
    if (updateComment.isPending || isUploadingEditImages) return;

    const encodedBody = encodeMentionDisplayNames(body.trim(), mentionOptions);
    if (
      !encodedBody ||
      (encodedBody === comment.content && images.length === 0)
    ) {
      setIsEditing(false);
      setDraft(decodedCommentContent);
      return;
    }

    setEditError(null);
    setIsUploadingEditImages(images.length > 0);
    try {
      const content = await uploadImagesIntoMarkdown({
        body: body.trim(),
        images,
        uploadImage: onUploadImage,
        mentionOptions,
      });
      if (content.includes('jc-image://')) {
        setEditError('Remove incomplete image placeholders before saving.');
        return;
      }
      updateComment.mutate(
        { threadId, commentId: comment.id, content },
        { onSuccess: () => setIsEditing(false) },
      );
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsUploadingEditImages(false);
    }
  };

  return (
    <div className="flex items-stretch gap-3">
      <div className="flex w-[26px] shrink-0 flex-col items-center">
        <UserAvatar
          name={comment.author.displayName}
          imageUrl={avatarUrl}
          size="sm"
        />
        {connect && (
          <div className="bg-glass-border mt-1.5 w-px flex-1 rounded" />
        )}
      </div>
      <div className={clsx('min-w-0 flex-1', connect && 'pb-4')}>
        <div className="mb-1 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-ink-0 shrink-0 text-sm font-medium">
              {comment.author.displayName}
            </span>
            <span className="text-ink-3 shrink-0 text-xs">
              {formatRelativeTime(comment.publishedDate)}
            </span>
          </div>
          {canEdit && !isEditing && (
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Pencil className="h-3.5 w-3.5" />}
                tooltip="Edit comment"
                onClick={() => {
                  setDraft(decodedCommentContent);
                  setIsEditing(true);
                }}
              />
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="text-ink-3 h-6 px-1.5 text-[11px]"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      deleteComment.mutate(
                        { threadId, commentId: comment.id },
                        {
                          onSettled: () => setIsConfirmingDelete(false),
                        },
                      );
                    }}
                    loading={deleteComment.isPending}
                    className="h-6 px-1.5 text-[11px] text-red-400 hover:text-red-300"
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  tooltip="Delete comment"
                  onClick={() => setIsConfirmingDelete(true)}
                />
              )}
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="flex flex-col gap-2 pr-1">
            <InlineCommentComposer
              lineStart={0}
              initialBody={draft}
              onSubmit={(body, images) => void saveEdit(body, images)}
              onCancel={() => {
                setDraft(decodedCommentContent);
                setEditError(null);
                setIsEditing(false);
              }}
              placeholder="Edit comment..."
              submitLabel={
                updateComment.isPending || isUploadingEditImages
                  ? 'Saving...'
                  : 'Save'
              }
              allowImages={!!onUploadImage}
              insertImagesInBody={!!onUploadImage}
              isSubmitting={updateComment.isPending || isUploadingEditImages}
              mentionOptions={mentionOptions}
              onSearchMentions={onSearchMentions}
            />
            {editError && <p className="text-xs text-red-400">{editError}</p>}
          </div>
        ) : (
          <div className="text-ink-1 pr-1 text-xs leading-relaxed [&_code]:text-[11px] [&_pre]:text-[11px]">
            <AzureMarkdownContent
              markdown={comment.content}
              providerId={providerId}
              mentionDisplayNames={mentionDisplayNames}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function PrInlineCommentTimeline({
  comments,
  providerId,
  threadId,
  projectId,
  prId,
  canResolve = false,
  threadStatus,
  mentionDisplayNames,
  mentionOptions = EMPTY_MENTION_OPTIONS,
  onSearchMentions,
  onUploadImage,
}: {
  comments: PrTimelineComment[];
  providerId?: string;
  threadId?: number;
  projectId?: string;
  prId?: number;
  canResolve?: boolean;
  threadStatus?: string;
  mentionDisplayNames?: MentionDisplayNames;
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  onUploadImage?: (image: PromptImagePart, fileName: string) => Promise<string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: currentUser } = useCurrentAzureUser(projectId ?? '');
  const isResolved =
    threadStatus !== undefined &&
    threadStatus !== 'active' &&
    threadStatus !== 'pending' &&
    threadStatus !== 'unknown';

  const canDeleteComment = useCallback(
    (comment: PrTimelineComment) => {
      if (!currentUser) return false;
      const currentEmail = currentUser.emailAddress.toLowerCase();
      const commentEmail = comment.author.uniqueName?.toLowerCase();
      return (
        currentUser.id === comment.author.id ||
        currentUser.identityId === comment.author.id ||
        currentEmail === commentEmail
      );
    },
    [currentUser],
  );

  const firstComment = comments[0];
  const remainingComments = comments.slice(1);

  if (!firstComment) return null;

  return (
    <div
      className={clsx(
        'border-glass-border/70 border-y font-sans',
        isResolved ? 'bg-bg-1/60' : 'bg-bg-1/90',
      )}
    >
      {isResolved && (
        <div className="border-glass-border/40 flex items-center gap-2 border-b px-4 py-1.5">
          <CheckCircle2 className="text-status-done h-3.5 w-3.5" />
          <span className="text-ink-3 flex-1 text-[11px]">Resolved</span>
          {threadId !== undefined && projectId && prId !== undefined && (
            <InlineThreadReopenButton
              threadId={threadId}
              projectId={projectId}
              prId={prId}
            />
          )}
        </div>
      )}
      <div className="px-4 py-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setCollapsed((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setCollapsed((value) => !value);
            }
          }}
          className="hover:bg-glass-light -mx-1 flex w-[calc(100%+0.5rem)] items-start gap-3 rounded px-1 py-1 text-left transition-colors"
        >
          <TimelineAvatar comment={firstComment} providerId={providerId} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-ink-0 text-sm font-medium">
                {firstComment.author.displayName}
              </span>
              <span className="text-ink-3 text-xs">
                {formatRelativeTime(firstComment.publishedDate)}
              </span>
              {remainingComments.length > 0 && (
                <span className="bg-glass-medium text-ink-3 rounded px-1.5 py-0.5 text-[10px]">
                  {remainingComments.length} repl
                  {remainingComments.length === 1 ? 'y' : 'ies'}
                </span>
              )}
              {threadId !== undefined &&
                projectId &&
                prId !== undefined &&
                canDeleteComment(firstComment) && (
                  <InlineCommentDeleteButton
                    threadId={threadId}
                    commentId={firstComment.id}
                    projectId={projectId}
                    prId={prId}
                  />
                )}
            </div>
            <div
              className={clsx(
                'text-ink-1 text-xs leading-relaxed',
                collapsed && 'line-clamp-2',
              )}
            >
              <AzureMarkdownContent
                markdown={firstComment.content}
                providerId={providerId}
                mentionDisplayNames={mentionDisplayNames}
              />
            </div>
          </div>
          {remainingComments.length > 0 && (
            <ChevronDown
              className={clsx(
                'text-ink-3 mt-1 h-3.5 w-3.5 transition-transform',
                !collapsed && 'rotate-180',
              )}
            />
          )}
        </div>

        {!collapsed && remainingComments.length > 0 && (
          <div className="mt-2">
            {remainingComments.map((comment, index) => (
              <div
                key={comment.id}
                className="flex items-stretch gap-3 pb-3 last:pb-0"
              >
                <div className="flex w-[26px] shrink-0 flex-col items-center">
                  <TimelineAvatar comment={comment} providerId={providerId} />
                  {index < remainingComments.length - 1 && (
                    <div className="bg-glass-border mt-1.5 w-px flex-1 rounded" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-ink-0 text-sm font-medium">
                      {comment.author.displayName}
                    </span>
                    <span className="text-ink-3 text-xs">
                      {formatRelativeTime(comment.publishedDate)}
                    </span>
                    {threadId !== undefined &&
                      projectId &&
                      prId !== undefined &&
                      canDeleteComment(comment) && (
                        <InlineCommentDeleteButton
                          threadId={threadId}
                          commentId={comment.id}
                          projectId={projectId}
                          prId={prId}
                        />
                      )}
                  </div>
                  <div className="text-ink-1 text-xs leading-relaxed">
                    <AzureMarkdownContent
                      markdown={comment.content}
                      providerId={providerId}
                      mentionDisplayNames={mentionDisplayNames}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {threadId !== undefined &&
          projectId &&
          prId !== undefined &&
          !isResolved && (
            <ThreadReplyForm
              threadId={threadId}
              projectId={projectId}
              prId={prId}
              canResolve={canResolve}
              mentionOptions={mentionOptions}
              onSearchMentions={onSearchMentions}
              onUploadImage={onUploadImage}
            />
          )}
      </div>
    </div>
  );
}

function InlineCommentDeleteButton({
  threadId,
  commentId,
  projectId,
  prId,
}: {
  threadId: number;
  commentId: number;
  projectId: string;
  prId: number;
}) {
  const deleteComment = useDeleteThreadComment(projectId, prId);
  const [isConfirming, setIsConfirming] = useState(false);

  if (isConfirming) {
    return (
      <div
        className="flex items-center gap-1"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        role="presentation"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsConfirming(false)}
          className="text-ink-3 h-6 px-1.5 text-[11px]"
        >
          Cancel
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            deleteComment.mutate(
              { threadId, commentId },
              { onSettled: () => setIsConfirming(false) },
            );
          }}
          loading={deleteComment.isPending}
          className="h-6 px-1.5 text-[11px] text-red-400 hover:text-red-300"
        >
          Delete
        </Button>
      </div>
    );
  }

  return (
    <IconButton
      variant="ghost"
      size="sm"
      icon={<Trash2 className="h-3 w-3" />}
      tooltip="Delete comment"
      onClick={(event) => {
        event.stopPropagation();
        setIsConfirming(true);
      }}
      className="text-ink-3 hover:text-ink-1 h-6 w-6"
    />
  );
}

function InlineThreadReopenButton({
  threadId,
  projectId,
  prId,
}: {
  threadId: number;
  projectId: string;
  prId: number;
}) {
  const updateStatus = useUpdateThreadStatus(projectId, prId);

  const handleReopen = useCallback(() => {
    updateStatus.mutate({ threadId, status: 'active' });
  }, [threadId, updateStatus]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleReopen}
      loading={updateStatus.isPending}
      className="text-ink-3 hover:text-ink-1 h-6 px-1.5 text-[11px]"
    >
      Reopen
    </Button>
  );
}

function TimelineAvatar({
  comment,
  providerId,
}: {
  comment: PrTimelineComment;
  providerId?: string;
}) {
  const avatarUrl =
    comment.author.imageUrl && providerId
      ? encodeProxyUrl(providerId, comment.author.imageUrl)
      : comment.author.imageUrl;

  return (
    <UserAvatar
      name={comment.author.displayName}
      imageUrl={avatarUrl}
      size="sm"
    />
  );
}

function CollapsedThread({
  thread,
  onExpand,
  mentionDisplayNames,
}: {
  thread: AzureDevOpsCommentThread;
  onExpand: () => void;
  mentionDisplayNames?: MentionDisplayNames;
}) {
  const firstComment = thread.comments[0];
  const lastComment = thread.comments[thread.comments.length - 1];
  const replyCount = Math.max(0, thread.comments.length - 1);
  const showLast = lastComment && lastComment.id !== firstComment.id;

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
    >
      <div className="flex w-[26px] shrink-0 justify-center pt-0.5">
        <CheckCircle2 className="text-status-done h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-ink-2 shrink-0 text-xs font-semibold">
            {firstComment.author.displayName}
          </span>
          <span className="text-ink-3 truncate text-xs">
            {plainText(firstComment.content, mentionDisplayNames)}
          </span>
        </div>
        {showLast && (
          <div className="mt-1.5 flex min-w-0 items-baseline gap-2">
            <span className="text-status-done shrink-0 text-xs">-&gt;</span>
            <span className="text-ink-3 shrink-0 text-xs font-medium">
              {lastComment.author.displayName}
            </span>
            <span className="text-ink-4 truncate text-xs">
              {plainText(lastComment.content, mentionDisplayNames)}
            </span>
          </div>
        )}
        <div className="text-ink-4 mt-1.5 flex items-center gap-1.5 text-[11px]">
          {replyCount > 0 && (
            <>
              <span>
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </span>
              <span>-</span>
            </>
          )}
          <span>
            resolved by {lastComment?.author.displayName ?? 'someone'}
          </span>
          {lastComment && (
            <>
              <span>-</span>
              <span>{formatRelativeTime(lastComment.publishedDate)}</span>
            </>
          )}
        </div>
      </div>
      <div className="text-ink-3 group-hover:text-ink-1 flex shrink-0 items-center gap-1 self-center text-xs">
        Show
        <ChevronDown className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

function isActiveThread(thread: AzureDevOpsCommentThread) {
  return ACTIVE_STATUSES.has(thread.status);
}

function plainText(value: string, mentionDisplayNames?: MentionDisplayNames) {
  return replaceAzureDevOpsMentions(value, mentionDisplayNames, {
    escapeMarkdown: false,
  })
    .replace(/(?<!@)<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
