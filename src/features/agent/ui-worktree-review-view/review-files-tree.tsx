import { FolderOpen, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import type { DiffFileStatus } from '@/features/common/ui-file-diff/types';
import { FileTree } from '@/features/task/ui-task-panel/file-explorer-pane/file-tree';
import { IconButton } from '@/common/ui/icon-button';
import { useCommands } from '@/common/hooks/use-commands';
import { useProjectFilePaths } from '@/hooks/use-project-file-paths';


const MAX_SEARCH_RESULTS = 200;

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

function fuzzyPathScore(pathValue: string, queryToken: string): number | null {
  let queryIndex = 0;
  let score = 0;
  let consecutive = 0;

  for (
    let pathIndex = 0;
    pathIndex < pathValue.length && queryIndex < queryToken.length;
    pathIndex++
  ) {
    if (pathValue[pathIndex] !== queryToken[queryIndex]) {
      consecutive = 0;
      continue;
    }

    const isAtStart = pathIndex === 0;
    const isSegmentStart = pathIndex > 0 && pathValue[pathIndex - 1] === '/';
    const isWordBoundary =
      pathIndex > 0 && ['-', '_', '.'].includes(pathValue[pathIndex - 1]!);

    if (isAtStart) {
      score += 80;
    } else if (isSegmentStart) {
      score += 55;
    } else if (isWordBoundary) {
      score += 40;
    } else {
      score += 18;
    }

    score += consecutive * 12;
    consecutive += 1;
    queryIndex += 1;
  }

  if (queryIndex !== queryToken.length) return null;

  const basename = pathValue.slice(pathValue.lastIndexOf('/') + 1);
  let boost = 0;
  if (pathValue.startsWith(queryToken)) boost += 200;
  if (basename.startsWith(queryToken)) boost += 100;
  if (pathValue.includes(`/${queryToken}`)) boost += 60;
  if (pathValue.includes(queryToken)) boost += 30;

  return score + boost - Math.floor(pathValue.length / 4);
}

function getFuzzyPathMatches({
  filePaths,
  query,
  limit,
}: {
  filePaths: string[];
  query: string;
  limit: number;
}) {
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (queryTokens.length === 0) return [];

  return filePaths
    .map((filePath) => {
      const lowerPath = filePath.toLowerCase();
      let totalScore = 0;

      for (const token of queryTokens) {
        const tokenScore = fuzzyPathScore(lowerPath, token);
        if (tokenScore === null) return null;
        totalScore += tokenScore;
      }

      return { filePath, score: totalScore };
    })
    .filter((entry): entry is { filePath: string; score: number } => !!entry)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.filePath.length !== b.filePath.length) {
        return a.filePath.length - b.filePath.length;
      }
      return a.filePath.localeCompare(b.filePath);
    })
    .slice(0, limit)
    .map((entry) => entry.filePath);
}

function buildSearchFilterPaths({
  filePaths,
  query,
  rootPath,
  hideUnchanged,
  diffFiles,
}: {
  filePaths: string[];
  query: string;
  rootPath: string;
  hideUnchanged: boolean;
  diffFiles: Map<string, unknown>;
}): Set<string> | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const filterPaths = new Set<string>();
  const matches = getFuzzyPathMatches({
    filePaths,
    query: trimmed,
    limit: MAX_SEARCH_RESULTS,
  });

  for (const relativePath of matches) {
    const absolutePath = `${rootPath}/${relativePath}`;
    if (hideUnchanged && !diffFiles.has(absolutePath)) continue;

    filterPaths.add(absolutePath);

    let nextSlashIndex = absolutePath.indexOf('/', rootPath.length + 1);
    while (nextSlashIndex !== -1) {
      filterPaths.add(absolutePath.slice(0, nextSlashIndex));
      nextSlashIndex = absolutePath.indexOf('/', nextSlashIndex + 1);
    }
  }

  return filterPaths;
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
  draftCountsByFile,
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
  draftCountsByFile?: Map<string, number>;
  bottomPadding?: number;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearching = searchQuery.trim().length > 0;
  const { filePaths, isLoading: isSearchLoading } = useProjectFilePaths({
    projectRoot: rootPath,
    enabled: isSearching,
  });
  const searchFilterPaths = useMemo(
    () =>
      buildSearchFilterPaths({
        filePaths,
        query: searchQuery,
        rootPath,
        hideUnchanged,
        diffFiles,
      }),
    [filePaths, searchQuery, rootPath, hideUnchanged, diffFiles],
  );
  const changedAncestorDirs = getChangedFileAncestorDirs({
    rootPath,
    diffFiles,
  });
  const dirsToExpand = Array.from(changedAncestorDirs).filter(
    (dirPath) => !expandedDirs.has(dirPath),
  );

  useCommands('review-files-search', [
    {
      label: 'Focus File Search',
      shortcut: 'cmd+shift+f',
      section: 'Review',
      handler: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
    },
  ]);

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
      <div className="border-glass-border flex shrink-0 items-center gap-1.5 border-b px-2 py-1">
        <Search className="text-ink-4 h-3 w-3 shrink-0" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search files..."
          className="text-ink-1 placeholder:text-ink-4 min-w-0 flex-1 bg-transparent py-0.5 text-xs outline-none"
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-ink-4 hover:text-ink-1 rounded p-0.5"
            aria-label="Clear file search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={bottomPadding > 0 ? { paddingBottom: bottomPadding } : undefined}
      >
        {isSearching && isSearchLoading ? (
          <div className="text-ink-4 px-3 py-2 text-xs">Searching files...</div>
        ) : searchFilterPaths?.size === 0 ? (
          <div className="text-ink-4 px-3 py-2 text-xs">No matching files</div>
        ) : (
          <FileTree
            rootPath={rootPath}
            projectRoot={rootPath}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
            commentCountsByFile={commentCountsByFile}
            draftCountsByFile={draftCountsByFile}
            filterPaths={searchFilterPaths}
            diffFiles={diffFiles}
            hideUnchanged={!isSearching && hideUnchanged}
            searchQuery={searchQuery}
          />
        )}
      </div>
    </div>
  );
}
