import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FileX, FolderX, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useCallback } from 'react';

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
import type { DiffFile } from '@/features/common/ui-file-diff';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useTaskSummary } from '@/hooks/use-task-summary';
import {
  useWorktreeDiff,
  useWorktreeFileContent,
} from '@/hooks/use-worktree-diff';
import { api, type FileAnnotation, type WorktreeDiffFile } from '@/lib/api';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useDiffFileTreeWidth } from '@/stores/navigation';

const HEADER_HEIGHT_CLS = `h-[40px] shrink-0`;

export function WorktreeDiffView({
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
}) {
  const { data, isLoading, error, refresh } = useWorktreeDiff(taskId, true);
  const { data: summary, isLoading: isSummaryLoading } = useTaskSummary(taskId);
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

  // Handle summary generation
  const handleGenerateSummary = useCallback(() => {
    if (isSummaryJobRunning) {
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
    isSummaryJobRunning,
    addRunningJob,
    taskId,
    taskName,
    queryClient,
    markJobSucceeded,
    markJobFailed,
  ]);

  // Keyboard shortcut for generating summary (cmd+shift+s)
  useCommands('worktree-diff-view-summary', [
    {
      label: 'Generate Summary',
      shortcut: 'cmd+shift+s',
      handler: () => {
        if (!summary && !isSummaryJobRunning) {
          handleGenerateSummary();
        }
      },
    },
  ]);

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

  if (files.length === 0) {
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
            'flex items-center justify-between px-3 py-2',
            HEADER_HEIGHT_CLS,
          )}
        >
          <span className="text-ink-2 text-xs font-medium">
            Changed Files ({files.length})
          </span>
          <button
            onClick={refresh}
            className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1 transition-colors"
            title="Refresh diff"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <Separator />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          style={
            bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined
          }
        >
          <DiffFileTree
            files={diffFiles}
            selectedPath={selectedFilePath}
            onSelectFile={onSelectFile}
            filesWithAnnotations={filesWithAnnotations}
          />
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
            />
          ) : (
            <div className="text-ink-3 flex h-full items-center justify-center">
              <p>Select a file to view changes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorktreeFileDiffContent({
  file,
  headerClassName,
  taskId,
  annotations,
}: {
  file: WorktreeDiffFile;
  headerClassName?: string;
  taskId: string;
  annotations?: FileAnnotation[];
}) {
  const { data, isLoading, error } = useWorktreeFileContent(
    taskId,
    file.path,
    file.status,
  );

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
      headerClassName={headerClassName}
      annotations={annotations}
    />
  );
}
