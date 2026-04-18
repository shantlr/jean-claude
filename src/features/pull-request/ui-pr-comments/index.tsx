import clsx from 'clsx';
import {
  ChevronDown,
  Send,
  MessageCircle,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Separator } from '@/common/ui/separator';
import { Textarea } from '@/common/ui/textarea';
import { UserAvatar } from '@/common/ui/user-avatar';
import { getLanguageFromPath } from '@/features/agent/ui-diff-view/language-utils';
import { AzureMarkdownContent } from '@/features/common/ui-azure-html-content';
import {
  useAddThreadReply,
  useUpdateThreadStatus,
  usePullRequestFileContent,
} from '@/hooks/use-pull-requests';
import type { AzureDevOpsCommentThread } from '@/lib/api';
import { encodeProxyUrl } from '@/lib/azure-image-proxy';
import { formatRelativeTime } from '@/lib/time';

type ThreadStatus = AzureDevOpsCommentThread['status'];

const ACTIVE_STATUSES = new Set<ThreadStatus>(['active', 'pending', 'unknown']);

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-acc/50 text-acc-ink' },
  fixed: { label: 'Resolved', color: 'bg-status-done/50 text-status-done' },
  wontFix: { label: "Won't fix", color: 'bg-glass-medium text-ink-2' },
  closed: { label: 'Closed', color: 'bg-glass-medium text-ink-2' },
  byDesign: {
    label: 'By design',
    color: 'bg-acc/50 text-acc-ink',
  },
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
}: {
  threads: AzureDevOpsCommentThread[];
  providerId?: string;
  projectId: string;
  prId: number;
}) {
  const [showResolved, setShowResolved] = useState(false);

  // Filter out deleted threads and system-generated threads
  const visibleThreads = useMemo(
    () =>
      threads.filter(
        (t) => !t.isDeleted && t.comments.length > 0 && t.comments[0].content,
      ),
    [threads],
  );

  // Split into active vs resolved/closed
  const { activeThreads, resolvedThreads } = useMemo(() => {
    const active: AzureDevOpsCommentThread[] = [];
    const resolved: AzureDevOpsCommentThread[] = [];
    for (const t of visibleThreads) {
      if (ACTIVE_STATUSES.has(t.status)) {
        active.push(t);
      } else {
        resolved.push(t);
      }
    }
    return { activeThreads: active, resolvedThreads: resolved };
  }, [visibleThreads]);

  if (visibleThreads.length === 0) {
    return (
      <div className="text-ink-3 py-4 text-center text-sm">No comments yet</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Active threads */}
      {activeThreads.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-acc-ink flex items-center gap-2 text-xs font-medium">
            <MessageCircle className="h-3.5 w-3.5" />
            Active
            <span className="text-acc-ink bg-acc/50 rounded-full px-1.5 py-0.5 text-[10px]">
              {activeThreads.length}
            </span>
          </div>
          {activeThreads.map((thread) => (
            <CommentThread
              key={thread.id}
              thread={thread}
              providerId={providerId}
              projectId={projectId}
              prId={prId}
            />
          ))}
        </div>
      )}

      {/* Resolved threads */}
      {resolvedThreads.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="text-ink-3 hover:text-ink-2 flex items-center gap-2 text-xs font-medium transition-colors"
          >
            <ChevronRight
              className={clsx(
                'h-3.5 w-3.5 transition-transform',
                showResolved && 'rotate-90',
              )}
            />
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resolved
            <span className="text-ink-2 bg-glass-medium rounded-full px-1.5 py-0.5 text-[10px]">
              {resolvedThreads.length}
            </span>
          </button>
          {showResolved &&
            resolvedThreads.map((thread) => (
              <CommentThread
                key={thread.id}
                thread={thread}
                providerId={providerId}
                projectId={projectId}
                prId={prId}
                dimmed
              />
            ))}
        </div>
      )}
    </div>
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
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
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
        onClick={() => setIsOpen(!isOpen)}
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
          {SETTABLE_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className={clsx(
                  'hover:bg-glass-medium flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                  s === status ? 'text-ink-0' : 'text-ink-2',
                )}
              >
                <span
                  className={clsx('inline-block h-2 w-2 rounded-full', c.color)}
                />
                {c.label}
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
}: {
  threadId: number;
  projectId: string;
  prId: number;
}) {
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const addReply = useAddThreadReply(projectId, prId);

  const handleSubmit = useCallback(() => {
    if (content.trim() && !addReply.isPending) {
      addReply.mutate(
        { threadId, content: content.trim() },
        {
          onSuccess: () => {
            setContent('');
            setIsExpanded(false);
          },
        },
      );
    }
  }, [content, threadId, addReply]);

  if (!isExpanded) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="mt-2"
      >
        Reply…
      </Button>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <Textarea
        size="sm"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a reply…"
        className="flex-1"
        rows={2}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === 'Escape') {
            setIsExpanded(false);
            setContent('');
          }
        }}
      />
      <IconButton
        variant="primary"
        size="sm"
        onClick={handleSubmit}
        disabled={!content.trim() || addReply.isPending}
        icon={<Send />}
        tooltip="Send reply"
        className="self-end"
      />
    </div>
  );
}

