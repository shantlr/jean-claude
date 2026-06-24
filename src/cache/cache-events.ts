import type { FeedItem, FeedItemAttention } from '@shared/feed-types';
import type { TaskStatus, TaskStepStatus } from '@shared/types';
import type { CacheEvent } from '@shared/cache-events';

import {
  ingestProject,
  projectResourceKey,
  removeProject,
} from './domains/projects';
import {
  ingestStep,
  markStepListsStale,
  patchStepSnapshot,
  removeStep,
  stepResourceKey,
} from './domains/steps';
import {
  ingestTask,
  markTaskListsStale,
  patchTaskSnapshot,
  removeTask,
  taskResourceKey,
} from './domains/tasks';
import {
  isAllProjectsPullRequestsResourceKey,
  mergePullRequestSnapshot,
  patchPullRequestSnapshot,
  projectPullRequestsResourceKey,
  pullRequestResourceKey,
  pullRequestThreadsResourceKey,
  repoPullRequestsResourceKey,
} from './domains/pull-requests';
import {
  markDocumentStale,
  markResourceChanged,
  markResourceStale,
  setResourceSuccess,
} from './cache-actions';
import { applyEntityPatch } from './entity-merge';
import { cache$ } from './cache-store';



const PULL_REQUEST_STATUSES = [
  'active',
  'completed',
  'abandoned',
  'all',
] as const;

function markPullRequestListResourcesStale({
  providerId,
  repoId,
  projectId,
  invalidateFeed = true,
}: {
  providerId: string;
  repoId: string;
  projectId?: string;
  invalidateFeed?: boolean;
}) {
  if (invalidateFeed) {
    markResourceStale('feed:pullRequests');
  }
  markResourceStale('pullRequests');
  markResourceStale(repoPullRequestsResourceKey({ providerId, repoId }));
  for (const status of PULL_REQUEST_STATUSES) {
    markResourceStale(
      repoPullRequestsResourceKey({ providerId, repoId, status }),
    );
  }

  if (projectId) {
    markResourceStale(projectPullRequestsResourceKey(projectId));
    for (const status of PULL_REQUEST_STATUSES) {
      markResourceStale(projectPullRequestsResourceKey(projectId, status));
    }
  }

  for (const key of Object.keys(cache$.resources.get())) {
    if (isAllProjectsPullRequestsResourceKey(key)) {
      markResourceStale(key);
    }
  }
}

function markTaskFeedStale() {
  markResourceStale('feed:tasks');
}

function attentionForTaskStatus(
  status: TaskStatus,
): FeedItemAttention | undefined {
  switch (status) {
    case 'running':
      return 'running';
    case 'waiting':
      return 'waiting';
    case 'completed':
      return 'completed';
    case 'errored':
      return 'errored';
    case 'interrupted':
      return 'interrupted';
  }
}

function attentionForStepStatus(
  status: TaskStepStatus,
): FeedItemAttention | undefined {
  switch (status) {
    case 'running':
      return 'running';
    case 'errored':
      return 'errored';
    case 'interrupted':
      return 'interrupted';
    default:
      return undefined;
  }
}

function patchTaskFeedItem(
  item: FeedItem,
  taskId: string,
  patch: Pick<Partial<FeedItem>, 'attention' | 'subtitle' | 'timestamp'>,
): { item: FeedItem; changed: boolean } {
  const childResults = item.children?.map((child) =>
    patchTaskFeedItem(child, taskId, patch),
  );
  const childrenChanged =
    childResults?.some((result) => result.changed) ?? false;
  const nextChildren = childResults?.map((result) => result.item);
  const matchesTask = item.source === 'task' && item.taskId === taskId;

  if (!matchesTask && !childrenChanged) {
    return { item, changed: false };
  }

  return {
    item: {
      ...item,
      ...(matchesTask ? patch : {}),
      ...(nextChildren ? { children: nextChildren } : {}),
    },
    changed: true,
  };
}

function patchTaskFeedDocument(
  taskId: string,
  patch: Pick<Partial<FeedItem>, 'attention' | 'subtitle' | 'timestamp'>,
) {
  const items = cache$.documents['feed:tasks'].data.get() as
    | FeedItem[]
    | undefined;
  if (!items) return;

  const results = items.map((item) => patchTaskFeedItem(item, taskId, patch));
  if (!results.some((result) => result.changed)) return;

  cache$.documents['feed:tasks'].data.set(
    results.map((result) => result.item),
  );
}

function removeTaskFeedItem(
  item: FeedItem,
  taskId: string,
): { item: FeedItem | null; changed: boolean } {
  const matchesTask = item.source === 'task' && item.taskId === taskId;
  if (matchesTask) {
    return { item: null, changed: true };
  }

  const childResults = item.children?.map((child) =>
    removeTaskFeedItem(child, taskId),
  );
  const childrenChanged =
    childResults?.some((result) => result.changed) ?? false;
  if (!childrenChanged) {
    return { item, changed: false };
  }

  const children = childResults
    ?.map((result) => result.item)
    .filter((child): child is FeedItem => child !== null);

  return {
    item: {
      ...item,
      ...(children && children.length > 0
        ? { children }
        : { children: undefined }),
    },
    changed: true,
  };
}

