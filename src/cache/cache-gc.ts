import { cache$ } from './cache-store';
import type { ResourceMeta } from './cache-types';
import { PROJECTS_INDEX_KEY, projectResourceKey } from './domains/projects';
import { stepResourceKey, taskStepsResourceKey } from './domains/steps';
import {
  ACTIVE_TASKS_INDEX_KEY,
  TASKS_INDEX_KEY,
  projectTasksResourceKey,
  taskResourceKey,
} from './domains/tasks';

export const DEFAULT_CACHE_GC_MAX_UNUSED_MS = 10 * 60 * 1000;
export const DEFAULT_CACHE_GC_INTERVAL_MS = 60 * 1000;

export type CacheGcResult = {
  resources: string[];
  projects: string[];
  pullRequests: string[];
  tasks: string[];
  steps: string[];
};

type EntityGcConfig = {
  getEntityIds: () => string[];
  deleteEntity: (id: string) => void;
  detailResourceKey: (id: string) => string;
  retainedIndexes: Array<{
    resourceKey: string;
    getIds: () => string[];
  }>;
};

function isCollectableResource(
  meta: ResourceMeta,
  { maxUnusedMs, now }: { maxUnusedMs: number; now: number },
) {
  return (
    meta.observerCount === 0 &&
    meta.lastUnusedAt !== null &&
    now - meta.lastUnusedAt >= maxUnusedMs
  );
}

function collectUnusedEntities({
  config,
  collectableResourceKeys,
  resources,
}: {
  config: EntityGcConfig;
  collectableResourceKeys: Set<string>;
  resources: Record<string, ResourceMeta>;
}) {
  const retainedIds = new Set<string>();

  for (const index of config.retainedIndexes) {
    if (collectableResourceKeys.has(index.resourceKey)) {
      continue;
    }

    for (const id of index.getIds()) {
      retainedIds.add(id);
    }
  }

  const collectedIds: string[] = [];

  for (const id of config.getEntityIds()) {
    const detailKey = config.detailResourceKey(id);
    const detailMeta = resources[detailKey];
    const detailIsCollectable = detailMeta
      ? collectableResourceKeys.has(detailKey)
      : true;

    if (detailIsCollectable && !retainedIds.has(id)) {
      config.deleteEntity(id);
      collectedIds.push(id);
    }
  }

  return collectedIds;
}

export function collectUnusedCache({
  maxUnusedMs = DEFAULT_CACHE_GC_MAX_UNUSED_MS,
  now = Date.now(),
}: {
  maxUnusedMs?: number;
  now?: number;
} = {}): CacheGcResult {
  const resources = cache$.resources.get() ?? {};
  const collectableResourceKeys = new Set(
    Object.entries(resources)
      .filter(([, meta]) => isCollectableResource(meta, { maxUnusedMs, now }))
      .map(([key]) => key),
  );
  const indexKeys = Object.keys(cache$.indexes.get() ?? {});
  const projectTaskIndexKeys = indexKeys.filter((key) =>
    key.startsWith('tasks:project:'),
  );
  const taskStepIndexKeys = indexKeys.filter((key) =>
    key.startsWith('steps:task:'),
  );
  const pullRequestIndexKeys = indexKeys.filter(
    (key) => key === 'pullRequests' || key.startsWith('pullRequests:'),
  );

  const collectedProjects = collectUnusedEntities({
    config: {
      getEntityIds: () => Object.keys(cache$.projects.get() ?? {}),
      deleteEntity: (projectId) => cache$.projects[projectId].delete(),
      detailResourceKey: projectResourceKey,
      retainedIndexes: [
        {
          resourceKey: PROJECTS_INDEX_KEY,
          getIds: () => cache$.indexes[PROJECTS_INDEX_KEY].ids.get() ?? [],
        },
        ...projectTaskIndexKeys.map((resourceKey) => ({
          resourceKey,
          getIds: () => [resourceKey.slice(projectTasksResourceKey('').length)],
        })),
      ],
    },
    collectableResourceKeys,
    resources,
  });

  const taskIndexKeys = indexKeys.filter(
    (key) =>
      key === TASKS_INDEX_KEY ||
      key === ACTIVE_TASKS_INDEX_KEY ||
      key.startsWith('tasks:project:'),
  );
  const collectedTasks = collectUnusedEntities({
    config: {
      getEntityIds: () => Object.keys(cache$.tasks.get() ?? {}),
      deleteEntity: (taskId) => cache$.tasks[taskId].delete(),
      detailResourceKey: taskResourceKey,
      retainedIndexes: [
        ...taskIndexKeys.map((resourceKey) => ({
          resourceKey,
          getIds: () => cache$.indexes[resourceKey].ids.get() ?? [],
        })),
        ...taskStepIndexKeys.map((resourceKey) => ({
          resourceKey,
          getIds: () => [resourceKey.slice(taskStepsResourceKey('').length)],
        })),
      ],
    },
    collectableResourceKeys,
    resources,
  });

  const collectedPullRequests = collectUnusedEntities({
    config: {
      getEntityIds: () => Object.keys(cache$.pullRequests.get() ?? {}),
      deleteEntity: (pullRequestKey) =>
        cache$.pullRequests[pullRequestKey].delete(),
      detailResourceKey: (pullRequestKey) => pullRequestKey,
      retainedIndexes: pullRequestIndexKeys.map((resourceKey) => ({
        resourceKey,
        getIds: () => cache$.indexes[resourceKey].ids.get() ?? [],
      })),
    },
    collectableResourceKeys,
    resources,
  });

  const stepIndexKeys = indexKeys.filter((key) =>
    key.startsWith('steps:task:'),
  );
  const collectedSteps = collectUnusedEntities({
    config: {
      getEntityIds: () => Object.keys(cache$.steps.get() ?? {}),
      deleteEntity: (stepId) => cache$.steps[stepId].delete(),
      detailResourceKey: stepResourceKey,
      retainedIndexes: stepIndexKeys.map((resourceKey) => ({
        resourceKey,
        getIds: () => cache$.indexes[resourceKey].ids.get() ?? [],
      })),
    },
    collectableResourceKeys,
    resources,
  });

  const collectedResources = Array.from(collectableResourceKeys);
  for (const key of collectedResources) {
    cache$.documents[key].delete();
    cache$.indexes[key].delete();
    cache$.resources[key].delete();
  }

  return {
    resources: collectedResources,
    projects: collectedProjects,
    pullRequests: collectedPullRequests,
    tasks: collectedTasks,
    steps: collectedSteps,
  };
}

export function startCacheGarbageCollector({
  intervalMs = DEFAULT_CACHE_GC_INTERVAL_MS,
  maxUnusedMs = DEFAULT_CACHE_GC_MAX_UNUSED_MS,
}: {
  intervalMs?: number;
  maxUnusedMs?: number;
} = {}) {
  const timer = globalThis.setInterval(() => {
    collectUnusedCache({ maxUnusedMs });
  }, intervalMs);

  return () => globalThis.clearInterval(timer);
}
