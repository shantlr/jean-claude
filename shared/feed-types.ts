export type FeedItemSource = 'task' | 'pull-request' | 'note';

export type FeedItemAttention =
  | 'needs-permission'
  | 'has-question'
  | 'errored'
  | 'completed'
  | 'interrupted'
  | 'running'
  | 'review-requested'
  | 'pr-comments'
  | 'waiting'
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
  isDraft?: boolean;
  taskId?: string;
  pullRequestId?: number;
  pullRequestUrl?: string;
  noteId?: string;
  isCompleted?: boolean;
}

export interface FeedNote {
  id: string;
  content: string;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
