import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
} from './azure-devops-types';
import type { Project, Task, TaskStep } from './types';

export type CacheSubscription = {
  resourceKey: string;
  includeChildren?: boolean;
};

export type CacheSubscriptionUpdate = {
  revision: number;
  subscriptions: CacheSubscription[];
};

export type CacheEvent =
  | { type: 'project.upsert'; project: Project }
  | {
      type: 'project.patch';
      projectId: string;
      patch: Partial<Project>;
    }
  | {
      type: 'project.delete';
      projectId: string;
      taskIds?: string[];
      stepIds?: string[];
    }
  | { type: 'task.upsert'; task: Task; previousProjectId?: string }
  | {
      type: 'task.patch';
      taskId: string;
      projectId: string;
      patch: Partial<Task>;
    }
  | {
      type: 'task.delete';
      taskId: string;
      projectId: string;
      stepIds?: string[];
    }
  | { type: 'step.upsert'; step: TaskStep; previousTaskId?: string }
  | {
      type: 'step.patch';
      stepId: string;
      taskId: string;
      patch: Partial<TaskStep>;
    }
  | { type: 'step.delete'; stepId: string; taskId: string }
  | {
      type: 'pullRequest.upsert';
      providerId: string;
      repoId: string;
      projectId?: string;
      pullRequest: AzureDevOpsPullRequest | AzureDevOpsPullRequestDetails;
      invalidateFeed?: boolean;
    }
  | {
      type: 'pullRequest.patch';
      providerId: string;
      repoId: string;
      projectId?: string;
      pullRequestId: number;
      patch: Partial<AzureDevOpsPullRequestDetails>;
    }
  | {
      type: 'pullRequest.threadsChanged';
      providerId: string;
      repoId: string;
      pullRequestId: number;
    }
  | {
      type: 'feed.sourceChanged';
      source: 'tasks' | 'pullRequests' | 'notes' | 'workItems';
    }
  | {
      type: 'resource.invalidate';
      resourceKey: string;
      reason: string;
    };

const PULL_REQUEST_STATUSES = [
  'active',
  'completed',
  'abandoned',
  'all',
] as const;

function getPullRequestListResourceKeys({
  providerId,
  repoId,
  projectId,
}: {
  providerId: string;
  repoId: string;
  projectId?: string;
}) {
  const resourceKeys = [
    'pullRequests',
    `pullRequests:repo:${providerId}:${repoId}`,
  ];

  for (const status of PULL_REQUEST_STATUSES) {
    resourceKeys.push(
      `pullRequests:repo:${providerId}:${repoId}:status:${status}`,
    );
  }

  if (projectId) {
    resourceKeys.push(`pullRequests:project:${projectId}`);
    for (const status of PULL_REQUEST_STATUSES) {
      resourceKeys.push(`pullRequests:project:${projectId}:status:${status}`);
    }
  }

  return resourceKeys;
}

export function getCacheEventResourceKeys(event: CacheEvent): string[] {
  switch (event.type) {
    case 'project.upsert':
      return ['projects', `project:${event.project.id}`];
    case 'project.patch':
      return ['projects', `project:${event.projectId}`];
    case 'project.delete':
      return [
        'projects',
        `project:${event.projectId}`,
        'tasks',
        'tasks:active',
        `tasks:project:${event.projectId}`,
        'steps',
        'feed:tasks',
        ...(event.taskIds ?? []).map((taskId) => `task:${taskId}`),
        ...(event.taskIds ?? []).map((taskId) => `steps:task:${taskId}`),
        ...(event.stepIds ?? []).map((stepId) => `step:${stepId}`),
      ];
    case 'task.upsert': {
      const resourceKeys = [
        'tasks',
        'tasks:active',
        `task:${event.task.id}`,
        'feed:tasks',
      ];
      if (event.previousProjectId) {
        resourceKeys.push(`tasks:project:${event.previousProjectId}`);
      }
      if (
        event.task.projectId &&
        event.task.projectId !== event.previousProjectId
      ) {
        resourceKeys.push(`tasks:project:${event.task.projectId}`);
      }
      return resourceKeys;
    }
    case 'task.patch': {
      const resourceKeys = [
        'tasks',
        'tasks:active',
        `task:${event.taskId}`,
        'feed:tasks',
      ];
      if (event.projectId) {
        resourceKeys.push(`tasks:project:${event.projectId}`);
      }
      const patchProjectId = event.patch?.projectId;
      if (patchProjectId && patchProjectId !== event.projectId) {
        resourceKeys.push(`tasks:project:${patchProjectId}`);
      }
      return resourceKeys;
    }
    case 'task.delete':
      return [
        'tasks',
        'tasks:active',
        `task:${event.taskId}`,
        `tasks:project:${event.projectId}`,
        'feed:tasks',
        'steps',
        `steps:task:${event.taskId}`,
        ...(event.stepIds ?? []).map((stepId) => `step:${stepId}`),
      ];
    case 'step.upsert': {
      const resourceKeys = ['steps', `step:${event.step.id}`, 'feed:tasks'];
      if (event.previousTaskId) {
        resourceKeys.push(`steps:task:${event.previousTaskId}`);
      }
      if (event.step.taskId && event.step.taskId !== event.previousTaskId) {
        resourceKeys.push(`steps:task:${event.step.taskId}`);
      }
      return resourceKeys;
    }
    case 'step.patch': {
      const resourceKeys = ['steps', `step:${event.stepId}`, 'feed:tasks'];
      if (event.taskId) {
        resourceKeys.push(`steps:task:${event.taskId}`);
      }
      const patchTaskId = event.patch?.taskId;
      if (patchTaskId && patchTaskId !== event.taskId) {
        resourceKeys.push(`steps:task:${patchTaskId}`);
      }
      return resourceKeys;
    }
    case 'step.delete':
      return event.taskId
        ? [
            'steps',
            `step:${event.stepId}`,
            'feed:tasks',
            `steps:task:${event.taskId}`,
          ]
        : ['steps', `step:${event.stepId}`, 'feed:tasks'];
    case 'pullRequest.upsert': {
      return [
        'feed:pullRequests',
        ...getPullRequestListResourceKeys(event),
        `pullRequest:${event.providerId}:${event.repoId}:${event.pullRequest.id}`,
      ];
    }
    case 'pullRequest.patch': {
      return [
        'feed:pullRequests',
        ...getPullRequestListResourceKeys(event),
        `pullRequest:${event.providerId}:${event.repoId}:${event.pullRequestId}`,
      ];
    }
    case 'pullRequest.threadsChanged':
      return [
        'feed:pullRequests',
        `pullRequest:${event.providerId}:${event.repoId}:${event.pullRequestId}`,
        `pullRequestThreads:${event.providerId}:${event.repoId}:${event.pullRequestId}`,
      ];
    case 'feed.sourceChanged':
      return ['feed', `feed:${event.source}`];
    case 'resource.invalidate':
      return [event.resourceKey];
  }
}

export function matchesCacheSubscription(
  subscription: CacheSubscription,
  resourceKey: string,
) {
  return (
    subscription.resourceKey === resourceKey ||
    (subscription.includeChildren === true &&
      resourceKey.startsWith(`${subscription.resourceKey}:`))
  );
}
