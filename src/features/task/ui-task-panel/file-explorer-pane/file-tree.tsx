import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
} from 'lucide-react';

import { Button } from '@/common/ui/button';
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
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-neutral-500">Empty directory</div>
    );
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
        <Button
          onClick={() => onToggleDir(entry.path)}
          className={clsx(
            'flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-neutral-700/50',
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          )}
          <span className="truncate text-neutral-300">{entry.name}</span>
        </Button>
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
    <Button
      onClick={() => onSelectFile(entry.path)}
      className={clsx(
        'flex w-full items-center gap-1 py-0.5 text-left text-sm',
        isSelected
          ? 'bg-neutral-700 text-neutral-100'
          : 'text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300',
      )}
      style={{ paddingLeft: 8 + depth * 16 + 14 }}
    >
      <File className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
      <span className="truncate">{entry.name}</span>
    </Button>
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
        className="flex items-center gap-1 py-0.5 text-xs text-neutral-500"
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
        className="py-0.5 text-xs text-neutral-600 italic"
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
