import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader2, FileCode, GitCommit, FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Separator } from '@/common/ui/separator';
import {
  DiffFileTree,
  normalizeAzureChangeType,
} from '@/features/common/ui-file-diff';
import type { DiffFile } from '@/features/common/ui-file-diff';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useRecordPrView } from '@/hooks/use-pr-view-snapshot';
import { useProject } from '@/hooks/use-projects';
import {
  usePullRequest,
  usePullRequestCommits,
  usePullRequestChanges,
  usePullRequestFileContent,
  usePullRequestThreads,
  useAddPullRequestComment,
  useAddPullRequestFileComment,
} from '@/hooks/use-pull-requests';
import type { FeedItem } from '@shared/feed-types';

import { PrCommits } from '../ui-pr-commits';
import { PrDiffView } from '../ui-pr-diff-view';
import { PrHeader } from '../ui-pr-header';
import { PrOverview } from '../ui-pr-overview';

type Tab = 'overview' | 'files' | 'commits';

const PR_DETAIL_TABS: Tab[] = ['overview', 'files', 'commits'];

export function PrDetail({
  projectId,
  prId,
  bottomPadding = 0,
}: {
  projectId: string;
  prId: number;
  bottomPadding?: number;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileTreeWidth, setFileTreeWidth] = useState(250);
  const queryClient = useQueryClient();

  const navigateTab = useCallback(
    (direction: 'next' | 'prev') => {
      const currentIndex = PR_DETAIL_TABS.indexOf(activeTab);
      const newIndex =
        direction === 'next'
          ? (currentIndex + 1) % PR_DETAIL_TABS.length
          : (currentIndex - 1 + PR_DETAIL_TABS.length) % PR_DETAIL_TABS.length;
      setActiveTab(PR_DETAIL_TABS[newIndex]);
    },
    [activeTab],
  );

  useCommands('pr-detail-tab-navigation', [
    {
      label: 'Next PR Detail Tab',
      shortcut: 'shift+]',
      handler: () => navigateTab('next'),
      hideInCommandPalette: true,
    },
    {
      label: 'Previous PR Detail Tab',
      shortcut: 'shift+[',
      handler: () => navigateTab('prev'),
      hideInCommandPalette: true,
    },
    {
      label: 'PR Detail Overview Tab',
      shortcut: 'cmd+shift+1',
      handler: () => setActiveTab('overview'),
      hideInCommandPalette: true,
    },
    {
      label: 'PR Detail Files Tab',
      shortcut: 'cmd+shift+2',
      handler: () => setActiveTab('files'),
      hideInCommandPalette: true,
    },
    {
      label: 'PR Detail Commits Tab',
      shortcut: 'cmd+shift+3',
      handler: () => setActiveTab('commits'),
      hideInCommandPalette: true,
    },
  ]);

  const { data: project } = useProject(projectId);

  const { mutate: recordPrView } = useRecordPrView();
  const recordPrViewRef = useRef(recordPrView);
  recordPrViewRef.current = recordPrView;

  // Record PR view for activity tracking.
  // Optimistically clear hasNewActivity in the feed cache so the blue dot
  // disappears immediately, then persist the snapshot in the background.
  useEffect(() => {
    if (!project?.repoProviderId || !project?.repoProjectId || !project?.repoId)
      return;

    const prFeedItemId = `pr:${projectId}:${prId}`;

    // Optimistically update feed cache to clear the blue dot right away
    queryClient.setQueryData<FeedItem[]>(['feed', 'items'], (old) => {
      if (!old) return old;
      return old.map((item) =>
        item.id === prFeedItemId ? { ...item, hasNewActivity: false } : item,
      );
    });

    // Persist the view snapshot in the background
    recordPrViewRef.current({
      projectId,
      pullRequestId: prId,
      providerId: project.repoProviderId,
      repoProjectId: project.repoProjectId,
      repoId: project.repoId,
    });
  }, [
    prId,
    project?.repoId,
    project?.repoProjectId,
    project?.repoProviderId,
    projectId,
    queryClient,
  ]);

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
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center">
        Pull request not found
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-xs">
      {/* Header */}
      <PrHeader pr={pr} projectId={projectId} />

      {/* Tabs */}
      <div className="flex">
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
      </div>
      <Separator />

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'overview' && (
          <PrOverview
            pr={pr}
            projectId={projectId}
            prId={prId}
            providerId={project?.repoProviderId ?? undefined}
            threads={threads}
            onAddComment={handleAddComment}
            isAddingComment={addComment.isPending}
            bottomPadding={bottomPadding}
          />
        )}

        {activeTab === 'files' && (
          <div
            ref={containerRef}
            className={clsx('flex h-full', isDragging && 'select-none')}
            style={
              bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
            }
          >
            {/* File tree */}
            <div
              className="panel-edge-shadow-r relative flex shrink-0 flex-col"
              style={{ width: fileTreeWidth }}
            >
              {isFilesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
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
                  'hover:bg-acc/50 absolute top-0 right-0 h-full w-1 cursor-col-resize transition-colors',
                  isDragging && 'bg-acc/50',
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
                <div className="text-ink-3 flex h-full items-center justify-center">
                  Select a file to view changes
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'commits' &&
          (isCommitsLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
            </div>
          ) : (
            <PrCommits commits={commits} bottomPadding={bottomPadding} />
          ))}
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
          ? 'border-acc text-acc-ink'
          : 'text-ink-2 hover:text-ink-1 border-transparent',
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-xs',
            active ? 'bg-acc/50' : 'bg-glass-medium',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
