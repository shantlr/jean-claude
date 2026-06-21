export type WorkActivityEventType =
  | 'task_prompted'
  | 'pr_comment_added'
  | 'pr_approved';

export type WorkActivityWorkItem = {
  id: string;
  providerId: string;
  azureOrgId: string | null;
  azureProjectId: string;
};

export type WorkActivityPullRequest = {
  providerId: string;
  azureOrgId: string | null;
  azureProjectId: string;
  repoId: string;
  pullRequestId: string;
  title: string | null;
  url: string | null;
};

export type WorkActivityEvent = {
  id: string;
  occurredAt: string;
  type: WorkActivityEventType;
  projectId: string | null;
  projectName: string | null;
  providerId: string | null;
  azureOrgId: string | null;
  azureProjectId: string | null;
  repoId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  stepId: string | null;
  promptSnippet: string | null;
  promptLength: number | null;
  workItemIds: string[];
  workItems: WorkActivityWorkItem[];
  pullRequest: WorkActivityPullRequest | null;
  metadata: Record<string, unknown>;
};

export type NewWorkActivityEvent = Omit<WorkActivityEvent, 'id'> & {
  id?: string;
};

export type WorkActivitySettings = { enabled: boolean };

export type WorkActivityWeekParams = {
  start: string;
  end: string;
  projectId?: string;
  type?: WorkActivityEventType;
};
