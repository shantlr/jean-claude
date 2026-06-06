import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FileX, FolderX, Loader2, RefreshCw } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Separator } from '@/common/ui/separator';
import { getFilesWithAnnotations } from '@/features/agent/ui-diff-annotation';
import { SummaryPanel } from '@/features/agent/ui-summary-panel';
import { WorktreeActions } from '@/features/agent/ui-worktree-actions';
import {
  DiffFileTree,
  FileDiffContent,
  normalizeWorktreeStatus,
} from '@/features/common/ui-file-diff';
import type { DiffFile, DiffFileStatus } from '@/features/common/ui-file-diff';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useTaskSummary } from '@/hooks/use-task-summary';
import {
  useWorktreeDiff,
  useWorktreeFileContent,
  useWorktreeCommits,
  useWorktreeCommitDiff,
  useWorktreeCommitFileContent,
} from '@/hooks/use-worktree-diff';
import {
  api,
  type FileAnnotation,
  type WorktreeCommit,
  type WorktreeDiffFile,
} from '@/lib/api';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useDiffFileTreeWidth, type ReviewMode } from '@/stores/navigation';
import {
  useReviewCommentsStore,
  useReviewCommentsForFile,
  useReviewCommentsForCommitFile,
  useReviewCommentsByFile,
  useReviewCommentsByCommitFile,
  type ReviewPresetId,
} from '@/stores/review-comments';
import type { PromptImagePart } from '@shared/agent-backend-types';
import { isImagePath, isSvgPath } from '@shared/image-types';

import { ReviewCommitsPanel } from './review-commits-panel';
import { ReviewFilesTree } from './review-files-tree';
import { ReviewModeTabs } from './review-mode-tabs';

const HEADER_HEIGHT_CLS = `h-[40px] shrink-0`;

