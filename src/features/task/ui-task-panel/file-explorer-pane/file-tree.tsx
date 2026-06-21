import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  PenLine,
} from 'lucide-react';
import clsx from 'clsx';


import type { DiffFileStatus } from '@/features/common/ui-file-diff/types';
import { useDirectoryListing } from '@/hooks/use-directory-listing';

type DiffInfo = {
  status: DiffFileStatus;
  additions: number;
  deletions: number;
};

function countChangedDescendants(
  dirPath: string,
  diffFiles: Map<string, DiffInfo>,
): number {
  let count = 0;
  const prefix = dirPath + '/';
  for (const path of diffFiles.keys()) {
    if (path.startsWith(prefix)) count++;
  }
  return count;
}

export function FileTree({
  rootPath,
  projectRoot,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
  commentCountsByFile,
  draftCountsByFile,
  filterPaths,
  diffFiles,
  hideUnchanged,
  searchQuery,
}: {
  rootPath: string;
  projectRoot: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  /** Optional: comment counts per file path (for badge display) */
  commentCountsByFile?: Map<string, number>;
  /** Optional: draft counts per file path (for badge display) */
  draftCountsByFile?: Map<string, number>;
  /** Optional: when set, only show entries whose path is in this set */
  filterPaths?: Set<string> | null;
  /** Map of ABSOLUTE path -> diff info for changed files */
  diffFiles?: Map<string, DiffInfo>;
  /** When true, only show files that have changes (and their ancestor dirs) */
  hideUnchanged?: boolean;
  /** Optional: highlights matching characters in file and folder names */
  searchQuery?: string;
}) {
  const { entries, isLoading } = useDirectoryListing({
    dirPath: rootPath,
    projectRoot,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="text-ink-2 h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return <div className="text-ink-3 px-3 py-2 text-xs">Empty directory</div>;
  }

  let filtered = filterPaths
    ? entries.filter((e) => filterPaths.has(e.path))
    : entries;

  if (hideUnchanged && diffFiles && diffFiles.size > 0) {
    filtered = filtered.filter((e) => {
      if (e.isDirectory) {
        return countChangedDescendants(e.path, diffFiles) > 0;
      }
      return diffFiles.has(e.path);
    });
  }

  return (
    <div className="flex flex-col pb-8">
      {filtered.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          depth={0}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          commentCountsByFile={commentCountsByFile}
          draftCountsByFile={draftCountsByFile}
          filterPaths={filterPaths}
          diffFiles={diffFiles}
          hideUnchanged={hideUnchanged}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}

function getHighlightedCharacterIndexes(text: string, searchQuery?: string) {
  const tokens = searchQuery
    ?.toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (!tokens?.length) return new Set<number>();

  const lowerText = text.toLowerCase();
  const indexes = new Set<number>();

  for (const token of tokens) {
    let textIndex = 0;

    for (const character of token) {
      const matchIndex = lowerText.indexOf(character, textIndex);
      if (matchIndex === -1) break;
      indexes.add(matchIndex);
      textIndex = matchIndex + 1;
    }
  }

  return indexes;
}

function HighlightedTreeName({
  name,
  searchQuery,
}: {
  name: string;
  searchQuery?: string;
}) {
  const highlightedIndexes = getHighlightedCharacterIndexes(name, searchQuery);
  if (highlightedIndexes.size === 0) return name;

  return [...name].map((character, index) =>
    highlightedIndexes.has(index) ? (
      <span key={index} className="bg-acc/60 text-white">
        {character}
      </span>
    ) : (
      character
    ),
  );
}

function FileTreeNode({
  entry,
  projectRoot,
  depth,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
  commentCountsByFile,
  draftCountsByFile,
  filterPaths,
  diffFiles,
  hideUnchanged,
  searchQuery,
}: {
  entry: { name: string; path: string; isDirectory: boolean };
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  commentCountsByFile?: Map<string, number>;
  draftCountsByFile?: Map<string, number>;
  filterPaths?: Set<string> | null;
  diffFiles?: Map<string, DiffInfo>;
  hideUnchanged?: boolean;
  searchQuery?: string;
}) {
  // When filtering, force directories open so matches are visible
  const isExpanded = filterPaths ? true : expandedDirs.has(entry.path);
  const isSelected = entry.path === selectedFilePath;
  const commentCount = commentCountsByFile?.get(entry.path) ?? 0;
  const draftCount = draftCountsByFile?.get(entry.path) ?? 0;

  const fileDiffInfo = diffFiles?.get(entry.path);
  const changedDescendantCount =
    entry.isDirectory && diffFiles
      ? countChangedDescendants(entry.path, diffFiles)
      : 0;
  const hasChangedDescendants = changedDescendantCount > 0;

  // For collapsed directories, check if any descendant file has comments
  const hasDescendantComments =
    !isExpanded &&
    entry.isDirectory &&
    commentCountsByFile &&
    commentCountsByFile.size > 0 &&
    (() => {
      const prefix = entry.path + '/';
      for (const key of commentCountsByFile.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    })();
  const hasDescendantDrafts =
    !isExpanded &&
    entry.isDirectory &&
    draftCountsByFile &&
    draftCountsByFile.size > 0 &&
    (() => {
      const prefix = entry.path + '/';
      for (const key of draftCountsByFile.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    })();

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={() => onToggleDir(entry.path)}
          aria-expanded={isExpanded}
          className="text-ink-2 hover:bg-glass-medium/50 flex w-full items-center gap-1 py-0.5 text-left text-sm"
          style={{ paddingLeft: 8 + depth * 8 }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0" />
          )}
          <span
            className={clsx('truncate', hasChangedDescendants && 'font-medium')}
          >
            <HighlightedTreeName name={entry.name} searchQuery={searchQuery} />
          </span>
          {!isExpanded && hasChangedDescendants && (
            <span className="mr-2 ml-auto shrink-0 rounded-full bg-orange-500/15 px-1.5 py-px font-mono text-[9px] leading-none font-medium text-orange-400">
              {changedDescendantCount}
            </span>
          )}
          {(hasDescendantComments || hasDescendantDrafts) &&
            !(!isExpanded && hasChangedDescendants) && (
              <span
                className="bg-acc mr-2 ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                aria-label="Contains comments or drafts"
              />
            )}
        </button>
        {isExpanded && (
          <DirectoryChildren
            dirPath={entry.path}
            projectRoot={projectRoot}
            depth={depth + 1}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
            commentCountsByFile={commentCountsByFile}
            draftCountsByFile={draftCountsByFile}
            filterPaths={filterPaths}
            diffFiles={diffFiles}
            hideUnchanged={hideUnchanged}
            searchQuery={searchQuery}
          />
        )}
      </div>
    );
  }

  const isDeleted = fileDiffInfo?.status === 'deleted';

  return (
    <button
      onClick={() => onSelectFile(entry.path)}
      className={clsx(
        'flex w-full items-center gap-1 border-l-2 py-0.5 text-left text-sm',
        isSelected
          ? 'text-ink-0 bg-glass-medium'
          : 'text-ink-1 hover:bg-glass-medium/50',
        fileDiffInfo?.status === 'modified' && 'border-l-orange-400',
        fileDiffInfo?.status === 'added' && 'border-l-green-400',
        fileDiffInfo?.status === 'deleted' && 'border-l-red-400',
        !fileDiffInfo && 'border-l-transparent',
      )}
      style={{ paddingLeft: 6 + depth * 8 + 10 }}
    >
      <File className="text-ink-3 h-3.5 w-3.5 shrink-0" />
      <span className={clsx('truncate', isDeleted && 'line-through')}>
        <HighlightedTreeName name={entry.name} searchQuery={searchQuery} />
      </span>
      <span className="mr-2 ml-auto flex shrink-0 items-center gap-1">
        {fileDiffInfo && (
          <span
            className={clsx(
              'shrink-0 text-xs',
              fileDiffInfo.status === 'modified' && 'text-orange-400',
              fileDiffInfo.status === 'added' && 'text-green-400',
              fileDiffInfo.status === 'deleted' && 'text-red-400',
            )}
          >
            {fileDiffInfo.status === 'modified'
              ? 'M'
              : fileDiffInfo.status === 'added'
                ? 'A'
                : 'D'}
          </span>
        )}
        {commentCount > 0 && (
          <span className="bg-acc/20 text-acc-ink shrink-0 rounded-full px-1.5 py-px text-[9px] leading-none font-medium">
            {commentCount}
          </span>
        )}
        {draftCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-yellow-900/40 px-1.5 py-px font-mono text-[9px] leading-none font-medium text-yellow-300">
            <PenLine className="h-2.5 w-2.5" />
            {draftCount}
          </span>
        )}
      </span>
    </button>
  );
}

function DirectoryChildren({
  dirPath,
  projectRoot,
  depth,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
  commentCountsByFile,
  draftCountsByFile,
  filterPaths,
  diffFiles,
  hideUnchanged,
  searchQuery,
}: {
  dirPath: string;
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  commentCountsByFile?: Map<string, number>;
  draftCountsByFile?: Map<string, number>;
  filterPaths?: Set<string> | null;
  diffFiles?: Map<string, DiffInfo>;
  hideUnchanged?: boolean;
  searchQuery?: string;
}) {
  const { entries, isLoading } = useDirectoryListing({
    dirPath,
    projectRoot,
  });

  if (isLoading) {
    return (
      <div
        className="text-ink-3 flex items-center gap-1 py-0.5 text-xs"
        style={{ paddingLeft: 8 + depth * 8 }}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div
        className="text-ink-4 py-0.5 text-xs italic"
        style={{ paddingLeft: 8 + depth * 8 + 10 }}
      >
        Empty
      </div>
    );
  }

  let filtered = filterPaths
    ? entries.filter((e) => filterPaths.has(e.path))
    : entries;

  if (hideUnchanged && diffFiles && diffFiles.size > 0) {
    filtered = filtered.filter((e) => {
      if (e.isDirectory) {
        return countChangedDescendants(e.path, diffFiles) > 0;
      }
      return diffFiles.has(e.path);
    });
  }

  return (
    <>
      {filtered.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          depth={depth}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          commentCountsByFile={commentCountsByFile}
          draftCountsByFile={draftCountsByFile}
          filterPaths={filterPaths}
          diffFiles={diffFiles}
          hideUnchanged={hideUnchanged}
          searchQuery={searchQuery}
        />
      ))}
    </>
  );
}
