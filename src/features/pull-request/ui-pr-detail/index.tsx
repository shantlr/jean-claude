import clsx from 'clsx';
import {
  Loader2,
  FileCode,
  GitCommit,
  MessageSquare,
  FileText,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState, useCallback, useMemo } from 'react';

import {
  DiffFileTree,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import type { DiffFile } from '@/features/common/ui-file-diff';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import {
  usePullRequest,
  usePullRequestCommits,
  usePullRequestChanges,
  usePullRequestFileContent,
  usePullRequestThreads,
  useAddPullRequestComment,
  useAddPullRequestFileComment,
} from '@/hooks/use-pull-requests';

import { PrComments } from '../ui-pr-comments';
import { PrCommits } from '../ui-pr-commits';
import { PrDiffView } from '../ui-pr-diff-view';
import { PrHeader } from '../ui-pr-header';
import { PrOverview } from '../ui-pr-overview';

type Tab = 'overview' | 'files' | 'commits' | 'comments';

export function PrDetail({
  projectId,
  prId,
}: {
  projectId: string;
  prId: number;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileTreeWidth, setFileTreeWidth] = useState(250);

  const { data: pr, isLoading: isPrLoading } = usePullRequest(projectId, prId);
  const { data: commits = [], isLoading: isCommitsLoading } =
    usePullRequestCommits(projectId, prId);
  const { data: files = [], isLoading: isFilesLoading } = usePullRequestChanges(
    projectId,
    prId,
  );
  const { data: threads = [] } = usePullRequestThreads(projectId, prId);

  // File content for selected file
  const selectedFileData = files.find((f) => f.path === selectedFile);
  const { data: baseContent = '', isLoading: isBaseLoading } =
    usePullRequestFileContent(projectId, prId, selectedFile ?? '', 'base');
  const { data: headContent = '', isLoading: isHeadLoading } =
    usePullRequestFileContent(projectId, prId, selectedFile ?? '', 'head');

  // Mutations
  const addComment = useAddPullRequestComment(projectId, prId);
  const addFileComment = useAddPullRequestFileComment(projectId, prId);

  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: fileTreeWidth,
    minWidth: 200,
    maxWidthFraction: 0.4,
    onWidthChange: setFileTreeWidth,
  });

  const handleAddComment = useCallback(
    (content: string) => {
      addComment.mutate(content);
    },
    [addComment],
  );

  const handleAddFileComment = useCallback(
    (params: {
      filePath: string;
      line: number;
      lineEnd?: number;
      content: string;
    }) => {
      addFileComment.mutate(params);
    },
    [addFileComment],
  );

  // Convert PR files to unified DiffFile format for the tree
  const diffFiles: DiffFile[] = useMemo(() => {
    return files.map((f) => ({
      path: f.path,
      status: normalizeAzureChangeType(f.changeType),
      originalPath: f.originalPath,
    }));
  }, [files]);

  if (isPrLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Pull request not found
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden text-xs">
      {/* Header */}
      <PrHeader pr={pr} />

      {/* Tabs */}
      <div className="flex border-b border-neutral-700">
        <TabButton
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          icon={<FileText className="h-4 w-4" />}
          label="Overview"
        />
        <TabButton
          active={activeTab === 'files'}
          onClick={() => setActiveTab('files')}
          icon={<FileCode className="h-4 w-4" />}
          label="Files"
          count={files.length}
        />
        <TabButton
          active={activeTab === 'commits'}
          onClick={() => setActiveTab('commits')}
          icon={<GitCommit className="h-4 w-4" />}
          label="Commits"
          count={commits.length}
        />
        <TabButton
          active={activeTab === 'comments'}
          onClick={() => setActiveTab('comments')}
          icon={<MessageSquare className="h-4 w-4" />}
          label="Comments"
          count={
            threads.filter((t) => !t.isDeleted && t.comments.length > 0).length
          }
        />
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'overview' && <PrOverview pr={pr} />}

        {activeTab === 'files' && (
          <div
            ref={containerRef}
            className={clsx('flex h-full', isDragging && 'select-none')}
          >
            {/* File tree */}
            <div
              className="relative flex shrink-0 flex-col border-r border-neutral-700"
              style={{ width: fileTreeWidth }}
            >
              {isFilesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
                </div>
              ) : (
                <DiffFileTree
                  files={diffFiles}
                  selectedPath={selectedFile}
                  onSelectFile={setSelectedFile}
                />
              )}
              {/* Resize handle */}
              <div
                onMouseDown={handleMouseDown}
                className={clsx(
                  'absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/50',
                  isDragging && 'bg-blue-500/50',
                )}
              />
            </div>

            {/* Diff view */}
            <div className="min-w-0 flex-1 overflow-hidden">
              {selectedFile && selectedFileData ? (
                <PrDiffView
                  file={selectedFileData}
                  baseContent={baseContent}
                  headContent={headContent}
                  isLoadingContent={isBaseLoading || isHeadLoading}
                  threads={threads}
                  onAddFileComment={handleAddFileComment}
                  isAddingComment={addFileComment.isPending}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-neutral-500">
                  Select a file to view changes
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'commits' &&
          (isCommitsLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
          ) : (
            <PrCommits commits={commits} />
          ))}

        {activeTab === 'comments' && (
          <PrComments
            threads={threads}
            onAddComment={handleAddComment}
            isAddingComment={addComment.isPending}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-neutral-400 hover:text-neutral-200',
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-xs',
            active ? 'bg-blue-900/50' : 'bg-neutral-700',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
