export type NotificationType =
  | 'pipeline-completed'
  | 'pipeline-failed'
  | 'release-completed'
  | 'release-failed';

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
