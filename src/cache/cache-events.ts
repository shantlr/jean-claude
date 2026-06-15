import type { CacheEvent } from '@shared/cache-events';

import {
  markDocumentStale,
  markResourceChanged,
  markResourceStale,
  setResourceSuccess,
} from './cache-actions';
import { cache$ } from './cache-store';
import {
  ingestProject,
  projectResourceKey,
  removeProject,
} from './domains/projects';
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
import { applyEntityPatch } from './entity-merge';

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
}: {
  providerId: string;
  repoId: string;
  projectId?: string;
}) {
  markResourceStale('feed:pullRequests');
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
      markPullRequestListResourcesStale(event);
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
