export type NotificationType =
  | 'pipeline-completed'
  | 'pipeline-failed'
  | 'pipeline-cancelled'
  | 'calendar-event-starting'
  | 'release-completed'
  | 'release-failed'
  | 'release-cancelled';

export interface AppNotification {
  id: string;
  projectId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  sourceUrl: string | null;
  read: boolean;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskNotificationTarget {
  taskId: string;
  projectId: string;
}