function removeTaskFromFeedDocument(taskId: string) {
  const items = cache$.documents['feed:tasks'].data.get() as
    | FeedItem[]
    | undefined;
  if (!items) return;

  const results = items.map((item) => removeTaskFeedItem(item, taskId));
  if (!results.some((result) => result.changed)) return;

  cache$.documents['feed:tasks'].data.set(
    results
      .map((result) => result.item)
      .filter((item): item is FeedItem => item !== null),
  );
}

function compactFeedPatch(
  patch: Pick<Partial<FeedItem>, 'attention' | 'subtitle' | 'timestamp'>,
): Pick<Partial<FeedItem>, 'attention' | 'subtitle' | 'timestamp'> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}

function markDeletedEntityResource(resourceKey: string) {
  markResourceChanged(resourceKey);
  setResourceSuccess(resourceKey);
}

export function applyCacheEvent(event: CacheEvent) {
  switch (event.type) {
    case 'project.upsert':
      markResourceChanged(projectResourceKey(event.project.id));
      ingestProject(event.project);
      markResourceStale('projects');
      break;
    case 'project.patch': {
      const project$ = cache$.projects[event.projectId];
      const project = project$.get();
      if (project) {
        markResourceChanged(projectResourceKey(event.projectId));
        project$.set(applyEntityPatch(project, event.patch));
      } else {
        markResourceStale('projects');
        markResourceStale(`project:${event.projectId}`);
      }
      markResourceStale('projects');
      break;
    }
    case 'project.delete': {
      const cachedTaskIds = Object.values(cache$.tasks.get() ?? {})
        .filter((task) => task.projectId === event.projectId)
        .map((task) => task.id);
      const taskIds = new Set([...(event.taskIds ?? []), ...cachedTaskIds]);
      const cachedStepIds = Object.values(cache$.steps.get() ?? {})
        .filter((step) => taskIds.has(step.taskId))
        .map((step) => step.id);
      const stepIds = new Set([...(event.stepIds ?? []), ...cachedStepIds]);

      for (const stepId of stepIds) {
        removeStep(stepId, { deleteResource: false });
        markDeletedEntityResource(stepResourceKey(stepId));
      }

      for (const taskId of taskIds) {
        removeTask(taskId, { deleteResource: false });
        markDeletedEntityResource(taskResourceKey(taskId));
        markStepListsStale(taskId);
      }

      removeProject(event.projectId);
      markResourceStale('projects');
      markDeletedEntityResource(projectResourceKey(event.projectId));
      markTaskListsStale(event.projectId);
      markStepListsStale();
      markTaskFeedStale();
      break;
    }
    case 'task.upsert': {
      const cachedProjectId = cache$.tasks[event.task.id].get()?.projectId;
      markResourceChanged(taskResourceKey(event.task.id));
      ingestTask(event.task);
      const attention = attentionForTaskStatus(event.task.status);
      if (event.task.userCompleted) {
        removeTaskFromFeedDocument(event.task.id);
      } else if (attention) {
        patchTaskFeedDocument(event.task.id, compactFeedPatch({
          attention,
          timestamp: event.task.updatedAt,
        }));
      }
      const projectIds = new Set(
        [event.previousProjectId, cachedProjectId, event.task.projectId].filter(
          (id) => id !== undefined,
        ),
      );
      if (projectIds.size === 0) {
        markTaskListsStale();
      } else {
        for (const projectId of projectIds) {
          markTaskListsStale(projectId);
        }
      }
      markTaskFeedStale();
      break;
    }
    case 'task.patch': {
      const resourceKey = taskResourceKey(event.taskId);
      if (patchTaskSnapshot(event.taskId, event.patch)) {
        markResourceChanged(resourceKey);
      } else {
        markResourceStale(resourceKey);
      }
      const attention =
        event.patch.status === undefined
          ? undefined
          : attentionForTaskStatus(event.patch.status);
      if (event.patch.userCompleted === true) {
        removeTaskFromFeedDocument(event.taskId);
      } else if (attention) {
        patchTaskFeedDocument(event.taskId, compactFeedPatch({
          attention,
          timestamp: event.patch.updatedAt,
        }));
      }
      const projectIds = new Set(
        [event.projectId, event.patch.projectId].filter(
          (id) => id !== undefined,
        ),
      );
      if (projectIds.size === 0) {
        markTaskListsStale();
      } else {
        for (const projectId of projectIds) {
          markTaskListsStale(projectId);
        }
      }
      markTaskFeedStale();
      break;
    }
    case 'task.delete': {
      const cachedProjectId = cache$.tasks[event.taskId].get()?.projectId;
      const cachedStepIds = Object.values(cache$.steps.get() ?? {})
        .filter((step) => step.taskId === event.taskId)
        .map((step) => step.id);
      const stepIds = new Set([...(event.stepIds ?? []), ...cachedStepIds]);

      for (const stepId of stepIds) {
        removeStep(stepId, { deleteResource: false });
        markDeletedEntityResource(stepResourceKey(stepId));
      }

      removeTask(event.taskId, { deleteResource: false });
      markDeletedEntityResource(taskResourceKey(event.taskId));
      const projectIds = new Set(
        [event.projectId, cachedProjectId].filter((id) => id !== undefined),
      );
      if (projectIds.size === 0) {
        markTaskListsStale();
      } else {
        for (const projectId of projectIds) {
          markTaskListsStale(projectId);
        }
      }
      markStepListsStale(event.taskId);
      markTaskFeedStale();
      break;
    }
    case 'step.upsert': {
      const cachedTaskId = cache$.steps[event.step.id].get()?.taskId;
      markResourceChanged(stepResourceKey(event.step.id));
      ingestStep(event.step);
      const attention = attentionForStepStatus(event.step.status);
      if (attention) {
        patchTaskFeedDocument(event.step.taskId, compactFeedPatch({
          attention,
          subtitle: event.step.name,
          timestamp: event.step.updatedAt,
        }));
      }
      const taskIds = new Set(
        [event.previousTaskId, cachedTaskId, event.step.taskId].filter(
          (id) => id !== undefined,
        ),
      );
      if (taskIds.size === 0) {
        markStepListsStale();
      } else {
        for (const taskId of taskIds) {
          markStepListsStale(taskId);
        }
      }
      markTaskFeedStale();
      break;
    }
    case 'step.patch': {
      const resourceKey = stepResourceKey(event.stepId);
      const oldTaskId = cache$.steps[event.stepId].get()?.taskId;
      const newTaskId = event.patch.taskId ?? event.taskId;
      if (patchStepSnapshot(event.stepId, event.patch)) {
        markResourceChanged(resourceKey);
      } else {
        markResourceStale(resourceKey);
      }
      const attention =
        event.patch.status === undefined
          ? undefined
          : attentionForStepStatus(event.patch.status);
      if (attention && newTaskId) {
        patchTaskFeedDocument(newTaskId, compactFeedPatch({
          attention,
          timestamp: event.patch.updatedAt,
        }));
      }
      const taskIds = new Set(
        [oldTaskId, event.taskId, newTaskId].filter((id) => id !== undefined),
      );
      if (taskIds.size === 0) {
        markStepListsStale();
      } else {
        for (const taskId of taskIds) {
          markStepListsStale(taskId);
        }
      }
      markTaskFeedStale();
      break;
    }
    case 'step.delete': {
      const cachedTaskId = cache$.steps[event.stepId].get()?.taskId;
      removeStep(event.stepId, { deleteResource: false });
      markDeletedEntityResource(stepResourceKey(event.stepId));
      const taskIds = new Set(
        [event.taskId, cachedTaskId].filter((id) => id !== undefined),
      );
      if (taskIds.size === 0) {
        markStepListsStale();
      } else {
        for (const taskId of taskIds) {
          markStepListsStale(taskId);
        }
      }
      markTaskFeedStale();
      break;
    }
    case 'pullRequest.upsert': {
      markResourceChanged(
        pullRequestResourceKey({
          providerId: event.providerId,
          repoId: event.repoId,
          pullRequestId: event.pullRequest.id,
        }),
      );
      mergePullRequestSnapshot({
        providerId: event.providerId,
        repoId: event.repoId,
        pullRequest: event.pullRequest,
      });
      markPullRequestListResourcesStale({
        ...event,
        invalidateFeed: event.invalidateFeed !== false,
      });
      break;
    }
    case 'pullRequest.patch': {
      const resourceKey = pullRequestResourceKey({
        providerId: event.providerId,
        repoId: event.repoId,
        pullRequestId: event.pullRequestId,
      });
      if (
        patchPullRequestSnapshot({
          providerId: event.providerId,
          repoId: event.repoId,
          pullRequestId: event.pullRequestId,
          patch: event.patch,
        })
      ) {
        markResourceChanged(resourceKey);
      } else {
        markResourceStale(resourceKey);
      }
      markPullRequestListResourcesStale(event);
      break;
    }
    case 'pullRequest.threadsChanged':
      markDocumentStale(
        pullRequestThreadsResourceKey({
          providerId: event.providerId,
          repoId: event.repoId,
          pullRequestId: event.pullRequestId,
        }),
      );
      markResourceStale('feed:pullRequests');
      break;
    case 'feed.sourceChanged':
      markResourceStale(`feed:${event.source}`);
      break;
    case 'resource.invalidate':
      markResourceStale(event.resourceKey);
      break;
  }
}
