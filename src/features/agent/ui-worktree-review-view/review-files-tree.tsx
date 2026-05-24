import { FolderOpen } from 'lucide-react';

import { IconButton } from '@/common/ui/icon-button';
import type { DiffFileStatus } from '@/features/common/ui-file-diff/types';
import { FileTree } from '@/features/task/ui-task-panel/file-explorer-pane/file-tree';

function getChangedFileAncestorDirs({
  rootPath,
  diffFiles,
}: {
  rootPath: string;
  diffFiles: Map<
    string,
    { status: DiffFileStatus; additions: number; deletions: number }
  >;
}) {
  const dirs = new Set<string>();
  const rootPrefix = rootPath + '/';

  for (const filePath of diffFiles.keys()) {
    if (!filePath.startsWith(rootPrefix)) continue;

    const parts = filePath.slice(rootPrefix.length).split('/');
    parts.pop();

    let current = rootPath;
    for (const part of parts) {
      current += `/${part}`;
      dirs.add(current);
    }
  }

  return dirs;
}

export function ReviewFilesTree({
  rootPath,
  selectedFilePath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
  diffFiles,
  hideUnchanged,
  commentCountsByFile,
  bottomPadding = 0,
}: {
  rootPath: string;
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (dirPath: string) => void;
  diffFiles: Map<
    string,
    { status: DiffFileStatus; additions: number; deletions: number }
  >;
  hideUnchanged: boolean;
  commentCountsByFile?: Map<string, number>;
  bottomPadding?: number;
}) {
  const changedAncestorDirs = getChangedFileAncestorDirs({
    rootPath,
    diffFiles,
  });
  const dirsToExpand = Array.from(changedAncestorDirs).filter(
    (dirPath) => !expandedDirs.has(dirPath),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-glass-border flex shrink-0 items-center justify-between border-b px-2 py-1">
        <span className="text-ink-3 truncate text-[11px]">
          {diffFiles.size} changed
        </span>
        <IconButton
          onClick={() => {
            for (const dirPath of dirsToExpand) {
              onToggleDir(dirPath);
            }
          }}
          size="xs"
          icon={<FolderOpen />}
          tooltip="Expand folders containing changes"
          disabled={dirsToExpand.length === 0}
        />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
      >
        <FileTree
          rootPath={rootPath}
          projectRoot={rootPath}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          commentCountsByFile={commentCountsByFile}
          diffFiles={diffFiles}
          hideUnchanged={hideUnchanged}
        />
      </div>
    </div>
  );
}