export function WorktreeReviewView({
  taskId,
  projectId,
  selectedFilePath,
  onSelectFile,
  branchName,
  sourceBranch,
  defaultBranch,
  protectedBranches,
  taskName,
  hasRepoLink,
  pullRequestUrl,
  onMergeStarted,
  onOpenPrView,
  bottomPadding = 0,
  collapsedFolders,
  onToggleFolder,
  reviewMode,
  onReviewModeChange,
  fileExplorerRootPath,
  fileExplorerSelectedFile,
  onFileExplorerSelectFile,
  fileExplorerExpandedDirs,
  onFileExplorerToggleDir,
  fileExplorerHideUnchanged,
  onFileExplorerToggleHideUnchanged: _onFileExplorerToggleHideUnchanged,
  showWorktreeActions = true,
  gitReviewEnabled = true,
}: {
  taskId: string;
  projectId: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
  branchName: string;
  sourceBranch: string | null;
  defaultBranch: string | null;
  protectedBranches: string[];
  taskName: string | null;
  hasRepoLink: boolean;
  pullRequestUrl: string | null;
  onMergeStarted: () => void;
  onOpenPrView: () => void;
  bottomPadding?: number;
  /** Set of collapsed folder paths in the diff file tree */
  collapsedFolders?: Set<string>;
  /** Callback when a folder is toggled in the diff file tree */
  onToggleFolder?: (path: string) => void;
  reviewMode: ReviewMode;
  onReviewModeChange: (mode: ReviewMode) => void;
  fileExplorerRootPath: string | null;
  fileExplorerSelectedFile: string | null;
  onFileExplorerSelectFile: (path: string) => void;
  fileExplorerExpandedDirs: Set<string>;
  onFileExplorerToggleDir: (path: string) => void;
  fileExplorerHideUnchanged: boolean;
  onFileExplorerToggleHideUnchanged: () => void;
  showWorktreeActions?: boolean;
  gitReviewEnabled?: boolean;
}) {
  const effectiveReviewMode = gitReviewEnabled ? reviewMode : 'files';
  const { data, isLoading, error, refresh } = useWorktreeDiff(
    taskId,
    gitReviewEnabled,
  );
  const { data: summary, isLoading: isSummaryLoading } = useTaskSummary(taskId);
  const { data: commits, isLoading: isCommitsLoading } = useWorktreeCommits(
    taskId,
    gitReviewEnabled,
  );

  // Commit selection state
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
    null,
  );
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(
    null,
  );
  const { data: commitDiffFiles } = useWorktreeCommitDiff(
    taskId,
    selectedCommitHash,
  );

  const handleSelectCommit = useCallback((hash: string | null) => {
    setSelectedCommitHash(hash);
    setSelectedCommitFile(null); // reset file when commit changes
  }, []);

  // Convert commit diff files to DiffFile format for DiffFileTree
  const commitDiffFilesForTree: DiffFile[] = useMemo(() => {
    return (commitDiffFiles ?? []).map((f) => ({
      path: f.path,
      status: normalizeWorktreeStatus(f.status),
    }));
  }, [commitDiffFiles]);

  const queryClient = useQueryClient();
  const addRunningJob = useBackgroundJobsStore((state) => state.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);
  const isSummaryJobRunning = useBackgroundJobsStore((state) =>
    state.jobs.some(
      (job) =>
        job.status === 'running' &&
        job.type === 'summary-generation' &&
        job.taskId === taskId,
    ),
  );
  const {
    width: fileTreeWidth,
    setWidth: setFileTreeWidth,
    minWidth,
  } = useDiffFileTreeWidth();
  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: fileTreeWidth,
    minWidth,
    maxWidthFraction: 0.5,
    onWidthChange: setFileTreeWidth,
  });

  // Get annotations from summary (memoized to avoid recreating array on each render)
  const annotations: FileAnnotation[] = useMemo(() => {
    return summary?.annotations ?? [];
  }, [summary?.annotations]);

  // Review comments state
  const commentCountByFile = useReviewCommentsByFile(taskId);
  const commitCommentCountByFile = useReviewCommentsByCommitFile({
    taskId,
    commitHash: selectedCommitHash,
  });
  const addComment = useReviewCommentsStore((s) => s.addComment);
  const removeComment = useReviewCommentsStore((s) => s.removeComment);
  const updateComment = useReviewCommentsStore((s) => s.updateComment);
  const resolveComment = useReviewCommentsStore((s) => s.resolveComment);

  const handleAddReviewComment = useCallback(
    (params: {
      filePath: string;
      lineStart: number;
      lineEnd?: number;
      selectedText?: string;
      body: string;
      presets: ReviewPresetId[];
      images?: PromptImagePart[];
      commitHash?: string;
    }) => {
      addComment(taskId, {
        commentKind: 'diff',
        anchor: {
          filePath: params.filePath,
          lineStart: params.lineStart,
          lineEnd: params.lineEnd,
          selectedText: params.selectedText,
        },
        commitHash: params.commitHash,
        body: params.body,
        images: params.images,
        presets: params.presets,
        status: 'open',
        resolved: false,
      });
    },
    [taskId, addComment],
  );

  const handleDeleteReviewComment = useCallback(
    (commentId: string) => {
      removeComment(taskId, commentId);
    },
    [taskId, removeComment],
  );

  const handleEditReviewComment = useCallback(
    (commentId: string, newBody: string, newImages: PromptImagePart[]) => {
      updateComment(taskId, commentId, {
        body: newBody,
        images: newImages.length > 0 ? newImages : undefined,
      });
    },
    [taskId, updateComment],
  );

  const handleResolveReviewComment = useCallback(
    (commentId: string) => {
      resolveComment(taskId, commentId);
    },
    [taskId, resolveComment],
  );

  // Handle summary generation
  const handleGenerateSummary = useCallback(() => {
    if (!gitReviewEnabled || isSummaryJobRunning) {
      return;
    }

    const jobId = addRunningJob({
      type: 'summary-generation',
      title: 'Generating git diff summary',
      taskId,
      details: {
        taskName,
      },
    });

    void api.tasks.summary
      .generate(taskId)
      .then((generatedSummary) => {
        queryClient.setQueryData(
          ['task-summary', generatedSummary.taskId],
          generatedSummary,
        );
        queryClient.invalidateQueries({
          queryKey: ['task-summary', generatedSummary.taskId],
        });
        markJobSucceeded(jobId, { taskId: generatedSummary.taskId });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Failed to generate summary';
        markJobFailed(jobId, message);
      });
  }, [
    gitReviewEnabled,
    isSummaryJobRunning,
    addRunningJob,
    taskId,
    taskName,
    queryClient,
    markJobSucceeded,
    markJobFailed,
  ]);

  // Keyboard shortcut for generating summary (cmd+shift+s)
  useCommands(
    'worktree-diff-view-summary',
    gitReviewEnabled
      ? [
          {
            label: 'Generate Summary',
            shortcut: 'cmd+shift+s',
            handler: () => {
              if (!summary && !isSummaryJobRunning) {
                handleGenerateSummary();
              }
            },
          },
        ]
      : [],
  );

  // Keyboard shortcut for opening submit review overlay (cmd+enter)
  const selectedFile = useMemo(() => {
    if (!selectedFilePath || !data?.files) return null;
    return data.files.find((f) => f.path === selectedFilePath) ?? null;
  }, [selectedFilePath, data?.files]);

  // Convert worktree files to unified DiffFile format for the tree
  const diffFiles: DiffFile[] = useMemo(() => {
    return (data?.files ?? []).map((f) => ({
      path: f.path,
      status: normalizeWorktreeStatus(f.status),
    }));
  }, [data?.files]);

  // Build set of files that have annotations for the tree indicator
  const filesWithAnnotations = useMemo(() => {
    return getFilesWithAnnotations(annotations);
  }, [annotations]);

  // Build diffFilesMap for the files mode (Map of absolute path -> diff info)
  const diffFilesMap = useMemo(() => {
    const map = new Map<
      string,
      { status: DiffFileStatus; additions: number; deletions: number }
    >();
    if (fileExplorerRootPath && data?.files) {
      for (const f of data.files) {
        const absPath = fileExplorerRootPath + '/' + f.path;
        map.set(absPath, {
          status: normalizeWorktreeStatus(f.status),
          additions: f.additions,
          deletions: f.deletions,
        });
      }
    }
    return map;
  }, [fileExplorerRootPath, data?.files]);

  const fileExplorerCommentCountByFile = useMemo(() => {
    const map = new Map<string, number>();
    if (!fileExplorerRootPath) return map;

    for (const [filePath, count] of Object.entries(commentCountByFile)) {
      map.set(fileExplorerRootPath + '/' + filePath, count);
    }

    return map;
  }, [fileExplorerRootPath, commentCountByFile]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-ink-3 h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-status-fail">Failed to load diff</p>
        <button
          onClick={refresh}
          className="bg-glass-medium text-ink-1 hover:bg-bg-3 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (data?.worktreeDeleted) {
    return (
      <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-2">
        <FolderX className="h-8 w-8" />
        <p>Worktree has been deleted</p>
        <p className="text-ink-4 text-xs">
          The diff view is no longer available
        </p>
      </div>
    );
  }

  const files = data?.files ?? [];

  if (files.length === 0 && effectiveReviewMode === 'changes') {
    return (
      <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-3">
        <FileX className="h-8 w-8" />
        <p>No changes yet</p>
        <button
          onClick={refresh}
          className="bg-glass-medium text-ink-1 hover:bg-bg-3 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={clsx('flex h-full', isDragging && 'select-none')}
    >
      {/* File tree sidebar */}
      <div
        className="panel-edge-shadow-r relative flex shrink-0 flex-col"
        style={{ width: fileTreeWidth }}
      >
        <div
          className={clsx(
            'flex min-w-0 items-center justify-between gap-1 px-1 py-1',
            HEADER_HEIGHT_CLS,
          )}
        >
          <ReviewModeTabs
            activeMode={effectiveReviewMode}
            onModeChange={onReviewModeChange}
            changedFilesCount={files.length}
            commitsCount={commits?.length}
            showGitModes={gitReviewEnabled}
          />
          {gitReviewEnabled && (
            <button
              onClick={refresh}
              className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Separator />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          style={
            bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
          }
        >
          {effectiveReviewMode === 'changes' && (
            <>
              <DiffFileTree
                files={diffFiles}
                selectedPath={selectedFilePath}
                onSelectFile={onSelectFile}
                filesWithAnnotations={filesWithAnnotations}
                commentCountByFile={commentCountByFile}
                collapsedFolders={collapsedFolders}
                onToggleFolder={onToggleFolder}
              />
              {showWorktreeActions && (
                <WorktreeActions
                  taskId={taskId}
                  projectId={projectId}
                  branchName={branchName}
                  sourceBranch={sourceBranch}
                  defaultBranch={defaultBranch}
                  protectedBranches={protectedBranches}
                  hasRepoLink={hasRepoLink}
                  pullRequestUrl={pullRequestUrl}
                  onMergeStarted={onMergeStarted}
                  onOpenPrView={onOpenPrView}
                />
              )}
            </>
          )}
          {effectiveReviewMode === 'files' && fileExplorerRootPath && (
            <ReviewFilesTree
              rootPath={fileExplorerRootPath}
              selectedFilePath={fileExplorerSelectedFile}
              onSelectFile={onFileExplorerSelectFile}
              expandedDirs={fileExplorerExpandedDirs}
              onToggleDir={onFileExplorerToggleDir}
              diffFiles={diffFilesMap}
              hideUnchanged={fileExplorerHideUnchanged}
              commentCountsByFile={fileExplorerCommentCountByFile}
            />
          )}
          {effectiveReviewMode === 'commits' && (
            <CommitsSidebarSplit
              commits={commits ?? []}
              isCommitsLoading={isCommitsLoading}
              selectedCommitHash={selectedCommitHash}
              onSelectCommit={handleSelectCommit}
              commitDiffFiles={commitDiffFilesForTree}
              selectedCommitFile={selectedCommitFile}
              onSelectCommitFile={setSelectedCommitFile}
              commitDiffFilesCount={commitDiffFiles?.length ?? 0}
              commentCountByFile={commitCommentCountByFile}
            />
          )}
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={clsx(
            'hover:bg-acc/50 absolute top-0 right-0 h-full w-1 cursor-col-resize transition-colors',
            isDragging && 'bg-acc/50',
          )}
        />
      </div>

      {/* Diff content */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {effectiveReviewMode === 'changes' && (
          <>
            {/* Summary panel at top */}
            <SummaryPanel
              summary={summary?.summary ?? null}
              isLoading={isSummaryJobRunning || isSummaryLoading}
              onGenerate={handleGenerateSummary}
            />

            {/* File diff content */}
            <div
              className="flex-1 overflow-auto"
              style={
                bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
              }
            >
              {selectedFile ? (
                <WorktreeFileDiffContent
                  file={selectedFile}
                  taskId={taskId}
                  headerClassName={HEADER_HEIGHT_CLS}
                  annotations={annotations}
                  onAddReviewComment={handleAddReviewComment}
                  onDeleteReviewComment={handleDeleteReviewComment}
                  onEditReviewComment={handleEditReviewComment}
                  onResolveReviewComment={handleResolveReviewComment}
                />
              ) : (
                <div className="text-ink-3 flex h-full items-center justify-center">
                  <p>Select a file to view changes</p>
                </div>
              )}
            </div>
          </>
        )}
        {effectiveReviewMode === 'files' && (
          <div
            className="flex-1 overflow-auto"
            style={
              bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
            }
          >
            {fileExplorerSelectedFile && fileExplorerRootPath ? (
              <ReviewFileContentPane
                taskId={taskId}
                filePath={fileExplorerSelectedFile}
                rootPath={fileExplorerRootPath}
                diffFilesMap={diffFilesMap}
                annotations={annotations}
                onAddReviewComment={handleAddReviewComment}
                onDeleteReviewComment={handleDeleteReviewComment}
                onEditReviewComment={handleEditReviewComment}
                onResolveReviewComment={handleResolveReviewComment}
              />
            ) : (
              <div className="text-ink-3 flex h-full items-center justify-center">
                <p>Select a file to view</p>
              </div>
            )}
          </div>
        )}
        {effectiveReviewMode === 'commits' && (
          <div
            className="flex-1 overflow-auto"
            style={
              bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
            }
          >
            {selectedCommitHash && selectedCommitFile ? (
              <CommitFileDiffContent
                taskId={taskId}
                commitHash={selectedCommitHash}
                filePath={selectedCommitFile}
                status={
                  commitDiffFiles?.find((f) => f.path === selectedCommitFile)
                    ?.status ?? 'modified'
                }
                onAddReviewComment={handleAddReviewComment}
                onDeleteReviewComment={handleDeleteReviewComment}
                onEditReviewComment={handleEditReviewComment}
                onResolveReviewComment={handleResolveReviewComment}
              />
            ) : selectedCommitHash ? (
              <div className="text-ink-3 flex h-full items-center justify-center">
                <p>Select a file to view changes</p>
              </div>
            ) : (
              <div className="text-ink-3 flex h-full items-center justify-center text-sm">
                <p>Select a commit to view its changes</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WorktreeFileDiffContent({
  file,
  headerClassName,
  taskId,
  annotations,
  onAddReviewComment,
  onDeleteReviewComment,
  onEditReviewComment,
  onResolveReviewComment,
}: {
  file: WorktreeDiffFile;
  headerClassName?: string;
  taskId: string;
  annotations?: FileAnnotation[];
  onAddReviewComment?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd?: number;
    selectedText?: string;
    body: string;
    presets: ReviewPresetId[];
    images?: PromptImagePart[];
    commitHash?: string;
  }) => void;
  onDeleteReviewComment?: (commentId: string) => void;
  onEditReviewComment?: (
    commentId: string,
    newBody: string,
    newImages: PromptImagePart[],
  ) => void;
  onResolveReviewComment?: (commentId: string) => void;
}) {
  const { data, isLoading, error } = useWorktreeFileContent(
    taskId,
    file.path,
    file.status,
  );

  // Get review comments for this specific file
  const fileReviewComments = useReviewCommentsForFile(taskId, file.path);

  if (error) {
    return (
      <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-2">
        <p className="text-status-fail">Failed to load file content</p>
        <p className="text-xs">{file.path}</p>
      </div>
    );
  }

  // Convert to unified DiffFile type
  const diffFile: DiffFile = {
    path: file.path,
    status: normalizeWorktreeStatus(file.status),
  };

  return (
    <FileDiffContent
      file={diffFile}
      oldContent={data?.oldContent ?? ''}
      newContent={data?.newContent ?? ''}
      isLoading={isLoading}
      isBinary={data?.isBinary}
      oldImageDataUrl={data?.oldImageDataUrl}
      newImageDataUrl={data?.newImageDataUrl}
      headerClassName={headerClassName}
      annotations={annotations}
      reviewComments={fileReviewComments}
      onAddReviewComment={onAddReviewComment}
      onDeleteReviewComment={onDeleteReviewComment}
      onEditReviewComment={onEditReviewComment}
      onResolveReviewComment={onResolveReviewComment}
    />
  );
}

function ReviewFileContentPane({
  taskId,
  filePath,
  rootPath,
  diffFilesMap,
  annotations,
  onAddReviewComment,
  onDeleteReviewComment,
  onEditReviewComment,
  onResolveReviewComment,
}: {
  taskId: string;
  filePath: string;
  rootPath: string;
  diffFilesMap: Map<
    string,
    { status: DiffFileStatus; additions: number; deletions: number }
  >;
  annotations?: FileAnnotation[];
  onAddReviewComment?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd?: number;
    selectedText?: string;
    body: string;
    presets: ReviewPresetId[];
    images?: PromptImagePart[];
    commitHash?: string;
  }) => void;
  onDeleteReviewComment?: (commentId: string) => void;
  onEditReviewComment?: (
    commentId: string,
    newBody: string,
    newImages: PromptImagePart[],
  ) => void;
  onResolveReviewComment?: (commentId: string) => void;
}) {
  const diffInfo = diffFilesMap.get(filePath);
  const relativePath = filePath.startsWith(rootPath + '/')
    ? filePath.slice(rootPath.length + 1)
    : filePath;

  if (diffInfo) {
    // Changed file — show diff
    const worktreeStatus: 'added' | 'modified' | 'deleted' =
      diffInfo.status === 'added'
        ? 'added'
        : diffInfo.status === 'deleted'
          ? 'deleted'
          : 'modified';
    return (
      <WorktreeFileDiffContent
        file={{
          path: relativePath,
          status: worktreeStatus,
          additions: diffInfo.additions,
          deletions: diffInfo.deletions,
        }}
        taskId={taskId}
        annotations={annotations}
        onAddReviewComment={onAddReviewComment}
        onDeleteReviewComment={onDeleteReviewComment}
        onEditReviewComment={onEditReviewComment}
        onResolveReviewComment={onResolveReviewComment}
      />
    );
  }

  // Unchanged file — show plain content
  return (
    <PlainFileViewer
      taskId={taskId}
      filePath={filePath}
      relativePath={relativePath}
      onAddReviewComment={onAddReviewComment}
      onDeleteReviewComment={onDeleteReviewComment}
      onEditReviewComment={onEditReviewComment}
      onResolveReviewComment={onResolveReviewComment}
    />
  );
}

function PlainFileViewer({
  taskId,
  filePath,
  relativePath,
  onAddReviewComment,
  onDeleteReviewComment,
  onEditReviewComment,
  onResolveReviewComment,
}: {
  taskId: string;
  filePath: string;
  relativePath: string;
  onAddReviewComment?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd?: number;
    selectedText?: string;
    body: string;
    presets: ReviewPresetId[];
    images?: PromptImagePart[];
  }) => void;
  onDeleteReviewComment?: (commentId: string) => void;
  onEditReviewComment?: (
    commentId: string,
    newBody: string,
    newImages: PromptImagePart[],
  ) => void;
  onResolveReviewComment?: (commentId: string) => void;
}) {
  const isRasterImage = isImagePath(filePath) && !isSvgPath(filePath);
  const { data, isLoading } = useQuery({
    queryKey: ['file-content', filePath],
    queryFn: () => api.fs.readFile(filePath),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: !isRasterImage,
  });
  const { data: imageDataUrl, isLoading: isImageLoading } = useQuery({
    queryKey: ['image-content', filePath],
    queryFn: () => api.fs.readImageAsDataUrl(filePath),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: isRasterImage,
  });
  const fileReviewComments = useReviewCommentsForFile(taskId, relativePath);

  if (isLoading || isImageLoading) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center text-sm">
        Loading...
      </div>
    );
  }

  if (isRasterImage) {
    if (!imageDataUrl) {
      return (
        <div className="text-ink-3 flex h-full items-center justify-center text-sm">
          Unable to read image
        </div>
      );
    }

    return (
      <FileDiffContent
        file={{ path: relativePath, status: 'unchanged' }}
        oldContent=""
        newContent=""
        isBinary
        newImageDataUrl={imageDataUrl}
        reviewComments={fileReviewComments}
        onAddReviewComment={onAddReviewComment}
        onDeleteReviewComment={onDeleteReviewComment}
        onEditReviewComment={onEditReviewComment}
        onResolveReviewComment={onResolveReviewComment}
      />
    );
  }

  if (!data) {
    return (
      <div className="text-ink-3 flex h-full items-center justify-center text-sm">
        Unable to read file
      </div>
    );
  }

  return (
    <FileDiffContent
      file={{ path: relativePath, status: 'unchanged' }}
      oldContent={data.content}
      newContent={data.content}
      reviewComments={fileReviewComments}
      onAddReviewComment={onAddReviewComment}
      onDeleteReviewComment={onDeleteReviewComment}
      onEditReviewComment={onEditReviewComment}
      onResolveReviewComment={onResolveReviewComment}
    />
  );
}

function CommitFileDiffContent({
  taskId,
  commitHash,
  filePath,
  status,
  onAddReviewComment,
  onDeleteReviewComment,
  onEditReviewComment,
  onResolveReviewComment,
}: {
  taskId: string;
  commitHash: string;
  filePath: string;
  status: 'added' | 'modified' | 'deleted';
  onAddReviewComment?: (params: {
    filePath: string;
    lineStart: number;
    lineEnd?: number;
    selectedText?: string;
    body: string;
    presets: ReviewPresetId[];
    images?: PromptImagePart[];
    commitHash?: string;
  }) => void;
  onDeleteReviewComment?: (commentId: string) => void;
  onEditReviewComment?: (
    commentId: string,
    newBody: string,
    newImages: PromptImagePart[],
  ) => void;
  onResolveReviewComment?: (commentId: string) => void;
}) {
  const { data, isLoading, error } = useWorktreeCommitFileContent(
    taskId,
    commitHash,
    filePath,
    status,
  );
  const fileReviewComments = useReviewCommentsForCommitFile({
    taskId,
    commitHash,
    filePath,
  });
  const handleAddCommitReviewComment = useCallback(
    (params: {
      filePath: string;
      lineStart: number;
      lineEnd?: number;
      selectedText?: string;
      body: string;
      presets: ReviewPresetId[];
      images?: PromptImagePart[];
    }) => {
      onAddReviewComment?.({ ...params, commitHash });
    },
    [commitHash, onAddReviewComment],
  );

  if (error) {
    return (
      <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-2">
        <p className="text-status-fail">Failed to load file content</p>
        <p className="text-xs">{filePath}</p>
      </div>
    );
  }

  const diffFile: DiffFile = {
    path: filePath,
    status: normalizeWorktreeStatus(status),
  };

  return (
    <FileDiffContent
      file={diffFile}
      oldContent={data?.oldContent ?? ''}
      newContent={data?.newContent ?? ''}
      isLoading={isLoading}
      isBinary={data?.isBinary}
      oldImageDataUrl={data?.oldImageDataUrl}
      newImageDataUrl={data?.newImageDataUrl}
      reviewComments={fileReviewComments}
      onAddReviewComment={handleAddCommitReviewComment}
      onDeleteReviewComment={onDeleteReviewComment}
      onEditReviewComment={onEditReviewComment}
      onResolveReviewComment={onResolveReviewComment}
    />
  );
}

const DEFAULT_COMMITS_HEIGHT_FRACTION = 0.5;
const MIN_PANEL_HEIGHT = 80;

function CommitsSidebarSplit({
  commits,
  isCommitsLoading,
  selectedCommitHash,
  onSelectCommit,
  commitDiffFiles,
  selectedCommitFile,
  onSelectCommitFile,
  commitDiffFilesCount,
  commentCountByFile,
}: {
  commits: WorktreeCommit[];
  isCommitsLoading: boolean;
  selectedCommitHash: string | null;
  onSelectCommit: (hash: string | null) => void;
  commitDiffFiles: DiffFile[];
  selectedCommitFile: string | null;
  onSelectCommitFile: (path: string | null) => void;
  commitDiffFilesCount: number;
  commentCountByFile?: Record<string, number>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [commitsPanelHeight, setCommitsPanelHeight] = useState<number | null>(
    null,
  );
  const [isResizing, setIsResizing] = useState(false);
  const hasFiles = selectedCommitHash && commitDiffFilesCount > 0;

  // Initialize height from container on first render with files
  useEffect(() => {
    if (hasFiles && commitsPanelHeight === null && containerRef.current) {
      setCommitsPanelHeight(
        containerRef.current.clientHeight * DEFAULT_COMMITS_HEIGHT_FRACTION,
      );
    }
  }, [hasFiles, commitsPanelHeight]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizing(true);
      const startY = e.clientY;
      const startHeight = commitsPanelHeight ?? 200;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const delta = moveEvent.clientY - startY;
        const containerHeight = container.clientHeight;
        const newHeight = Math.max(
          MIN_PANEL_HEIGHT,
          Math.min(
            containerHeight - MIN_PANEL_HEIGHT - 4, // 4px for resize handle
            startHeight + delta,
          ),
        );
        setCommitsPanelHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [commitsPanelHeight],
  );

  return (
    <div
      ref={containerRef}
      className={clsx(
        'flex min-h-0 flex-1 flex-col',
        isResizing && 'select-none',
      )}
    >
      {/* Commits list */}
      <div
        className="shrink-0 overflow-y-auto"
        style={
          hasFiles && commitsPanelHeight != null
            ? { height: commitsPanelHeight }
            : { flex: 1 }
        }
      >
        <ReviewCommitsPanel
          commits={commits}
          isLoading={isCommitsLoading}
          selectedCommitHash={selectedCommitHash}
          onSelectCommit={onSelectCommit}
        />
      </div>

      {/* Resize handle + file list */}
      {hasFiles && (
        <>
          {/* Vertical resize handle */}
          <div
            onMouseDown={handleResizeStart}
            className={clsx(
              'hover:bg-acc/50 h-1 shrink-0 cursor-row-resize transition-colors',
              isResizing && 'bg-acc/50',
            )}
          />

          {/* Changed files header + tree */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="text-ink-2 shrink-0 px-3 py-1.5 text-[10px] font-medium tracking-wider uppercase">
              Changed Files ({commitDiffFilesCount})
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DiffFileTree
                files={commitDiffFiles}
                selectedPath={selectedCommitFile}
                onSelectFile={onSelectCommitFile}
                commentCountByFile={commentCountByFile}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
