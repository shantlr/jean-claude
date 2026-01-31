import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react';
import { useState, useMemo } from 'react';

import type { WorktreeDiffFile } from '@/lib/api';

interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  status?: 'added' | 'modified' | 'deleted';
  children?: TreeNode[];
}

export function DiffFileTree({
  files,
  selectedPath,
  onSelectFile,
}: {
  files: WorktreeDiffFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Start with all folders expanded
    const folders = new Set<string>();
    const collectFolders = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          folders.add(node.path);
          if (node.children) collectFolders(node.children);
        }
      }
    };
    collectFolders(tree);
    return folders;
  });

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

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
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedFolders: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = node.path === selectedPath;
  const paddingLeft = 8 + depth * 16;

  if (node.type === 'folder') {
    return (
      <>
        <button
          onClick={() => onToggleFolder(node.path)}
          className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm text-neutral-400 hover:bg-neutral-700/50"
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <Folder className="h-4 w-4 shrink-0 text-neutral-500" />
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
            />
          ))}
      </>
    );
  }

  // File node
  const statusIndicator = getStatusIndicator(node.status);

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm transition-colors ${
        isSelected
          ? 'bg-neutral-700 text-neutral-100'
          : 'text-neutral-300 hover:bg-neutral-700/50'
      }`}
      style={{ paddingLeft }}
    >
      <span className="w-3.5 shrink-0" />
      <File className="h-4 w-4 shrink-0 text-neutral-500" />
      <span className="truncate">{node.name}</span>
      <span className={`ml-auto shrink-0 text-xs ${statusIndicator.color}`}>
        {statusIndicator.label}
      </span>
    </button>
  );
}

function getStatusIndicator(status?: 'added' | 'modified' | 'deleted') {
  switch (status) {
    case 'added':
      return { label: '+', color: 'text-green-400' };
    case 'deleted':
      return { label: '-', color: 'text-red-400' };
    case 'modified':
      return { label: 'M', color: 'text-orange-400' };
    default:
      return { label: '', color: '' };
  }
}

function buildTree(files: WorktreeDiffFile[]): TreeNode[] {
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
        // Sort after adding to maintain order
        currentLevel.sort((a, b) => {
          // Folders first, then files
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
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
    });

    // Sort the current level
    currentLevel.sort((a, b) => {
      // Folders first, then files
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  return root;
}
