import { File, FolderTree, RefreshCw, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';



import type {
  DiffFile,
  DiffFileStatus,
} from '@/features/common/ui-file-diff/types';
import { isImagePath, isSvgPath } from '@shared/image-types';
import {
  useFileExplorerPaneWidth,
  useFileExplorerTreeWidth,
  useTaskFileExplorerState,
} from '@/stores/navigation';
import {
  useWorktreeDiff,
  useWorktreeFileContent,
} from '@/hooks/use-worktree-diff';
import { api } from '@/lib/api';
import { FileDiffContent } from '@/features/common/ui-file-diff';
import { IconButton } from '@/common/ui/icon-button';
import { normalizeWorktreeStatus } from '@/features/common/ui-file-diff/types';
import { Separator } from '@/common/ui/separator';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useInvalidateDirectoryListings } from '@/hooks/use-directory-listing';
import { useTaskRootPath } from '@/hooks/use-task-root-path';



import { FileTree } from './file-tree';

const MIN_TREE_WIDTH = 150;
const MIN_PANE_WIDTH = 400;
const SVG_PREVIEW_WIDTH = 160;
const SVG_PREVIEW_MIN_WIDTH = 120;
const SVG_PREVIEW_MAX_WIDTH = 320;
const TRANSPARENCY_GRID_STYLE = {
  backgroundColor: '#f8fafc',
  backgroundImage:
    'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  backgroundSize: '16px 16px',
};

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
  const {
    selectedFilePath,
    expandedDirs,
    selectFile,
    toggleDir,
    hideUnchanged,
    toggleHideUnchanged,
  } = useTaskFileExplorerState(taskId);

  const { data: diffData } = useWorktreeDiff(taskId, true);

  const { diffFilesMap, summary } = useMemo(() => {
    const map = new Map<
      string,
      { status: DiffFileStatus; additions: number; deletions: number }
    >();
    let totalAdds = 0;
    let totalDels = 0;
    if (rootPath && diffData?.files) {
      for (const f of diffData.files) {
        const absPath = rootPath + '/' + f.path;
        map.set(absPath, {
          status: normalizeWorktreeStatus(f.status),
          additions: f.additions,
          deletions: f.deletions,
        });
        totalAdds += f.additions;
        totalDels += f.deletions;
      }
    }
    return {
      diffFilesMap: map,
      summary: { changed: map.size, adds: totalAdds, dels: totalDels },
    };
  }, [rootPath, diffData]);

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
        'panel-edge-shadow bg-bg-0 relative flex h-full shrink-0 flex-col',
        'max-w-[70vw]',
        (isDragging || isOuterDragging) && 'select-none',
      )}
      style={{ width: paneWidth }}
    >
      {/* Left-edge resize handle for the whole pane */}
      <div
        onMouseDown={handleOuterMouseDown}
        className="hover:bg-acc/30 absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize"
      />

      {/* Header */}
      <div className="flex h-[40px] shrink-0 items-center justify-between gap-1 px-3">
        <div className="text-ink-1 flex shrink items-center gap-2 overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap">
          <FolderTree className="h-4 w-4 shrink-0" />
          {selectedFilePath
            ? rootPath && selectedFilePath.startsWith(rootPath)
              ? selectedFilePath.slice(rootPath.length)
              : selectedFilePath
            : 'Files'}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            onClick={() => {
              if (!rootPath) {
                return;
              }
              invalidateListings(rootPath);
            }}
            size="sm"
            icon={<RefreshCw />}
            tooltip="Refresh"
            disabled={!rootPath}
          />
          <IconButton
            onClick={onClose}
            size="sm"
            icon={<X />}
            tooltip="Close"
          />
        </div>
      </div>
      <Separator />

      {/* Summary strip with filter toggle */}
      <div className="bg-bg-1 text-ink-3 flex shrink-0 items-center gap-2.5 border-b border-[var(--line-soft)] px-3 py-1.5 font-mono text-[11px]">
        <div
          className="flex items-center rounded border border-[var(--line)]"
          role="radiogroup"
          aria-label="File tree filter"
        >
          <button
            onClick={() => {
              if (hideUnchanged) toggleHideUnchanged();
            }}
            className={clsx(
              'rounded-l px-2 py-0.5 text-[10px] transition-colors',
              !hideUnchanged
                ? 'bg-bg-3 text-ink-0 font-medium'
                : 'text-ink-3 hover:text-ink-1',
            )}
            role="radio"
            aria-checked={!hideUnchanged}
          >
            All
          </button>
          <button
            onClick={() => {
              if (!hideUnchanged) toggleHideUnchanged();
            }}
            className={clsx(
              'rounded-r px-2 py-0.5 text-[10px] transition-colors',
              hideUnchanged
                ? 'bg-bg-3 text-ink-0 font-medium'
                : 'text-ink-3 hover:text-ink-1',
            )}
            role="radio"
            aria-checked={hideUnchanged}
          >
            Changed
          </button>
        </div>
        {summary.changed > 0 && (
          <>
            <span>
              <span className="text-ink-1">{summary.changed}</span> changed
            </span>
            <span className="text-green-400">+{summary.adds}</span>
            <span className="text-red-400">&minus;{summary.dels}</span>
          </>
        )}
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
              diffFiles={diffFilesMap}
              hideUnchanged={hideUnchanged}
            />
          ) : (
            <div className="text-ink-3 px-3 py-2 text-xs">
              {isRootPathLoading
                ? 'Loading workspace...'
                : 'Workspace unavailable'}
            </div>
          )}
        </div>

        {!!rootPath && !!selectedFilePath && (
          <>
            {/* Resize handle between tree and content */}
            <div
              onMouseDown={handleMouseDown}
              className="hover:bg-acc/30 h-full w-1 shrink-0 cursor-col-resize"
            />
            {/* File content panel */}
            <div className="panel-edge-shadow flex min-w-0 flex-1 flex-col overflow-hidden">
              <FileExplorerContentPane
                taskId={taskId}
                filePath={selectedFilePath}
                rootPath={rootPath}
                diffInfo={diffFilesMap.get(selectedFilePath)}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="bg-bg-1 text-ink-3 flex shrink-0 items-center gap-3.5 border-t border-[var(--line)] px-3.5 py-1 font-mono text-[10.5px]">
        <span>{summary.changed} changed</span>
        <span className="text-green-400">+{summary.adds}</span>
        <span className="text-red-400">&minus;{summary.dels}</span>
      </div>
    </div>
  );
}

