# Cache Recipes

This folder contains the renderer-side server cache. It uses Legend-State for path-level subscriptions and Electron IPC events for main-to-renderer updates.

Use this cache for migrated server state. Keep UI-only state in Zustand.

## Pieces

| File | Purpose |
| --- | --- |
| `cache-store.ts` | Root Legend observable `cache$` and test reset helper. |
| `cache-types.ts` | Shared cache metadata/result types. |
| `cache-actions.ts` | Low-level helpers for resource metadata, indexes, documents, stale marks, and change versions. |
| `use-cache-resource.ts` | Query-like hook for loading, ingesting, selecting, subscribing, and refetching one resource. |
| `use-cache-mutation.ts` | Small mutation helper with optimistic rollback support. Use only when a migrated slice needs it. |
| `cache-events.ts` | Renderer event reducer. Applies `CacheEvent` payloads to `cache$`. |
| `cache-gc.ts` | Garbage collector for unused resource metadata, documents, indexes, and orphaned entities. |
| `cache-subscriptions.ts` | Renderer subscription ref-counting and `api.cache.setSubscriptions` sync. |
| `cache-listener.tsx` | Global listener mounted once in `src/app.tsx`. |
| `domains/*` | Per-domain normalizers, selectors, resource keys, and small domain-specific helpers. |

Main-process event filtering lives in `electron/services/cache-event-service.ts`. Shared event types and resource matching live in `shared/cache-events.ts`.

## Data Model

The cache separates entities from resource metadata.

```ts
cache$.projects[id]        // normalized entity
cache$.indexes.projects    // list index resource, usually ids in display order
cache$.documents[key]      // non-normalized document resource
cache$.resources[key]      // status/error/stale/lastFetchedAt for any resource key
```

Resource metadata drives loading and refetch. Entity/index/document data drives render output.

`ResourceMeta.observerCount` tracks mounted hooks interested in a resource key. `lastUnusedAt` is set when the last observer unmounts and cleared while the resource is observed. The garbage collector uses those fields to remove old unused cache entries.

## Resource Key Rules

Use stable strings. Keep names domain-first and scoped by IDs.

```ts
projects
project:${projectId}
tasks
tasks:project:${projectId}
task:${taskId}
pullRequests:project:${projectId}
pullRequests:repo:${providerId}:${repoId}
pullRequest:${providerId}:${repoId}:${pullRequestId}
```

Put key builders in the domain module when IDs are involved. Entity keys should use canonical entity identity, not consumer identity. For example, pull request detail keys use provider/repo/PR identity; project-specific PR lists use relation keys.

```ts
export const PROJECTS_INDEX_KEY = 'projects';

export function projectResourceKey(projectId: string) {
  return `project:${projectId}`;
}
```

## Recipe: Add A Domain Module

Create `src/cache/domains/<domain>.ts` with resource keys, ingest helpers, selectors, and small index helpers.

```ts
import type { Project } from '@shared/types';

import { setIndexResource, setResourceSuccess } from '../cache-actions';
import { cache$ } from '../cache-store';

export const PROJECTS_INDEX_KEY = 'projects';

export function projectResourceKey(projectId: string) {
  return `project:${projectId}`;
}

export function ingestProject(project: Project) {
  cache$.projects[project.id].set(project);
  setResourceSuccess(projectResourceKey(project.id));
}

export function ingestProjects(projects: Project[]) {
  for (const project of projects) {
    ingestProject(project);
  }

  setIndexResource(
    PROJECTS_INDEX_KEY,
    projects.map((project) => project.id),
  );
}

export function selectProject(projectId: string) {
  return cache$.projects[projectId].get();
}

export function selectProjects() {
  const ids = cache$.indexes[PROJECTS_INDEX_KEY].ids.get() ?? [];
  return ids.flatMap((id) => {
    const project = cache$.projects[id].get();
    return project ? [project] : [];
  });
}
```

Add tests for ingest, select, ordering, and delete behavior.

## Recipe: Read A List Resource

Use `useCacheResource` from the hook file that exposes app data.

