import clsx from 'clsx';
import { FolderTree, RefreshCw, X } from 'lucide-react';
import { useCallback } from 'react';

import { useInvalidateDirectoryListings } from '@/hooks/use-directory-listing';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useTaskRootPath } from '@/hooks/use-task-root-path';
import {
  useFileExplorerPaneWidth,
  useFileExplorerTreeWidth,
  useTaskFileExplorerState,
} from '@/stores/navigation';

import { FileContentViewer } from './file-content-viewer';
import { FileTree } from './file-tree';

const MIN_TREE_WIDTH = 150;
const MIN_PANE_WIDTH = 250;

export function FileExplorerPane({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const invalidateListings = useInvalidateDirectoryListings();
  const { rootPath, isLoading: isRootPathLoading } = useTaskRootPath(taskId);
  const { width: treeWidth, setWidth: setTreeWidth } =
    useFileExplorerTreeWidth();
  const { width: paneWidth, setWidth: setPaneWidth } =
    useFileExplorerPaneWidth();
  const { selectedFilePath, expandedDirs, selectFile, toggleDir } =
    useTaskFileExplorerState(taskId);

  const handleToggleDir = useCallback(
    (dirPath: string) => {
      toggleDir(dirPath);
    },
    [toggleDir],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      // Toggle: clicking the same file deselects it
      selectFile(filePath === selectedFilePath ? null : filePath);
    },
    [selectFile, selectedFilePath],
  );

  const hasSelectedFile = !!rootPath && selectedFilePath !== null;

  // Always use persisted pane width — resizable in both tree-only and split modes
  const effectiveWidth = Math.max(paneWidth, MIN_PANE_WIDTH);

  // Outer resize
  const { isDragging: isOuterDragging, handleMouseDown: handleOuterMouseDown } =
    useHorizontalResize({
      initialWidth: effectiveWidth,
      minWidth: MIN_PANE_WIDTH,
      direction: 'left',
      maxWidthFraction: 0.7,
      onWidthChange: setPaneWidth,
    });

  // File content resize
  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: treeWidth,
    minWidth: MIN_TREE_WIDTH,
    maxWidthFraction: 0.75,
    onWidthChange: setTreeWidth,
  });

  return (
    <div
      className={clsx(
        'relative flex h-full shrink-0 flex-col border-l border-neutral-700 bg-neutral-900',
        'max-w-[70vw]',
        (isDragging || isOuterDragging) && 'select-none',
      )}
      style={{ width: paneWidth }}
    >
      {/* Left-edge resize handle for the whole pane */}
      <div
        onMouseDown={handleOuterMouseDown}
        className="absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize hover:bg-blue-500/30"
      />

      {/* Header */}
      <div className="flex h-[40px] shrink-0 items-center justify-between gap-1 border-b border-neutral-700 px-3">
        <div className="flex shrink items-center gap-2 overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap text-neutral-300">
          <FolderTree className="h-4 w-4 shrink-0" />
          {selectedFilePath
            ? rootPath && selectedFilePath.startsWith(rootPath)
              ? selectedFilePath.slice(rootPath.length)
              : selectedFilePath
            : 'Files'}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => {
              if (!rootPath) {
                return;
              }
              invalidateListings(rootPath);
            }}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            title="Refresh"
            disabled={!rootPath}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        ref={containerRef}
        className={clsx('flex min-h-0 flex-1', isDragging && 'select-none')}
      >
        {/* Tree panel */}
        <div
          className="relative shrink-0 overflow-x-hidden overflow-y-auto"
          style={{
            width: hasSelectedFile ? treeWidth : '100%',
            maxWidth: hasSelectedFile ? '75%' : '100%',
          }}
        >
          {rootPath ? (
            <FileTree
              rootPath={rootPath}
              projectRoot={rootPath}
              selectedFilePath={selectedFilePath}
              onSelectFile={handleSelectFile}
              expandedDirs={expandedDirs}
              onToggleDir={handleToggleDir}
            />
          ) : (
            <div className="px-3 py-2 text-xs text-neutral-500">
              {isRootPathLoading ? 'Loading workspace...' : 'Workspace unavailable'}
            </div>
          )}
        </div>

        {!!rootPath && !!selectedFilePath && (
          <>
            {/* Resize handle between tree and content */}
            <div
              onMouseDown={handleMouseDown}
              className="h-full w-1 shrink-0 cursor-col-resize hover:bg-blue-500/30"
            />
            {/* File content panel */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-neutral-700">
              <FileContentViewer filePath={selectedFilePath} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
