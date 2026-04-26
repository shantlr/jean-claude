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
}: {
  rootPath: string;
  projectRoot: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
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

  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          depth={0}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
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
}: {
  entry: { name: string; path: string; isDirectory: boolean };
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const isSelected = entry.path === selectedFilePath;

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
}: {
  dirPath: string;
  projectRoot: string;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
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

  return (
    <>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          projectRoot={projectRoot}
          depth={depth}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      ))}
    </>
  );
}