function FileExplorerContentPane({
  taskId,
  filePath,
  rootPath,
  diffInfo,
}: {
  taskId: string;
  filePath: string;
  rootPath: string;
  diffInfo?: { status: DiffFileStatus; additions: number; deletions: number };
}) {
  const relativePath = filePath.startsWith(rootPath + '/')
    ? filePath.slice(rootPath.length + 1)
    : filePath;

  return (
    <div className="flex h-full flex-col">
      <ExplorerContentHeader
        relativePath={relativePath}
        status={diffInfo?.status}
        additions={diffInfo?.additions}
        deletions={diffInfo?.deletions}
      />
      {diffInfo ? (
        <ExplorerDiffViewer
          taskId={taskId}
          filePath={relativePath}
          status={diffInfo.status}
        />
      ) : (
        <ExplorerFileViewer filePath={filePath} />
      )}
    </div>
  );
}

function ExplorerContentHeader({
  relativePath,
  status,
  additions,
  deletions,
}: {
  relativePath: string;
  status?: DiffFileStatus;
  additions?: number;
  deletions?: number;
}) {
  return (
    <div
      className="bg-bg-1 flex shrink-0 items-center gap-2.5 border-b border-[var(--line)] px-3.5 py-2"
      style={{ minHeight: 40 }}
    >
      <File className="text-ink-3 h-3.5 w-3.5 shrink-0" />
      <span className="text-ink-1 truncate font-mono text-xs">
        {relativePath}
      </span>
      {status && (
        <span
          className={clsx(
            'shrink-0 rounded px-1 font-mono text-[9.5px] font-semibold',
            status === 'modified' && 'bg-orange-500/15 text-orange-400',
            status === 'added' && 'bg-green-500/15 text-green-400',
            status === 'deleted' && 'bg-red-500/15 text-red-400',
          )}
        >
          {status === 'modified' ? 'M' : status === 'added' ? 'A' : 'D'}
        </span>
      )}
      {(additions != null || deletions != null) && (
        <span className="flex gap-1 font-mono text-[10px]">
          {additions != null && additions > 0 ? (
            <span className="text-green-400">+{additions}</span>
          ) : null}
          {deletions != null && deletions > 0 ? (
            <span className="text-red-400">&minus;{deletions}</span>
          ) : null}
        </span>
      )}
    </div>
  );
}

