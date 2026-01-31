// Shared file diff components

export { FileDiffContent } from './file-diff-content';
export { FileDiffHeader } from './file-diff-header';
export { DiffFileTree } from './file-tree';
export { DiffStatusBadge, getStatusIndicator } from './status-badge';
export {
  normalizeWorktreeStatus,
  normalizeAzureChangeType,
} from './types';
export type { DiffFile, DiffFileStatus, CommentThread } from './types';
