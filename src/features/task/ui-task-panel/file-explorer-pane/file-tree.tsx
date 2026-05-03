import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
} from 'lucide-react';

import { useDirectoryListing } from '@/hooks/use-directory-listing';

export function FileTree({
  rootPath,
  projectRoot,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
  commentCountsByFile,
  filterPaths,
}: {
  rootPath: string;
  projectRoot: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  /** Optional: comment counts per file path (for badge display) */
  commentCountsByFile?: Map<string, number>;
  /** Optional: when set, only show entries whose path is in this set */
  filterPaths?: Set<string> | null;
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

  const filtered = filterPaths
    ? entries.filter((e) => filterPaths.has(e.path))
    : entries;

  return (
    <div className="flex flex-col">
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
          filterPaths={filterPaths}
        />
      ))}
    </div>
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
  filterPaths,
}: {
  entry: { name: string; path: string; isDirectory: boolean };
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  commentCountsByFile?: Map<string, number>;
  filterPaths?: Set<string> | null;
}) {
  // When filtering, force directories open so matches are visible
  const isExpanded = filterPaths ? true : expandedDirs.has(entry.path);
  const isSelected = entry.path === selectedFilePath;
  const commentCount = commentCountsByFile?.get(entry.path) ?? 0;

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

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={() => onToggleDir(entry.path)}
          className="text-ink-2 hover:bg-glass-medium/50 flex w-full items-center gap-1 py-0.5 text-left text-sm"
          style={{ paddingLeft: 8 + depth * 16 }}
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
          <span className="text-ink-1 truncate">{entry.name}</span>
          {hasDescendantComments && (
            <span
              className="bg-acc mr-2 ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
              aria-label="Contains commented files"
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
            filterPaths={filterPaths}
          />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(entry.path)}
      className={clsx(
        'flex w-full items-center gap-1 py-0.5 text-left text-sm',
        isSelected
          ? 'text-ink-0 bg-glass-medium'
          : 'text-ink-2 hover:bg-glass-medium/50 hover:text-ink-1',
      )}
      style={{ paddingLeft: 8 + depth * 16 + 14 }}
    >
      <File className="text-ink-3 h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{entry.name}</span>
      {commentCount > 0 && (
        <span className="bg-acc/20 text-acc-ink mr-2 ml-auto shrink-0 rounded-full px-1.5 py-px text-[9px] leading-none font-medium">
          {commentCount}
        </span>
      )}
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
  filterPaths,
}: {
  dirPath: string;
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  commentCountsByFile?: Map<string, number>;
  filterPaths?: Set<string> | null;
}) {
  const { entries, isLoading } = useDirectoryListing({
    dirPath,
    projectRoot,
  });

  if (isLoading) {
    return (
      <div
        className="text-ink-3 flex items-center gap-1 py-0.5 text-xs"
        style={{ paddingLeft: 8 + depth * 16 }}
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
        style={{ paddingLeft: 8 + depth * 16 + 14 }}
      >
        Empty
      </div>
    );
  }

  const filtered = filterPaths
    ? entries.filter((e) => filterPaths.has(e.path))
    : entries;

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
          filterPaths={filterPaths}
        />
      ))}
    </>
  );
}