```ts
export function useProjects() {
  return useCacheResource({
    key: PROJECTS_INDEX_KEY,
    load: api.projects.findAll,
    ingest: ingestProjects,
    select: selectProjects,
  });
}
```

Behavior:

- Mount registers a cache subscription for `projects`.
- First mount loads if the resource is missing or stale.
- `ingest` writes normalized entities and list index data.
- `select` returns render data from `cache$`.
- If an event marks `projects` stale while mounted, the hook refetches.
- Concurrent loads for the same key are deduped.

## Recipe: Read A Detail Resource

Use a stable detail key and enable only when the ID exists.

```ts
export function useProject(id: string) {
  return useCacheResource({
    key: projectResourceKey(id),
    load: () => api.projects.findById(id),
    ingest: (project) => {
      if (project) {
        ingestProject(project);
      }
    },
    enabled: !!id,
    select: () => selectProject(id),
  });
}
```

If `load` can return `undefined`, keep `ingest` guarded. The resource metadata still records success for the key after load resolves.

## Recipe: Subscribe To Related Resources

Default subscription is `{ resourceKey: key }`. Pass `subscriptions` when a hook needs multiple event streams.

```ts
useCacheResource({
  key: `task:${taskId}:timeline`,
  load: () => api.tasks.getTimeline(taskId),
  ingest: ingestTimeline,
  select: () => selectTimeline(taskId),
  subscriptions: [
    { resourceKey: `task:${taskId}` },
    { resourceKey: `steps:task:${taskId}` },
  ],
});
```

Use `includeChildren: true` only for prefix-style subscriptions where every child event is relevant.

```ts
subscriptions: [{ resourceKey: 'tasks', includeChildren: true }]
```

Main filters cache events per window. If no mounted hook subscribes to a resource key, that window does not receive the event.

## Recipe: Emit A Main-Process Event

1. Add or reuse a `CacheEvent` variant in `shared/cache-events.ts`.
2. Include every affected resource key in `getCacheEventResourceKeys`.
3. Emit from the IPC handler after the database/service write succeeds.
4. Apply the event in `src/cache/cache-events.ts`.

```ts
ipcMain.handle('projects:update', async (_, id: string, data: UpdateProject) => {
  const project = await ProjectRepository.update(id, data);
  emitCacheEvent({
    type: 'project.patch',
    projectId: project.id,
    patch: { name: project.name, updatedAt: project.updatedAt },
  });
  return project;
});
```

Prefer `project.patch` when a mutation changes a known field set. Use `project.upsert` for creation, full replacement, or broad updates where sending an exact patch would be less clear.

For events that affect list and detail subscribers, shared resource keys must include both.

```ts
case 'project.upsert':
  return ['projects', `project:${event.project.id}`];
```

Do not add event metadata such as `id`, `sequence`, or `emittedAt`. Recovery is via canonical refetch.

## Recipe: Apply A Renderer Event

Update entities first, then mark affected list resources stale so active hooks refetch canonical data if needed.

```ts
case 'project.upsert':
  markResourceChanged(projectResourceKey(event.project.id));
  ingestProject(event.project);
  markResourceStale('projects');
  break;
```

Use `markResourceChanged(exactKey)` when an external event writes the same resource an in-flight load might also write. This prevents an older response from being accepted as fresh.

Use `markResourceStale(key)` when canonical data should be refetched by mounted hooks.

Use `markDocumentStale(key)` for document resources stored in `cache$.documents`.

## Recipe: Invalidate Without Entity Data

Use `resource.invalidate` when main knows a resource changed but does not have useful payload data.

```ts
emitCacheEvent({
  type: 'resource.invalidate',
  resourceKey: 'projects',
  reason: 'projects reordered',
});
```

This reaches only windows subscribed to that exact resource key or a matching parent subscription. If detail subscribers also need the change, emit detail events or include matching resource keys in a specific event type.

## Recipe: Optimistic Mutation

`useCacheMutation` supports per-call rollback. Prefer the smallest direct cache edit needed for immediate UI feedback.

```ts
export function useRenameProject() {
  return useCacheMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.projects.update(id, { name }),
    onMutate: ({ id, name }) => {
      const previous = cache$.projects[id].get();
      if (previous) {
        cache$.projects[id].assign({ name });
      }

      return () => {
        if (previous) {
          cache$.projects[id].set(previous);
        }
      };
    },
  });
}
```

