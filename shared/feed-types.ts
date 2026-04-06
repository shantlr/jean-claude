export type FeedItemSource = 'task' | 'pull-request' | 'note' | 'work-item';

export type FeedItemAttention =
  | 'needs-permission'
  | 'has-question'
  | 'errored'
  | 'completed'
  | 'interrupted'
  | 'running'
  | 'review-requested'
  | 'pr-comments'
  | 'pr-approved-by-me'
  | 'waiting'
  | 'assigned-work-item'
  | 'note';

export type ProjectPriority = 'high' | 'normal' | 'low';

export interface FeedItem {
  id: string;
  source: FeedItemSource;
  attention: FeedItemAttention;
  timestamp: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  projectPriority: ProjectPriority;
  title: string;
  subtitle?: string;
  ownerName?: string;
  isOwnedByCurrentUser?: boolean;
  hasUnread?: boolean;
  isDraft?: boolean;
  taskId?: string;
  taskType?: string; // TaskType — present when source === 'task'
  pendingMessage?: string;
  pullRequestId?: number;
  pullRequestUrl?: string;
  noteId?: string;
  isCompleted?: boolean;

  // Work item tracking
  workItemId?: number;
  workItemIds?: string[];
  workItemUrl?: string;
  workItemType?: string;
  workItemState?: string;
  workItemPrStatus?: 'active' | 'completed' | 'abandoned';
  workItemPrUrl?: string;

  // PR activity tracking (only present when source === 'pull-request')
  hasNewActivity?: boolean;
  activeThreadCount?: number;
  approvedBy?: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  }>;
  isApprovedByMe?: boolean;
}

export interface FeedNote {
  id: string;
  content: string;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
