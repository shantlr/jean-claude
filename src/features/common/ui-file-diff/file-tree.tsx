import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  MessageCircle,
  PenLine,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import type { DiffFile, DiffFileStatus } from './types';
import { getStatusIndicator } from './status-badge';


interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  status?: DiffFileStatus;
  originalPath?: string;
  children?: TreeNode[];
}

function collectFolderPaths(nodes: TreeNode[], folders = new Set<string>()) {
  for (const node of nodes) {
    if (node.type === 'folder') {
      folders.add(node.path);
      if (node.children) collectFolderPaths(node.children, folders);
    }
  }
  return folders;
}

export function DiffFileTree({
  files,
  selectedPath,
  onSelectFile,
  filesWithAnnotations,
  commentCountByFile,
  commentStatusCountByFile,
  draftCountByFile,
  collapsedFolders: externalCollapsedFolders,
  onToggleFolder: externalOnToggleFolder,
}: {
  files: DiffFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  /** Set of file paths that have annotations */
  filesWithAnnotations?: Set<string>;
  /** Number of comments to show per file path */
  commentCountByFile?: Record<string, number>;
  /** Number of active/resolved comments to show per file path */
  commentStatusCountByFile?: Record<
    string,
    { active: number; resolved: number }
  >;
  /** Number of unsent draft comments per file path */
  draftCountByFile?: Record<string, number>;
  /** Externally-managed set of collapsed folder paths (for persistence). When provided, takes precedence over local state. */
  collapsedFolders?: Set<string>;
  /** Callback when a folder is toggled. Required when collapsedFolders is provided. */
  onToggleFolder?: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);

  // All folder paths in the current tree
  const allFolderPaths = useMemo(() => {
    return collectFolderPaths(tree);
  }, [tree]);

  // Local state fallback when no external state is provided
  const [localExpandedFolders, setLocalExpandedFolders] = useState<Set<string>>(
    () => new Set(allFolderPaths),
  );

  // Derive expandedFolders: if external collapsedFolders provided, compute expanded = allFolders - collapsed
  const expandedFolders = useMemo(() => {
    if (externalCollapsedFolders) {
      const expanded = new Set<string>();
      for (const folder of allFolderPaths) {
        if (!externalCollapsedFolders.has(folder)) {
          expanded.add(folder);
        }
      }
      return expanded;
    }
    return localExpandedFolders;
  }, [externalCollapsedFolders, allFolderPaths, localExpandedFolders]);

  const toggleFolder = useCallback(
    (path: string) => {
      if (externalOnToggleFolder) {
        externalOnToggleFolder(path);
      } else {
        setLocalExpandedFolders((prev) => {
          const next = new Set(prev);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return next;
        });
      }
    },
    [externalOnToggleFolder],
  );

  const hasAnnotation = useCallback(
    (path: string) => filesWithAnnotations?.has(path) ?? false,
    [filesWithAnnotations],
  );

  const getCommentCount = useCallback(
    (path: string) => commentCountByFile?.[path] ?? 0,
    [commentCountByFile],
  );

  const getCommentStatusCount = useCallback(
    (path: string) => commentStatusCountByFile?.[path],
    [commentStatusCountByFile],
  );

  const getDraftCount = useCallback(
    (path: string) => draftCountByFile?.[path] ?? 0,
    [draftCountByFile],
  );

  return (
    <div className="flex flex-col overflow-auto py-2">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          expandedFolders={expandedFolders}
          onSelectFile={onSelectFile}
          onToggleFolder={toggleFolder}
          hasAnnotation={hasAnnotation}
          getCommentCount={getCommentCount}
          getCommentStatusCount={getCommentStatusCount}
          getDraftCount={getDraftCount}
        />
      ))}
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  selectedPath,
  expandedFolders,
  onSelectFile,
  onToggleFolder,
  hasAnnotation,
  getCommentCount,
  getCommentStatusCount,
  getDraftCount,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedFolders: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  hasAnnotation: (path: string) => boolean;
  getCommentCount: (path: string) => number;
  getCommentStatusCount: (
    path: string,
  ) => { active: number; resolved: number } | undefined;
  getDraftCount: (path: string) => number;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = node.path === selectedPath;
  const paddingLeft = 8 + depth * 6;

  if (node.type === 'folder') {
    return (
      <>
        <button
          onClick={() => onToggleFolder(node.path)}
          aria-expanded={isExpanded}
          className="text-ink-2 hover:bg-glass-medium/50 flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm"
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <Folder className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded &&
          node.children?.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
              hasAnnotation={hasAnnotation}
              getCommentCount={getCommentCount}
              getCommentStatusCount={getCommentStatusCount}
              getDraftCount={getDraftCount}
            />
          ))}
      </>
    );
  }

  // File node
  const statusIndicator = getStatusIndicatorOrEmpty(node.status);
  const fileHasAnnotation = hasAnnotation(node.path);
  const commentStatusCount = getCommentStatusCount(node.path);
  const commentStatusTotal = commentStatusCount
    ? commentStatusCount.active + commentStatusCount.resolved
    : 0;
  const commentCount = getCommentCount(node.path);
  const draftCount = getDraftCount(node.path);

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm transition-colors ${
        isSelected
          ? 'text-ink-0 bg-glass-medium'
          : 'text-ink-1 hover:bg-glass-medium/50'
      }`}
      style={{ paddingLeft }}
    >
      <span className="w-3.5 shrink-0" aria-hidden />
      <File className="text-ink-3 h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{node.name}</span>
      {node.status === 'renamed' && node.originalPath && (
        <span className="text-ink-3 truncate text-xs">
          ← {getFileName(node.originalPath)}
        </span>
      )}
      {fileHasAnnotation && (
        <MessageCircle
          className="text-status-run/70 ml-1 h-3 w-3 shrink-0"
          aria-label="Has AI annotations"
        />
      )}
      {commentStatusCount && commentStatusTotal > 0 ? (
        <>
          <span
            className="bg-acc-soft text-acc-ink ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 font-mono text-[9.5px]"
            aria-label={`${commentStatusCount.active} active review comment${commentStatusCount.active !== 1 ? 's' : ''}`}
            title="Active comments"
          >
            {commentStatusCount.active > 0 && (
              <MessageCircle className="h-2.5 w-2.5" />
            )}
            {commentStatusCount.active}
          </span>
          <span
            className="text-ink-3 bg-glass-medium ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 font-mono text-[9.5px]"
            aria-label={`${commentStatusCount.resolved} resolved review comment${commentStatusCount.resolved !== 1 ? 's' : ''}`}
            title="Resolved comments"
          >
            {commentStatusCount.resolved > 0 && (
              <CheckCircle2 className="h-2.5 w-2.5" />
            )}
            {commentStatusCount.resolved}
          </span>
        </>
      ) : commentCount > 0 ? (
        <span
          className="bg-acc-soft text-acc-ink ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 font-mono text-[9.5px]"
          aria-label={`${commentCount} review comment${commentCount !== 1 ? 's' : ''}`}
        >
          <MessageCircle className="h-2.5 w-2.5" />
          {commentCount}
        </span>
      ) : null}
      {draftCount > 0 && (
        <span
          className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-yellow-900/40 px-1.5 font-mono text-[9.5px] text-yellow-300"
          aria-label={`${draftCount} draft comment${draftCount !== 1 ? 's' : ''}`}
        >
          <PenLine className="h-2.5 w-2.5" />
          {draftCount}
        </span>
      )}
      <span className={`ml-auto shrink-0 text-xs ${statusIndicator.color}`}>
        {statusIndicator.label}
      </span>
    </button>
  );
}

function getStatusIndicatorOrEmpty(status?: DiffFileStatus) {
  if (!status) return { label: '', color: '' };
  return getStatusIndicator(status);
}

function getFileName(path: string) {
  return path.split('/').pop() || path;
}

function buildTree(files: DiffFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  // Sort files for consistent ordering
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentLevel = root;
    let currentPath = '';

    // Create/find folders for all parent directories
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let folder = folderMap.get(currentPath);
      if (!folder) {
        folder = {
          name: part,
          path: currentPath,
          type: 'folder',
          children: [],
        };
        folderMap.set(currentPath, folder);
        currentLevel.push(folder);
      }
      currentLevel = folder.children!;
    }

    // Add the file
    const fileName = parts[parts.length - 1];
    currentLevel.push({
      name: fileName,
      path: file.path,
      type: 'file',
      status: file.status,
      originalPath: file.originalPath,
    });
  }

  sortTree(root);

  return root;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    if (node.children) sortTree(node.children);
  }
}