Server success should still emit a cache event from main. Optimistic updates are for latency, not canonical synchronization.

If a slice still uses React Query mutations, remember that React Query invalidation will not update migrated read hooks. Main must emit cache events for migrated reads.

## Recipe: Reorder An Index

For drag-and-drop reorder, update the index IDs optimistically and roll back on error.

```ts
const previousIds = getProjectIndexIds();

if (previousIds) {
  const orderedIdSet = new Set(orderedIds);
  if (
    orderedIds.length === previousIds.length &&
    previousIds.every((id) => orderedIdSet.has(id))
  ) {
    setProjectIndexIds(orderedIds);
  }
}

return () => {
  if (previousIds) {
    setProjectIndexIds(previousIds);
  }
};
```

Main should emit events with updated entity payloads when sort fields changed, plus list invalidation if canonical order may differ.

## Recipe: Store A Non-Normalized Document

Use `cache$.documents` for data that does not belong in a normalized entity map.

```ts
export function pullRequestThreadsKey(projectId: string, pullRequestId: number) {
  return `pullRequestThreads:${projectId}:${pullRequestId}`;
}

export function ingestPullRequestThreads({
  projectId,
  pullRequestId,
  threads,
}: {
  projectId: string;
  pullRequestId: number;
  threads: PullRequestThread[];
}) {
  setDocumentResource(
    pullRequestThreadsKey(projectId, pullRequestId),
    threads,
  );
}
```

Without a custom `select`, `useCacheResource` reads `cache$.documents[key].data`.

```ts
return useCacheResource({
  key: pullRequestThreadsKey(projectId, pullRequestId),
  load: () => api.pullRequests.getThreads(projectId, pullRequestId),
  ingest: (threads) =>
    ingestPullRequestThreads({ projectId, pullRequestId, threads }),
});
```

## Recipe: Garbage Collect Unused Cache Data

`CacheListener` starts a periodic garbage collector. Defaults:

```ts
DEFAULT_CACHE_GC_INTERVAL_MS = 60_000;
DEFAULT_CACHE_GC_MAX_UNUSED_MS = 10 * 60_000;
```

Each mounted `useCacheResource` retains its primary `key` and any explicit subscription resource keys. When the hook unmounts, those resources are released. If the observer count reaches zero, `lastUnusedAt` records the release time.

Manual collection is available for tests or one-off cleanup.

```ts
const result = collectUnusedCache({
  maxUnusedMs: 10 * 60_000,
  now: Date.now(),
});
```

GC removes:

- `cache$.resources[key]` when it has no observers and has been unused long enough
- matching `cache$.documents[key]`
- matching `cache$.indexes[key]`
- project entities when both their detail resource and retaining list index are collectable

Domain entity cleanup is explicit. Add domain-specific GC rules when migrating new entity maps so active list resources can keep their entities alive.

## Testing Checklist

For each migrated slice, add tests for:

- domain ingest/select behavior
- list index ordering
- delete/removal behavior
- `getCacheEventResourceKeys` coverage for affected list and detail keys
- event reducer stale marks and entity updates
- in-flight load protection when events can race loads
- observer count, `lastUnusedAt`, and GC behavior for migrated entity maps
- optimistic mutation rollback, if added

Use `resetCache()` and `clearPendingResources()` in cache tests.

## Gotchas

- Do not mutate `cache$` from Electron main. Main sends events; renderer applies them.
- Do not rely on React Query invalidation for migrated read hooks.
- Do not create broad compatibility bridges. Migrate one slice at a time.
- Do not return new arrays or objects from Zustand selectors. This cache uses Legend-State, but existing Zustand rules still apply elsewhere.
- Do not mark an exact detail resource fresh from an external event without also protecting against older in-flight loads. Use `markResourceChanged(exactKey)` before ingest.
- Do not emit `resource.invalidate` when detail-only subscribers need the update unless the invalidated key matches their subscriptions.
- Keep resource keys stable and centralized in domain modules.
