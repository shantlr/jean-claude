import clsx from 'clsx';
import { FileX, FolderX, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useCallback } from 'react';

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
import { useTaskSummary, useGenerateSummary } from '@/hooks/use-task-summary';
import {
  useWorktreeDiff,
  useWorktreeFileContent,
} from '@/hooks/use-worktree-diff';
import type { FileAnnotation, WorktreeDiffFile } from '@/lib/api';
import { useKeyboardBindings } from '@/lib/keyboard-bindings';
import { useDiffFileTreeWidth } from '@/stores/navigation';

const HEADER_HEIGHT_CLS = `h-[40px] shrink-0`;

export function WorktreeDiffView({
  taskId,
  selectedFilePath,
  onSelectFile,
  branchName,
  sourceBranch,
  defaultBranch,
  taskName,
  taskPrompt,
  workItemId,
  repoProviderId,
  repoProjectId,
  repoId,
  onMergeComplete,
}: {
  taskId: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
  branchName: string;
  sourceBranch: string | null;
  defaultBranch: string | null;
  taskName: string | null;
  taskPrompt: string;
  workItemId: string | null;
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoId: string | null;
  onMergeComplete: () => void;
}) {
  const { data, isLoading, error, refresh } = useWorktreeDiff(taskId, true);
  const { data: summary, isLoading: isSummaryLoading } = useTaskSummary(taskId);
  const generateSummary = useGenerateSummary();
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
    generateSummary.mutate(taskId);
  }, [generateSummary, taskId]);

  // Keyboard shortcut for generating summary (cmd+shift+s)
  useKeyboardBindings('worktree-diff-view', {
    'cmd+shift+s': () => {
      if (!summary && !generateSummary.isPending) {
        handleGenerateSummary();
      }
      return true;
    },
  });

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
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-red-400">Failed to load diff</p>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (data?.worktreeDeleted) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
        <FolderX className="h-8 w-8" />
        <p>Worktree has been deleted</p>
        <p className="text-xs text-neutral-600">
          The diff view is no longer available
        </p>
      </div>
    );
  }

  const files = data?.files ?? [];

  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-500">
        <FileX className="h-8 w-8" />
        <p>No changes yet</p>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-600"
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
        className="relative flex shrink-0 flex-col border-r border-neutral-700"
        style={{ width: fileTreeWidth }}
      >
        <div
          className={clsx(
            'flex items-center justify-between border-b border-neutral-700 px-3 py-2',
            HEADER_HEIGHT_CLS,
          )}
        >
          <span className="text-xs font-medium text-neutral-400">
            Changed Files ({files.length})
          </span>
          <button
            onClick={refresh}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
            title="Refresh diff"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <DiffFileTree
          files={diffFiles}
          selectedPath={selectedFilePath}
          onSelectFile={onSelectFile}
          filesWithAnnotations={filesWithAnnotations}
        />
        <WorktreeActions
          taskId={taskId}
          branchName={branchName}
          sourceBranch={sourceBranch}
          defaultBranch={defaultBranch}
          taskName={taskName}
          taskPrompt={taskPrompt}
          workItemId={workItemId}
          repoProviderId={repoProviderId}
          repoProjectId={repoProjectId}
          repoId={repoId}
          onMergeComplete={onMergeComplete}
        />
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={clsx(
            'absolute top-0 right-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/50',
            isDragging && 'bg-blue-500/50',
          )}
        />
      </div>

      {/* Diff content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Summary panel at top */}
        <SummaryPanel
          summary={summary?.summary ?? null}
          isLoading={generateSummary.isPending || isSummaryLoading}
          onGenerate={handleGenerateSummary}
        />

        {/* File diff content */}
        <div className="flex-1 overflow-auto">
          {selectedFile ? (
            <WorktreeFileDiffContent
              file={selectedFile}
              taskId={taskId}
              headerClassName={HEADER_HEIGHT_CLS}
              annotations={annotations}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-500">
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
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
        <p className="text-red-400">Failed to load file content</p>
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
