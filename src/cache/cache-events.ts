import type { FeedItem, FeedItemAttention } from '@shared/feed-types';
import type { Task, TaskStatus, TaskStepStatus } from '@shared/types';
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

  markResourceChanged('feed:tasks');
  cache$.documents['feed:tasks'].data.set(
    results.map((result) => result.item),
  );
}

function removeProjectFromFeedDocument(key: string, projectId: string) {
  const items = cache$.documents[key].data.get() as FeedItem[] | undefined;
  if (!items) return;

  let changed = false;
  const removeItems = (feedItems: FeedItem[]): FeedItem[] =>
    feedItems
      .map((item) => {
        if (item.projectId === projectId) {
          changed = true;
          return null;
        }

        if (!item.children) return item;

        const children = removeItems(item.children);
        if (children.length === item.children.length) return item;

        return children.length > 0
          ? { ...item, children }
          : { ...item, children: undefined };
      })
      .filter((item): item is FeedItem => item !== null);

  const next = removeItems(items);
  if (!changed) return;

  markResourceChanged(key);
  cache$.documents[key].data.set(next);
}

function taskToFeedItem(task: Task): FeedItem | null | undefined {
  if (task.userCompleted) return null;

  const project = cache$.projects[task.projectId].get();
  if (!project) return undefined;

  return {
    id: `task:${task.id}`,
    source: 'task',
    attention: attentionForTaskStatus(task.status) ?? 'waiting',
    timestamp: task.updatedAt,
    projectId: task.projectId,
    projectName: project.name,
    projectColor: project.color,
    projectLogoPath: project.logoPath,
    projectPriority: 'normal',
    title: task.name ?? task.prompt.slice(0, 80),
    hasUnread: task.hasUnread,
    taskId: task.id,
    taskType: task.type,
    parentTaskId: task.parentTaskId ?? undefined,
    pendingMessage: task.pendingMessage ?? undefined,
    pullRequestId: task.pullRequestId
      ? parseInt(task.pullRequestId, 10)
      : undefined,
    pullRequestProviderId: project.repoProviderId ?? undefined,
    pullRequestRepoId: project.repoId ?? undefined,
    pullRequestUrl: task.pullRequestUrl ?? undefined,
    workItemIds: task.workItemIds ?? undefined,
    workItemUrls: task.workItemUrls ?? undefined,
  };
}

type RemovedTaskFeedPosition = {
  parentTaskId: string | null;
  index: number;
} | null;

function removeTaskFeedItemFromList(
  items: FeedItem[],
  taskId: string,
  parentTaskId: string | null = null,
): { items: FeedItem[]; changed: boolean; position: RemovedTaskFeedPosition } {
  let changed = false;
  let position: RemovedTaskFeedPosition = null;
  const nextItems = items
    .map((item, index) => {
      const childrenResult = item.children
        ? removeTaskFeedItemFromList(item.children, taskId, item.taskId ?? null)
        : null;
      if (childrenResult?.changed) {
        changed = true;
        position = childrenResult.position;
      }
      if (item.source === 'task' && item.taskId === taskId) {
        changed = true;
        position = { parentTaskId, index };
        return null;
      }
      return childrenResult?.changed
        ? { ...item, children: childrenResult.items }
        : item;
    })
    .filter((item): item is FeedItem => item !== null);

  return { items: nextItems, changed, position };
}

function insertTaskFeedItemInList(
  items: FeedItem[],
  nextItem: FeedItem,
  previousPosition: RemovedTaskFeedPosition,
): { items: FeedItem[]; inserted: boolean } {
  if (nextItem.parentTaskId) {
    let inserted = false;
    const nested = items.map((item) => {
      if (item.source === 'task' && item.taskId === nextItem.parentTaskId) {
        inserted = true;
        const children = [...(item.children ?? [])];
        const index =
          previousPosition && previousPosition.parentTaskId === nextItem.parentTaskId
            ? Math.min(previousPosition.index, children.length)
            : 0;
        children.splice(index, 0, nextItem);
        return { ...item, children };
      }
      return item;
    });
    return { items: nested, inserted };
  }

  const nextItems = [...items];
  const index =
    previousPosition && previousPosition.parentTaskId === null
      ? Math.min(previousPosition.index, nextItems.length)
      : 0;
  nextItems.splice(index, 0, nextItem);
  return { items: nextItems, inserted: true };
}

function findTaskFeedItem(
  items: FeedItem[],
  taskId: string,
): FeedItem | undefined {
  for (const item of items) {
    if (item.source === 'task' && item.taskId === taskId) {
      return item;
    }

    const child = item.children
      ? findTaskFeedItem(item.children, taskId)
      : undefined;
    if (child) return child;
  }

  return undefined;
}

function upsertTaskFeedDocument(task: Task) {
  let nextItem = taskToFeedItem(task);
  if (!nextItem) {
    if (nextItem === null) {
      removeTaskFromFeedDocument(task.id);
    }
    return;
  }

  const items = cache$.documents['feed:tasks'].data.get() as
    | FeedItem[]
    | undefined;
  if (!items) return;

  const existingItem = findTaskFeedItem(items, task.id);
  if (existingItem?.children && !nextItem.children) {
    nextItem = { ...nextItem, children: existingItem.children };
  }

  const withoutExisting = removeTaskFeedItemFromList(items, task.id);
  const result = insertTaskFeedItemInList(
    withoutExisting.items,
    nextItem,
    withoutExisting.position,
  );
  if (result.inserted) {
    markResourceChanged('feed:tasks');
    cache$.documents['feed:tasks'].data.set(result.items);
  }
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

  markResourceChanged('feed:tasks');
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
      removeProjectFromFeedDocument('feed:tasks', event.projectId);
      removeProjectFromFeedDocument('feed:pullRequests', event.projectId);
      removeProjectFromFeedDocument('feed:workItems', event.projectId);
      markTaskFeedStale();
      markResourceStale('feed:pullRequests');
      markResourceStale('feed:workItems');
      break;
    }
    case 'task.upsert': {
      const cachedProjectId = cache$.tasks[event.task.id].get()?.projectId;
      markResourceChanged(taskResourceKey(event.task.id));
      ingestTask(event.task);
      upsertTaskFeedDocument(event.task);
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
      removeTaskFromFeedDocument(event.taskId);
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
