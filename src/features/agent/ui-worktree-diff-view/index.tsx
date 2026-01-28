import clsx from 'clsx';
import { FileX, FolderX, Loader2, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';

import { DiffFileTree } from '@/features/agent/ui-diff-file-tree';
import { DiffView } from '@/features/agent/ui-diff-view';
import { WorktreeActions } from '@/features/agent/ui-worktree-actions';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import {
  useWorktreeDiff,
  useWorktreeFileContent,
} from '@/hooks/use-worktree-diff';
import type { WorktreeDiffFile } from '@/lib/api';
import { useDiffFileTreeWidth } from '@/stores/navigation';

export function WorktreeDiffView({
  taskId,
  selectedFilePath,
  onSelectFile,
  branchName,
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

  const selectedFile = useMemo(() => {
    if (!selectedFilePath || !data?.files) return null;
    return data.files.find((f) => f.path === selectedFilePath) ?? null;
  }, [selectedFilePath, data?.files]);

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
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
        <FileX className="h-8 w-8" />
        <p>No changes yet</p>
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
        className="relative flex flex-shrink-0 flex-col border-r border-neutral-700"
        style={{ width: fileTreeWidth }}
      >
        <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-2">
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
          files={files}
          selectedPath={selectedFilePath}
          onSelectFile={onSelectFile}
        />
        <WorktreeActions
          taskId={taskId}
          branchName={branchName}
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
            'absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/50',
            isDragging && 'bg-blue-500/50',
          )}
        />
      </div>

      {/* Diff content */}
      <div className="min-w-0 flex-1 overflow-auto">
        {selectedFile ? (
          <FileDiffContent file={selectedFile} taskId={taskId} />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-500">
            <p>Select a file to view changes</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FileDiffContent({ file, taskId }: {
  file: WorktreeDiffFile;
  taskId: string;
}) {
  const { data, isLoading, error } = useWorktreeFileContent(
    taskId,
    file.path,
    file.status,
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
        <p className="text-red-400">Failed to load file content</p>
        <p className="text-xs">{file.path}</p>
      </div>
    );
  }

  // Handle binary files
  if (data?.isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500">
        <p>Binary file changed</p>
        <p className="text-xs">{file.path}</p>
      </div>
    );
  }

  // For added files, oldContent is null
  // For deleted files, newContent is null
  const oldString = data?.oldContent ?? '';
  const newString = data?.newContent ?? '';

  return (
    <div className="flex h-full flex-col">
      {/* File path header */}
      <div className="flex items-center gap-2 border-b border-neutral-700 bg-neutral-800/50 px-4 py-2">
        <StatusBadge status={file.status} />
        <span className="font-mono text-sm text-neutral-300">{file.path}</span>
      </div>

      {/* Diff view */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <DiffView
          filePath={file.path}
          oldString={oldString}
          newString={newString}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'added' | 'modified' | 'deleted' }) {
  const config = {
    added: { label: 'Added', bg: 'bg-green-500/20', text: 'text-green-400' },
    modified: {
      label: 'Modified',
      bg: 'bg-orange-500/20',
      text: 'text-orange-400',
    },
    deleted: { label: 'Deleted', bg: 'bg-red-500/20', text: 'text-red-400' },
  };

  const { label, bg, text } = config[status];

  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
}