function ExplorerDiffViewer({
  taskId,
  filePath,
  status,
}: {
  taskId: string;
  filePath: string;
  status: DiffFileStatus;
}) {
  const worktreeStatus: 'added' | 'modified' | 'deleted' =
    status === 'added'
      ? 'added'
      : status === 'deleted'
        ? 'deleted'
        : 'modified';
  const { data, isLoading } = useWorktreeFileContent(
    taskId,
    filePath,
    worktreeStatus,
  );

  const diffFile: DiffFile = { path: filePath, status };

  return (
    <FileDiffContent
      file={diffFile}
      oldContent={data?.oldContent ?? ''}
      newContent={data?.newContent ?? ''}
      isLoading={isLoading}
      isBinary={data?.isBinary}
      oldImageDataUrl={data?.oldImageDataUrl}
      newImageDataUrl={data?.newImageDataUrl}
    />
  );
}

function ExplorerFileViewer({ filePath }: { filePath: string }) {
  const isSvg = isSvgPath(filePath);
  const isImage = isImagePath(filePath) && !isSvg;

  const { data, isLoading } = useQuery({
    queryKey: ['file-content', filePath],
    queryFn: () => api.fs.readFile(filePath),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: !isImage,
  });

  const { data: imageDataUrl, isLoading: isImageLoading } = useQuery({
    queryKey: ['image-content', filePath],
    queryFn: () => api.fs.readImageAsDataUrl(filePath),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: isImage || isSvg,
  });

  if (isSvg) {
    if (isLoading || isImageLoading) {
      return (
        <div className="text-ink-3 flex flex-1 items-center justify-center text-sm">
          Loading...
        </div>
      );
    }

    if (!data) {
      return (
        <div className="text-ink-3 flex flex-1 items-center justify-center text-sm">
          Unable to read SVG
        </div>
      );
    }

    return <SvgSourcePreview content={data.content} dataUrl={imageDataUrl} />;
  }

  if (isImage) {
    if (isImageLoading) {
      return (
        <div className="text-ink-3 flex flex-1 items-center justify-center text-sm">
          Loading...
        </div>
      );
    }

    if (!imageDataUrl) {
      return (
        <div className="text-ink-3 flex flex-1 items-center justify-center text-sm">
          Unable to read image
        </div>
      );
    }

    return (
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div
          className="overflow-hidden rounded-md"
          style={TRANSPARENCY_GRID_STYLE}
        >
          <img
            src={imageDataUrl}
            alt={filePath.split('/').pop() ?? 'Image'}
            className="max-h-[70vh] max-w-full object-contain"
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-ink-3 flex flex-1 items-center justify-center text-sm">
        Loading...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-ink-3 flex flex-1 items-center justify-center text-sm">
        Unable to read file
      </div>
    );
  }

  return <CodeContent content={data.content} />;
}

function SvgSourcePreview({
  content,
  dataUrl,
}: {
  content: string;
  dataUrl?: string | null;
}) {
  const [previewWidth, setPreviewWidth] = useState(SVG_PREVIEW_WIDTH);
  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: previewWidth,
    minWidth: SVG_PREVIEW_MIN_WIDTH,
    maxWidth: SVG_PREVIEW_MAX_WIDTH,
    direction: 'left',
    onWidthChange: setPreviewWidth,
  });

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 bg-black/30 ${isDragging ? 'select-none' : ''}`}
    >
      <CodeContent content={content} />
      <div
        onMouseDown={handleMouseDown}
        className="hover:bg-acc/30 w-1 shrink-0 cursor-col-resize border-l border-[var(--line)]"
      />
      <div className="bg-bg-0/80 p-3" style={{ width: previewWidth }}>
        <div className="sticky top-3 flex flex-col gap-2">
          <div className="text-ink-3 font-mono text-[10px] tracking-wide uppercase">
            SVG Preview
          </div>
          <div
            className="border-line flex aspect-square items-center justify-center overflow-hidden rounded-md border p-3"
            style={TRANSPARENCY_GRID_STYLE}
          >
            {dataUrl ? (
              <img
                src={dataUrl}
                alt="SVG preview"
                className="max-h-full max-w-full"
              />
            ) : (
              <span className="text-ink-4 text-xs">No preview</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CodeContent({ content }: { content: string }) {
  return (
    <div className="min-w-0 flex-1 overflow-auto bg-black/30 font-mono text-xs">
      <pre className="p-3 leading-5">
        {content.split('\n').map((line, i) => (
          <div key={i} className="flex">
            <span className="text-ink-4 mr-4 inline-block w-8 shrink-0 text-right select-none">
              {i + 1}
            </span>
            <span className="text-ink-2">{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