/** Number of context lines to show above and below the commented range */
const CONTEXT_LINES = 2;

function ThreadCodePreview({
  filePath,
  startLine,
  endLine,
  projectId,
  prId,
}: {
  filePath: string;
  startLine: number;
  endLine: number;
  projectId: string;
  prId: number;
}) {
  const { data: fileContent } = usePullRequestFileContent(
    projectId,
    prId,
    filePath,
    'head',
  );
  const [tokens, setTokens] = useState<ThemedToken[][]>([]);

  // Extract the relevant lines with context
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

  return (
    <div className="border-glass-border mb-2 overflow-hidden rounded-md border">
      <div className="bg-bg-0/30 overflow-x-auto font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {snippetLines.map((line, i) => {
              const lineNum = firstLineNumber + i;
              const isHighlighted = lineNum >= startLine && lineNum <= endLine;
              const lineTokens = tokens[i] ?? [];

              return (
                <tr
                  key={lineNum}
                  className={clsx(isHighlighted && 'bg-acc/10')}
                >
                  <td
                    className={clsx(
                      'w-8 pr-1 text-right align-top select-none',
                      isHighlighted ? 'text-acc-ink' : 'text-ink-4',
                    )}
                  >
                    {lineNum}
                  </td>
                  <td className="pr-2 whitespace-pre-wrap">
                    {lineTokens.length > 0 ? (
                      lineTokens.map((token, ti) => (
                        <span key={ti} style={{ color: token.color }}>
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
}

function CommentThread({
  thread,
  providerId,
  projectId,
  prId,
  dimmed,
}: {
  thread: AzureDevOpsCommentThread;
  providerId?: string;
  projectId: string;
  prId: number;
  dimmed?: boolean;
}) {
  return (
    <div
      className={clsx(
        'relative rounded-lg p-3',
        dimmed ? 'bg-bg-1/30 opacity-70' : 'bg-bg-1/50',
      )}
    >
      {/* Thread status dropdown - top right */}
      <div className="absolute top-3 right-3">
        <StatusDropdown
          status={thread.status}
          threadId={thread.id}
          projectId={projectId}
          prId={prId}
        />
      </div>

      {/* File context if present */}
      {thread.threadContext && (
        <div className="text-ink-3 mb-2 flex items-center gap-2 pr-20 text-xs">
          <span className="font-mono">{thread.threadContext.filePath}</span>
          {thread.threadContext.rightFileStart && (
            <span>Line {thread.threadContext.rightFileStart.line}</span>
          )}
        </div>
      )}

      {/* Code preview for file-level comments */}
      {thread.threadContext?.rightFileStart && (
        <ThreadCodePreview
          filePath={thread.threadContext.filePath}
          startLine={thread.threadContext.rightFileStart.line}
          endLine={
            thread.threadContext.rightFileEnd?.line ??
            thread.threadContext.rightFileStart.line
          }
          projectId={projectId}
          prId={prId}
        />
      )}

      {/* Comments in thread */}
      <div className="flex flex-col gap-3 pr-16">
        {thread.comments.map((comment, index) => {
          // Proxy avatar URL through authenticated image proxy when provider is available
          const avatarUrl =
            comment.author.imageUrl && providerId
              ? encodeProxyUrl(providerId, comment.author.imageUrl)
              : comment.author.imageUrl;

          return (
            <div key={comment.id}>
              {index > 0 && <Separator className="mb-3" />}
              <div className="mb-1 flex items-center gap-2">
                <UserAvatar
                  name={comment.author.displayName}
                  imageUrl={avatarUrl}
                  size="sm"
                />
                <span className="text-ink-1 text-sm font-medium">
                  {comment.author.displayName}
                </span>
                <span className="text-ink-3 text-xs">
                  {formatRelativeTime(comment.publishedDate)}
                </span>
              </div>
              <div className="text-ink-1 text-xs [&_code]:text-[11px] [&_pre]:text-[11px]">
                <AzureMarkdownContent
                  markdown={comment.content}
                  providerId={providerId}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply form */}
      <ThreadReplyForm threadId={thread.id} projectId={projectId} prId={prId} />
    </div>
  );
}
