// Unified diff file type that normalizes between different sources
// (worktree diff, PR changes, etc.)

export type DiffFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'unchanged';

export interface DiffFile {
  path: string;
  status: DiffFileStatus;
  originalPath?: string; // For renames
  additions?: number;
  deletions?: number;
}

export interface CommentThread {
  id: number;
  line?: number;
  status?: string;
  comments: Array<{
    id?: number;
    author: string;
    content: string;
    publishedDate?: string;
    imageUrl?: string;
    uniqueName?: string;
  }>;
}

// Helpers to convert from source-specific types

export function normalizeWorktreeStatus(
  status: 'added' | 'modified' | 'deleted',
): DiffFileStatus {
  return status;
}

export function normalizeAzureChangeType(
  changeType: 'add' | 'edit' | 'delete' | 'rename',
): DiffFileStatus {
  switch (changeType) {
    case 'add':
      return 'added';
    case 'edit':
      return 'modified';
    case 'delete':
      return 'deleted';
    case 'rename':
      return 'renamed';
  }
}
