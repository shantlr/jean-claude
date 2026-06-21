import { FolderTree, Search, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';


import {
  useComposerFileCommentActions,
  useComposerFileCommentCount,
  useComposerFileCommentCountsByFile,
} from '@/stores/composer-file-comments';
import { FileTree } from '@/features/task/ui-task-panel/file-explorer-pane/file-tree';
import { useComposerFileExplorerState } from '@/stores/composer-file-explorer';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useProjectFilePaths } from '@/hooks/use-project-file-paths';



import { CommentableFileViewer } from './commentable-file-viewer';

const DEFAULT_TREE_WIDTH = 224;
const MIN_TREE_WIDTH = 150;

/** Simple fuzzy match — returns score or null if no match */
function fuzzyScore(path: string, query: string): number | null {
  const lowerPath = path.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let queryIndex = 0;
  let score = 0;
  let consecutive = 0;

  for (let i = 0; i < lowerPath.length && queryIndex < lowerQuery.length; i++) {
    if (lowerPath[i] === lowerQuery[queryIndex]) {
      const isSegmentStart = i === 0 || lowerPath[i - 1] === '/';
      const isBoundary = i > 0 && ['-', '_', '.'].includes(lowerPath[i - 1]);
      score += isSegmentStart ? 55 : isBoundary ? 40 : 18;
      score += consecutive * 12;
      consecutive++;
      queryIndex++;
    } else {
      consecutive = 0;
    }
  }

  return queryIndex === lowerQuery.length ? score : null;
}

/** Build set of matching file paths + all their ancestor dirs */
function buildFilterSet(
  filePaths: string[],
  query: string,
  projectRoot: string,
): Set<string> | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const matches = filePaths
    .map((fp) => ({ path: fp, score: fuzzyScore(fp, trimmed) }))
    .filter(
      (entry): entry is { path: string; score: number } =>
        entry.score !== null && entry.score >= 30,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);

  if (matches.length === 0) return new Set();

  const result = new Set<string>();
  for (const { path: relPath } of matches) {
    const absPath = `${projectRoot}/${relPath}`;
    result.add(absPath);
    // Add all ancestor directories
    const parts = absPath.split('/');
    for (let i = 1; i < parts.length; i++) {
      result.add(parts.slice(0, i + 1).join('/'));
    }
  }
  return result;
}

export function ComposerFileExplorer({
  projectId,
  projectRoot,
}: {
  projectId: string;
  projectRoot: string;
}) {
  const { selectedFilePath, expandedDirs, selectFile, toggleDir } =
    useComposerFileExplorerState(projectId);
  const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
  const [searchQuery, setSearchQuery] = useState('');

  const commentCount = useComposerFileCommentCount(projectId);
  const commentCountsByFile = useComposerFileCommentCountsByFile(projectId);
  const { clearComments } = useComposerFileCommentActions(projectId);

  const { filePaths } = useProjectFilePaths({ projectRoot });

  // Convert stored string[] to Set for FileTree
  const expandedDirsSet = useMemo(() => new Set(expandedDirs), [expandedDirs]);

  // Filter set for tree — null means show all
  const filterPaths = useMemo(
    () => buildFilterSet(filePaths, searchQuery, projectRoot),
    [filePaths, searchQuery, projectRoot],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      selectFile(filePath === selectedFilePath ? null : filePath);
    },
    [selectedFilePath, selectFile],
  );

  const hasSelectedFile = selectedFilePath !== null;

  const { containerRef, isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: treeWidth,
    minWidth: MIN_TREE_WIDTH,
    maxWidthFraction: 0.75,
    onWidthChange: setTreeWidth,
  });

  const relativePath =
    selectedFilePath && selectedFilePath.startsWith(projectRoot)
      ? selectedFilePath.slice(projectRoot.length).replace(/^\//, '')
      : selectedFilePath;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-[36px] shrink-0 items-center gap-2 px-3">
        <FolderTree className="text-ink-2 h-3.5 w-3.5 shrink-0" />
        <span className="text-ink-1 overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap">
          {relativePath ?? 'Files'}
        </span>
        {commentCount > 0 && (
          <span className="bg-acc/20 text-acc-ink rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium">
            {commentCount}
          </span>
        )}
        {commentCount > 0 && (
          <button
            type="button"
            onClick={clearComments}
            className="text-ink-3 ml-auto shrink-0 rounded p-0.5 hover:text-red-400"
            aria-label="Clear all comments"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Content area */}
      <div
        ref={containerRef}
        className={clsx('flex min-h-0 flex-1', isDragging && 'select-none')}
      >
        {/* Tree panel */}
        <div
          className="relative flex shrink-0 flex-col overflow-hidden"
          style={{
            width: hasSelectedFile ? treeWidth : '100%',
            maxWidth: hasSelectedFile ? '75%' : '100%',
          }}
        >
          {/* Search input */}
          <div className="flex shrink-0 items-center gap-1.5 px-2 pb-1">
            <Search className="text-ink-4 h-3 w-3 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter files..."
              className="text-ink-1 placeholder:text-ink-4 w-full bg-transparent py-0.5 text-xs outline-none"
            />
          </div>
          {/* Tree */}
          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            {filterPaths?.size === 0 ? (
              <div className="text-ink-4 px-3 py-2 text-xs">No matches</div>
            ) : (
              <FileTree
                rootPath={projectRoot}
                projectRoot={projectRoot}
                selectedFilePath={selectedFilePath}
                onSelectFile={handleSelectFile}
                expandedDirs={expandedDirsSet}
                onToggleDir={toggleDir}
                commentCountsByFile={commentCountsByFile}
                filterPaths={filterPaths}
              />
            )}
          </div>
        </div>

        {hasSelectedFile && (
          <>
            {/* Resize handle between tree and content */}
            <div
              onMouseDown={handleMouseDown}
              className="hover:bg-acc/30 h-full w-1 shrink-0 cursor-col-resize"
            />
            {/* File content panel */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <CommentableFileViewer
                filePath={selectedFilePath}
                projectId={projectId}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
