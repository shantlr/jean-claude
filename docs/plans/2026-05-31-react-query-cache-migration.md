# React Query Cache Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace TanStack React Query as the renderer server-state cache with a Legend-State normalized cache that shares entities across components and consumes granular main-process update events.

**Architecture:** Keep Electron main as the source of truth for SQLite-backed data and external service orchestration. Add a typed `cache:event` IPC stream from main to renderer. Add a renderer Legend-State normalized entity cache with request metadata, param indexes, deduped loaders, mutation helpers, and domain-specific normalizers. Migrate one domain slice at a time behind mostly-compatible hook names while React Query keeps serving untouched domains until final cleanup.

**Tech Stack:** TypeScript, React 19, Electron IPC, Legend-State v3 beta, Zustand 5 for existing UI stores, Vitest, Kysely, existing `window.api` bridge.

---

## Study Findings

Current React Query footprint is broad but mechanically migratable:

| Finding | Evidence |
| --- | --- |
| React Query imports | 57 files import `@tanstack/react-query` |
| Query/mutation surface | 73 `useQuery`/`useInfiniteQuery` call sites and 127 `useMutation` call sites |
| Manual invalidation pressure | 261 `invalidateQueries` call sites |
| Direct cache manipulation | 46 `setQueryData`/`getQueryData` call sites |
| Polling | 25 `refetchInterval` references |
| Root provider | `src/app.tsx` creates one `QueryClient` and wraps router in `QueryClientProvider` |

Main already has event patterns we can reuse:

| Event family | Current source |
| --- | --- |
| Agent stream | `electron/services/agent-service.ts` emits `AGENT_CHANNELS.EVENT` to all windows |
| Run commands | `electron/ipc/handlers.ts` forwards status/log events from `runCommandService` |
| Notifications | `system-calendar-service.ts`, `pipeline-tracking-service.ts`, and `agent-service.ts` send notification events |
| Debug logs | `electron/lib/debug.ts` batches log events |
| App reload progress | `electron/ipc/handlers.ts` sends progress to the requesting renderer |

Pull requests demonstrate the duplication problem clearly:

| Current hook | Current cache key | Issue |
| --- | --- | --- |
| `usePullRequests` | `['pull-requests', projectId, status]` | Stores list summaries separately from detail |
| `useAllProjectsPullRequests` | `['all-projects-pull-requests', status, ids]` | Re-fetches per-project PR lists and stores copies with project fields |
| `usePullRequest` | `['pull-request', projectId, prId]` | Detail object is patched directly but list/feed are invalidated |
| `useFeed` | `feedQueryKeys.pullRequests` | Stores PR-derived feed data separately from PR entities |
| PR mutations | mixed `setQueryData` + invalidations | Updated PR response only updates detail key; list/all/feed refetch |

This matches TanStack Query's intended model: query keys hold document-shaped results and invalidation/refetch keeps documents consistent. That is good for generic server state, but not ideal for this app's need for shared normalized entities plus main-process push events.

## Library Decision

Chosen path: normalized server cache using Legend-State.

| Option | Fit | Performance notes | Migration risk | Recommendation |
| --- | --- | --- | --- | --- |
| Legend-State | Best for chosen direction | Path-level observable subscriptions avoid Zustand selector fanout. Updating `pullRequests[key].title` wakes only readers of that path. Works outside React for IPC event ingestion. | Medium. New dependency and mutable observable mental model. v3 docs are beta. | Use this. |
| TanStack DB | Strong relational fit | Collections and live queries would fit feed/PR/task joins well. | Medium-high. New model, and query collections may keep TanStack Query involved. | Do not use now. Revisit if Legend derived indexes become painful. |
| Jotai | Good for atomic UI state | Atom families avoid one-store selector fanout. | Medium. Entity atom lifecycle, cleanup, index atoms, and async query lifecycle remain custom. `jotai-tanstack-query` keeps TanStack Query. | Not primary. |
| Custom keyed pub/sub | Excellent precision | Only notifies exact resource/entity keys. | Medium. We own React integration and lifecycle. | Fallback if Legend-State beta risk hurts. |
| Zustand custom cache | Familiar | One giant store would rerun selectors for unrelated changes unless heavily sharded. | Medium. Selector fanout concern for this cache shape. | Keep for existing UI stores, not server cache. |
| RTK Query | Mature | Tags and streaming updates help, but docs call it a document cache, not a deduplicating normalized cache. | High. Adds Redux and still favors invalidation/refetch. | Not a fit. |
| Valtio | Fine-grained proxy state | Simple mutable proxy model, can subscribe outside React. | Medium-high. Less explicit than Legend for server cache metadata and less compelling for this app. | Not needed. |

Why Legend-State wins here:

| Reason | Detail |
| --- | --- |
| Avoids selector fanout | Components observe exact paths through `useValue`, `observer`, or `Memo`. Updating one PR title should not rerun every cache selector. |
| IPC-friendly | Main events can call cache actions in module scope, e.g. `cache$.pullRequests[key].assign(patch)`. |
| Normalized but granular | Entity records and indexes stay explicit, while individual fields remain independently observable. |
| Gradual migration | Existing hook names can return React Query-like result objects while internals move to Legend observables. |
| Good fit for event patches | Project/task/step/PR patch events map naturally to observable path updates. |
| Keep existing UI stores | Zustand remains for navigation/background jobs/toasts; only server cache moves. |

## Target Cache Model

Create `src/cache/` as renderer-owned server-state cache infrastructure.

Core concepts:

| Concept | Shape | Purpose |
| --- | --- | --- |
| Observable entity record | `cache$.projects[id]`, `cache$.pullRequests[key]` | Stores canonical objects by ID and lets components subscribe to exact fields. |
| Observable index | `cache$.indexes[key].ids` | Stores ordered IDs for parameterized resources, like PRs by project/status. |
| Observable document resource | `cache$.documents[key].data` | Stores non-normalized payloads, like file content, diffs, memory usage, and logs. |
| Observable request metadata | `cache$.resources[key]` | Gives hooks React Query-like loading/error/stale state. |
| Pending registry | module-level `Map<resourceKey, Promise>` | Dedupes in-flight loads without putting promises into observable state. |
| Normalizer/action | imperative cache action using `.set()`, `.assign()`, `.delete()` | Converts API responses or events into granular observable updates. |
| Event applier | switch over `CacheEvent` | Applies typed events idempotently. |

Suggested files:

```txt
src/cache/
  cache-store.ts
  cache-types.ts
  cache-actions.ts
  cache-events.ts
  cache-subscriptions.ts
  use-cache-resource.ts
  use-cache-mutation.ts
  domains/
    projects.ts
    pull-requests.ts
    tasks.ts
    steps.ts
    feed.ts
    settings.ts
```

`cache-store.ts` should export a single Legend observable, not a Zustand store:

```ts
import { observable } from '@legendapp/state';

export const cache$ = observable<CacheState>({
  projects: {},
  tasks: {},
  steps: {},
  providers: {},
  pullRequests: {},
  workItems: {},
  feedNotes: {},
  indexes: {},
  documents: {},
  resources: {},
});
```

Use normalized entities for shared app data:

| Domain | Entity key |
| --- | --- |
| Project | `project.id` |
| Task | `task.id` |
| Step | `step.id` |
| Provider | `provider.id` |
| Token metadata | `token.id` |
| Pull request | `${projectId}:${pullRequestId}` |
| Work item | `${providerId}:${workItemId}` |
| Feed note | `note.id` |
| Project command/group | `id` |
| Tracked pipeline | `id` |
| Managed skill/agent | stable source path |

Keep documents for data that is expensive, large, or naturally keyed by arguments:

| Resource | Document key example |
| --- | --- |
| PR file content | `prFileContent:${projectId}:${prId}:${version}:${filePath}` |
| Worktree diff | `worktreeDiff:${taskId}` |
| Worktree file content | `worktreeFile:${taskId}:${status}:${filePath}` |
| Raw debug messages | `rawMessages:${taskId}:${stepId}` |
| Directory listing | `directory:${projectRoot}:${dirPath}` |
| Memory usage | `memoryUsage` |
| Usage history | `usageHistory:${provider}:${limitKey}:${since}:${until}` |

## Cache Event Model

Add `shared/cache-events.ts` with a discriminated union and subscription helpers. Do not add event IDs or timestamps unless a concrete consumer appears. IPC delivery from main to a renderer is ordered enough for this cache; canonical snapshots repair missed events.

Initial events:

```ts
export type CacheEvent =
  | { type: 'project.upsert'; project: Project }
  | { type: 'project.patch'; projectId: string; patch: Partial<Project> }
  | { type: 'project.delete'; projectId: string }
  | { type: 'task.upsert'; task: Task }
  | { type: 'task.patch'; taskId: string; projectId?: string; patch: Partial<Task> }
  | { type: 'task.delete'; taskId: string; projectId?: string }
  | { type: 'step.upsert'; step: TaskStep }
  | { type: 'step.patch'; stepId: string; taskId?: string; patch: Partial<TaskStep> }
  | { type: 'pullRequest.upsert'; projectId: string; pullRequest: AzureDevOpsPullRequest | AzureDevOpsPullRequestDetails }
  | { type: 'pullRequest.patch'; projectId: string; pullRequestId: number; patch: Partial<AzureDevOpsPullRequestDetails> }
  | { type: 'pullRequest.threadsChanged'; projectId: string; pullRequestId: number }
  | { type: 'feed.sourceChanged'; source: 'tasks' | 'pullRequests' | 'notes' | 'workItems' }
  | { type: 'resource.invalidate'; resourceKey: string; reason: string };
```

Subscriptions:

```ts
export type CacheSubscription = {
  resourceKey: string;
  includeChildren?: boolean;
};

export type CacheSubscriptionUpdate = {
  revision: number;
  subscriptions: CacheSubscription[];
};
```

Each event maps to resource keys, such as `projects`, `project:${projectId}`, `tasks:project:${projectId}`, or `pullRequest:${projectId}:${pullRequestId}`. `useCacheResource` registers its current resource subscriptions through `api.cache.setSubscriptions`, so main only sends relevant events to each renderer window. Subscription updates include monotonic renderer-local `revision` so out-of-order IPC updates cannot replace a newer subscription set.

Rules:

| Rule | Reason |
| --- | --- |
| Events are idempotent | Renderer may apply snapshot then event, or event then refetch. |
| Events include enough data when cheap | Prefer `project.patch` over `resource.invalidate`. |
| Events invalidate only when patching is expensive | PR threads, file contents, diffs, and pipeline timelines can start as targeted invalidations. |
| Snapshots are canonical | Missed or stale events are repaired by the next fetch. Do not build sequence/replay machinery until needed. |
| Subscriptions are explicit | Renderer tells main which resource keys it is currently observing. |
| Main emits after successful writes | Do not emit optimistic events from main before persistence succeeds. Renderer can still optimistically update locally for user mutations. |

Main-process files:

```txt
electron/services/cache-event-service.ts
shared/cache-events.ts
electron/preload.ts
src/lib/api.ts
electron/ipc/handlers.ts
```

Renderer listener:

```txt
src/cache/cache-events.ts
src/cache/cache-listener.tsx
```

## Hook Compatibility Strategy

Do not migrate UI components first. Migrate hooks behind existing names.

`useCacheResource` should return the subset most components use:

```ts
type ResourceResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};
```

`useCacheMutation` should return the subset most mutation callers use:

```ts
type MutationResult<TVariables, TResult> = {
  mutate: (variables: TVariables, options?: { onSuccess?: (result: TResult) => void; onError?: (error: Error) => void }) => void;
  mutateAsync: (variables: TVariables) => Promise<TResult>;
  isPending: boolean;
  error: Error | null;
};
```

This avoids rewriting most component call sites while removing React Query from each hook file.

## Migration Order

Use this order to keep risk contained. Each phase is independently shippable and may stop after its verification/commit.

| Phase | Scope | Stop point | Reason |
| --- | --- | --- | --- |
| 1 | Cache/event foundation | `cache:event`, Legend store, loader/mutation helpers, listener, tests merged while React Query still owns all UI data | Enables dual-running safely. |
| 2 | Projects | Project hooks read/write Legend cache; non-project hooks still use React Query | Small, central, required by PR repo lookup. |
| 3 | Pull request read paths | PR list/detail/all-project hooks share one PR entity; mutations may still invalidate old keys | Directly addresses duplicated PR data with low write risk. |
| 4 | Pull request mutations/events | PR create/update/comment/status paths patch Legend entities and targeted resources | Removes list/detail/feed invalidation pressure after read paths prove stable. |
| 5 | Feed | Feed hooks compose cached project/task/PR entities; source-specific documents remain isolated | Removes repeated feed source refetches and connects task/PR/project data. |
| 6 | Tasks and steps read paths | Task/step hooks read Legend cache while agent message stream remains unchanged | Lets task UI benefit from normalized task/step data without touching hot stream behavior first. |
| 7 | Tasks and steps mutations/events | Task/step mutations and main events patch entities and feed indexes | Highest event value because agent sessions already push status/messages. |
| 8 | Project-adjacent CRUD | Commands, groups, run config, todos, MCP, permissions migrated in small hook batches | Smaller domains with fewer shared entities. |
| 9 | Settings/admin/static | Providers, tokens, settings, managed skills/agents, debug migrated as mostly document resources | Lower-risk cached documents and admin data. |
| 10 | Polling/external data | Pipelines, usage, memory, directory/file/doc resources migrated only where hooks are stable | Keeps external-service polling behavior unchanged until late. |
| 11 | Remove React Query | Provider/dependency deleted after `rg` confirms no imports | Final cleanup only after all slices prove stable. |

Keep `QueryClientProvider` until the final phase. Do not add a broad React Query compatibility bridge by default. If a specific dual-running slice needs legacy invalidation, add a narrow domain adapter in that slice and delete it when the domain finishes migration.

## Progressive Migration Contract

Every domain slice follows the same contract:

1. Keep exported hook names and return shapes compatible with current components.
2. Add or extend `src/cache/domains/<domain>.ts` with normalizers, selectors, resource keys, and targeted invalidation/stale helpers.
3. Replace one hook file or one tightly-coupled hook group at a time. Do not mix unrelated domains in one commit.
4. Keep React Query in untouched hooks. Do not remove `QueryClientProvider`, dependency, or old query keys until Phase 11.
5. Prefer read-path migration before write-path migration for high-traffic domains like pull requests, tasks, and steps.
6. For migrated mutations, patch Legend optimistically only when rollback is simple. Otherwise run the mutation, ingest returned data, and mark exact resources stale.
7. Wire main-process `CacheEvent` emissions only for the domain being migrated in that slice.
8. Add or update tests for the domain normalizer/event applier before switching hook internals.
9. Run targeted tests and `pnpm ts-check` for every slice. Run the full required verification before marking the slice done.
10. After each slice, migrated hook implementations must no longer call React Query. If a file still contains unmigrated hooks, use targeted searches such as `rg "useQuery\(|useInfiniteQuery\(" <file>` for read slices or `rg "useMutation\(|useQueryClient" <file>` for mutation slices. Repo-wide matches are expected until Phase 11.

Rollback rule: each slice should be revertible by one commit without breaking other slices. Cross-domain shared cache helpers should only grow in the foundation tasks or through small additive changes.

---

### Task 1: Verify Inventory Baseline

**Files:**
- Read: `src/app.tsx`
- Read: `src/hooks/use-pull-requests.ts`
- Read: `src/hooks/use-projects.ts`
- Read: `src/hooks/use-feed.ts`
- Read: `electron/preload.ts`
- Read: `src/lib/api.ts`
- Read: `electron/ipc/handlers.ts`

**Step 1: Count React Query usage**

Run:

```bash
rg -l "@tanstack/react-query" --glob '*.{ts,tsx}' | wc -l
rg -n "invalidateQueries" --glob '*.{ts,tsx}' | wc -l
rg -n "useQuery\(|useInfiniteQuery\(" --glob '*.{ts,tsx}' | wc -l
rg -n "useMutation\(" --glob '*.{ts,tsx}' | wc -l
```

Expected: numbers close to this plan's study findings. If numbers changed, update this plan or migration checklist before implementation.

**Step 2: Commit**

No code changes. No commit.

---

### Task 2: Add Shared Cache Event Types

**Files:**
- Create: `shared/cache-events.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add `CacheEvent` union**

Create `shared/cache-events.ts` with base event fields and the initial event union from the Cache Event Model section.

**Step 2: Export event listener API type**

In `src/lib/api.ts`, import `CacheEvent` and add:

```ts
cache: {
  onEvent: (callback: (event: CacheEvent) => void) => () => void;
};
```

Add the fallback implementation near the existing `api` fallback object:

```ts
cache: {
  onEvent: () => () => {},
},
```

**Step 3: Verify types**

Run: `pnpm ts-check`
Expected: PASS after preload implements the new API in the next task. If this task is committed before Task 3, expect a temporary type failure.

**Step 4: Commit**

```bash
git add shared/cache-events.ts src/lib/api.ts
git commit -m "feat: add cache event api types"
```

---

### Task 3: Add Main Cache Event Service and Preload Bridge

**Files:**
- Create: `electron/services/cache-event-service.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Implement service**

Create `cache-event-service.ts` with an explicit subscription registry:

```ts
import { BrowserWindow, type WebContents } from 'electron';
import { getCacheEventResourceKeys, matchesCacheSubscription, type CacheEvent, type CacheSubscriptionUpdate } from '@shared/cache-events';

const subscriptionsByWebContentsId = new Map<number, CacheSubscription[]>();
const revisionsByWebContentsId = new Map<number, number>();

export function setCacheSubscriptions(webContents: WebContents, update: CacheSubscriptionUpdate) {
  const currentRevision = revisionsByWebContentsId.get(webContents.id);
  if (currentRevision !== undefined && update.revision < currentRevision) return;
  revisionsByWebContentsId.set(webContents.id, update.revision);
  subscriptionsByWebContentsId.set(webContents.id, update.subscriptions);
}

export function emitCacheEvent(event: CacheEvent) {
  const resourceKeys = getCacheEventResourceKeys(event);
  for (const win of BrowserWindow.getAllWindows()) {
    const subscriptions = subscriptionsByWebContentsId.get(win.webContents.id) ?? [];
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      const subscribed = subscriptions.some((subscription) =>
        resourceKeys.some((key) => matchesCacheSubscription(subscription, key)),
      );
      if (subscribed) win.webContents.send('cache:event', event);
    }
  }
}
```

**Step 2: Expose listener in preload**

In `electron/preload.ts`, add a `cache` object to `contextBridge.exposeInMainWorld('api', ...)`:

```ts
cache: {
  setSubscriptions: (update: CacheSubscriptionUpdate) =>
    ipcRenderer.invoke('cache:setSubscriptions', update),
  onEvent: (callback: (event: CacheEvent) => void) => {
    const handler = (_: unknown, event: CacheEvent) => callback(event);
    ipcRenderer.on('cache:event', handler);
    return () => ipcRenderer.removeListener('cache:event', handler);
  },
},
```

Import cache event/subscription types from `@shared/cache-events`. Add an IPC handler for `cache:setSubscriptions` in `electron/ipc/handlers.ts` that validates shape, caps subscription count/key length, and calls `setCacheSubscriptions(event.sender, update)`.

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS.

**Step 4: Commit**

```bash
git add electron/services/cache-event-service.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: bridge cache events to renderer"
```

---

### Task 4: Add Renderer Cache Store Foundation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` after install
- Create: `src/cache/cache-types.ts`
- Create: `src/cache/cache-store.ts`
- Create: `src/cache/cache-actions.ts`
- Create: `src/cache/cache-events.ts`
- Create: `src/cache/cache-store.test.ts`

**Step 1: Add Legend-State dependency**

Run:

```bash
pnpm add @legendapp/state@beta
```

Expected: `package.json` and `pnpm-lock.yaml` update.

**Step 2: Define state shape**

In `cache-types.ts`, define:

```ts
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

export type ResourceMeta = {
  status: RequestStatus;
  error: string | null;
  lastFetchedAt: number | null;
  stale: boolean;
};

export type IndexResource = ResourceMeta & {
  ids: string[];
};

export type DocumentResource<T = unknown> = ResourceMeta & {
  data: T | undefined;
};

export type CacheState = {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  steps: Record<string, TaskStep>;
  providers: Record<string, Provider>;
  pullRequests: Record<string, CachedPullRequest>;
  workItems: Record<string, CachedWorkItem>;
  feedNotes: Record<string, FeedNote>;
  indexes: Record<string, IndexResource>;
  documents: Record<string, DocumentResource>;
  resources: Record<string, ResourceMeta>;
};
```

Import exact domain types from `@shared/*` and `@/lib/api` as needed. Keep cache-specific wrappers like `CachedPullRequest` in `cache-types.ts`.

**Step 3: Add Legend observable store**

In `cache-store.ts`, create the `cache$` observable shown in the Target Cache Model section.

**Step 4: Add generic actions**

In `cache-actions.ts`, add imperative helpers that update exact observable paths:

```ts
import type { Observable } from '@legendapp/state';

upsertEntity<T>(record$: Observable<Record<string, T>>, id: string, value: T): void
patchEntity<T>(record$: Observable<Record<string, T>>, id: string, patch: Partial<T>): void
deleteEntity<T>(record$: Observable<Record<string, T>>, id: string): void
setIndex(key: string, ids: string[], meta?: Partial<ResourceMeta>): void
setDocument<T>(key: string, data: T, meta?: Partial<ResourceMeta>): void
markResourceStale(key: string): void
```

Use `.set()`, `.assign()`, and `.delete()` on the narrowest observable path. Do not mutate values returned by `.get()`.

**Step 5: Add event applier skeleton**

In `cache-events.ts`, export `applyCacheEvent(event: CacheEvent)` with a switch statement. Implement only no-op/default first.

**Step 6: Test entity helpers**

In `cache-store.test.ts`, cover:

```ts
it('upserts an entity into the observable record')
it('patches one entity field without replacing unrelated entities')
it('deletes an entity from the observable record')
it('sets index metadata without touching entity records')
it('marks a document resource stale')
```

**Step 7: Verify**

Run: `pnpm test src/cache/cache-store.test.ts`
Expected: PASS.

**Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/cache/cache-types.ts src/cache/cache-store.ts src/cache/cache-actions.ts src/cache/cache-events.ts src/cache/cache-store.test.ts
git commit -m "feat: add legend cache store foundation"
```

---

### Task 5: Add Query and Mutation Helpers

**Files:**
- Create: `src/cache/use-cache-resource.ts`
- Create: `src/cache/use-cache-mutation.ts`
- Create: `src/cache/use-cache-resource.test.ts`

**Step 1: Implement request dedupe**

In `use-cache-resource.ts`, keep module-level maps:

```ts
const pendingLoads = new Map<string, Promise<void>>();
const abortControllers = new Map<string, AbortController>();
```

**Step 2: Implement `ensureResource`**

Add a function that:

| Step | Behavior |
| --- | --- |
| 1 | Return pending promise when same key is already loading. |
| 2 | Skip load when resource is fresh and `force !== true`. |
| 3 | Mark resource `loading`. |
| 4 | Await loader. |
| 5 | Run `ingest(result)` to normalize. |
| 6 | Mark resource `success` or `error`. |
| 7 | Remove pending entry. |

**Step 3: Implement hook**

`useCacheResource` should accept `key`, `enabled`, `staleTime`, `load`, `select`, and `ingest`. It should call `ensureResource` in an effect when enabled and stale/missing. It should use Legend's `useValue` to subscribe to selected observable paths and return `ResourceResult<T>`.

Example selector usage:

```ts
const data = useValue(() => select(cache$));
const meta = useValue(cache$.resources[key]);
```

Selector functions must read only the paths needed for the component. For a PR row, prefer `cache$.pullRequests[prKey].title.get()` over `cache$.pullRequests[prKey].get()` when only the title is needed.

**Step 4: Implement mutation helper**

`use-cache-mutation.ts` should provide local React state for mutation status with `mutate`, `mutateAsync`, `isPending`, and `error`. It should support `onMutate`, `mutationFn`, `onSuccess`, and `onError` options. Optimistic updates should patch Legend observables directly and return rollback functions.

**Step 5: Test dedupe and stale behavior**

In `use-cache-resource.test.ts`, test the non-React `ensureResource` helper:

```ts
it('dedupes concurrent loads for the same key')
it('does not reload fresh resources')
it('reloads stale resources')
it('stores error metadata when loader throws')
```

**Step 6: Verify**

Run: `pnpm test src/cache/use-cache-resource.test.ts`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/cache/use-cache-resource.ts src/cache/use-cache-mutation.ts src/cache/use-cache-resource.test.ts
git commit -m "feat: add Legend cache query helpers"
```

---

### Task 6: Wire Root Cache Listener

**Files:**
- Create: `src/cache/cache-listener.tsx`
- Modify: `src/app.tsx`

**Step 1: Add listener component**

In `cache-listener.tsx`, add:

```tsx
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { applyCacheEvent } from './cache-events';

export function CacheEventListener() {
  useEffect(() => api.cache.onEvent(applyCacheEvent), []);
  return null;
}
```

**Step 2: Mount listener**

In `src/app.tsx`, render `<CacheEventListener />` near other root listeners. Keep `QueryClientProvider` for now.

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/cache/cache-listener.tsx src/app.tsx
git commit -m "feat: listen for cache events in renderer"
```

---

### Task 7: Add Explicit Cache Subscription Registry

**Files:**
- Create: `src/cache/cache-subscriptions.ts`
- Modify: `src/cache/use-cache-resource.ts`
- Modify: `electron/services/cache-event-service.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add renderer subscription refcounts**

Create `cache-subscriptions.ts` with `subscribeCacheResources(subscriptions)`. It should keep refcounts per `resourceKey + includeChildren` and call `api.cache.setSubscriptions({ revision, subscriptions })` with the current unique subscriptions after every subscribe/unsubscribe.

**Step 2: Register subscriptions from `useCacheResource`**

Add an optional `subscriptions?: CacheSubscription[]` parameter. Default to `[{ resourceKey: key }]`. Use a stable serialized dependency so inline subscription arrays do not resubscribe every render. Watch resource metadata and refetch active resources when an event marks them stale; catch initial load rejections because error metadata already records failures.

**Step 3: Filter main-process event delivery**

`emitCacheEvent` should compute event resource keys and send only to windows with matching subscriptions. A subscription matches exact keys, or child keys when `includeChildren` is true.

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/cache/cache-subscriptions.ts src/cache/use-cache-resource.ts electron/services/cache-event-service.ts electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add explicit cache subscriptions"
```

---

### Task 8: Emit Project Events from Main

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Import event service**

Add:

```ts
import { emitCacheEvent } from '../services/cache-event-service';
```

**Step 2: Emit after project mutations**

Update handlers:

| Handler | Event |
| --- | --- |
| `projects:create` | `project.upsert` with created project |
| `projects:update` | `project.upsert` with updated project |
| `projects:uploadLogo` | `project.upsert` with returned project |
| `projects:generateLogo` | `project.upsert` with returned project |
| `projects:selectGeneratedLogo` | `project.upsert` with returned project |
| `projects:removeLogo` | `project.upsert` with returned project |
| `projects:delete` | `project.delete` |
| `projects:reorder` | one `project.upsert` per returned project, or a future `projects.reordered` event |

**Step 3: Keep existing feed cache invalidation**

Do not remove `invalidatePrCache()` or `invalidateWorkItemCache()` yet. Those are main-process feed caches and still needed until feed migration.

**Step 4: Verify**

Run: `pnpm test electron/services/project-logo-service.test.ts electron/services/project-summary-generation-service.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: emit project cache events"
```

---

### Task 9: Migrate Project Read Hooks

**Files:**
- Create: `src/cache/domains/projects.ts`
- Modify: `src/cache/cache-events.ts`
- Modify: `src/hooks/use-projects.ts`
- Test: `src/cache/domains/projects.test.ts`

**Step 1: Add project normalizers**

In `domains/projects.ts`, add pure functions:

```ts
ingestProjects(projects: Project[]): void
ingestProject(project: Project): void
removeProject(id: string): void
selectProjects(state): Project[]
selectProject(state, id: string): Project | undefined
```

**Step 2: Apply project events**

In `cache-events.ts`, handle `project.upsert`, `project.patch`, and `project.delete` by calling project domain actions.

**Step 3: Replace `useProjects` and `useProject` internals**

Keep exported hook names. Replace React Query with `useCacheResource` and project selectors.

**Step 4: Keep project mutations on React Query for this slice**

Existing project mutations can keep `useMutation` temporarily because Task 8 emits main-process project cache events after successful writes. That makes migrated read hooks update through the new event path while the mutation implementation remains unchanged.

**Step 5: Leave project-adjacent document hooks for a later slice**

Leave `useGeneratedProjectLogos`, `useProjectBranches`, `useProjectCurrentBranch`, and `useProjectIsGitRepository` on React Query. Migrate them in the document-resource slice unless project read migration exposes a concrete problem.

**Step 6: Test**

Add tests for list ingest, single upsert, delete, and reorder preserving order.

Run: `pnpm test src/cache/domains/projects.test.ts`
Expected: PASS.

**Step 7: Verify read hooks no longer call React Query**

Run: `rg "useQuery\(" src/hooks/use-projects.ts`
Expected: matches only project-adjacent document hooks that intentionally remain on React Query. `useProjects` and `useProject` should use `useCacheResource`.

**Step 8: Commit**

```bash
git add src/cache/domains/projects.ts src/cache/domains/projects.test.ts src/cache/cache-events.ts src/hooks/use-projects.ts electron/ipc/handlers.ts
git commit -m "feat: migrate project reads to cache"
```

---

### Task 10: Add Pull Request Domain Cache

**Files:**
- Create: `src/cache/domains/pull-requests.ts`
- Create: `src/cache/domains/pull-requests.test.ts`
- Modify: `src/cache/cache-store.ts`
- Modify: `src/cache/cache-events.ts`

**Step 1: Define PR keys**

Use:

```ts
export function prKey(projectId: string, pullRequestId: number) {
  return `${projectId}:${pullRequestId}`;
}

export function prListIndexKey(projectId: string, status: PullRequestStatus) {
  return `pullRequests:${projectId}:${status}`;
}
```

**Step 2: Add merge semantics**

List responses are summaries. Detail responses include description/autocomplete fields. Add merge functions that preserve detail-only fields when a later summary arrives.

```ts
ingestPullRequestSummary(projectId, pr)
ingestPullRequestDetail(projectId, pr)
ingestPullRequestList(projectId, status, prs)
patchPullRequest(projectId, prId, patch)
```

**Step 3: Add indexes**

Store:

| Index | Value |
| --- | --- |
| `pullRequests:${projectId}:${status}` | ordered PR entity IDs |
| `pullRequestCommits:${projectId}:${prId}` | document resource |
| `pullRequestChanges:${projectId}:${prId}` | document resource |
| `pullRequestThreads:${projectId}:${prId}` | document resource initially |
| `pullRequestWorkItems:${projectId}:${prId}` | work item entity IDs or document initially |
| `pullRequestPolicyEvaluations:${projectId}:${prId}` | document resource |

**Step 4: Apply PR events**

Handle `pullRequest.upsert`, `pullRequest.patch`, and `pullRequest.threadsChanged` in `cache-events.ts`.

**Step 5: Test**

Tests:

```ts
it('deduplicates same PR from list and detail')
it('preserves detail description when summary arrives later')
it('updates list index without duplicating ids')
it('patches title across detail and list selectors')
it('marks threads document stale on threadsChanged event')
```

Run: `pnpm test src/cache/domains/pull-requests.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/cache/domains/pull-requests.ts src/cache/domains/pull-requests.test.ts src/cache/cache-store.ts src/cache/cache-events.ts
git commit -m "feat: add normalized pull request cache"
```

---

### Task 11: Migrate Pull Request Query Hooks

**Files:**
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `src/features/pull-request/ui-pr-sidebar-list/index.tsx` only if hook return shape needs minor adjustment

**Step 1: Replace `usePullRequests`**

Use `useCacheResource` keyed by `pullRequests:${projectId}:${status}`. Loader calls `api.azureDevOps.listPullRequests`. Ingest writes PR summaries and list index. Selector returns PR entities for that index.

**Step 2: Replace `useAllProjectsPullRequests`**

Do not fetch a separate all-projects cache document. Ensure per-project list resources for each repo-enabled project, then derive a combined sorted array from normalized per-project indexes. Add `projectId`, `projectName`, and `projectColor` in the selector.

**Step 3: Replace `usePullRequest`**

Use resource key `pullRequest:${projectId}:${prId}`. Loader calls `getPullRequest`. Ingest detail into same PR entity.

**Step 4: Replace PR document hooks**

Migrate commits, changes, file content, threads, work items, policy evaluations, and current Azure user to document resources with same stale times as current hooks.

**Step 5: Keep exported mutation hook names but leave internals for next task**

Query hooks should land separately from mutation hooks even though `src/hooks/use-pull-requests.ts` still imports `useMutation` and `useQueryClient`. Do not remove React Query from this file until Task 12.

**Step 6: Verify no duplicate all-project fetch document**

Manual check: switching PR sidebar from a single project to all projects should reuse per-project list caches when fresh.

**Step 7: Verify**

Run:

```bash
rg "useQuery\(|useInfiniteQuery\(" src/hooks/use-pull-requests.ts
pnpm ts-check
```

Expected: no query hook matches in the hook file; `useMutation`/`useQueryClient` may remain for Task 12. TypeScript PASS.

**Step 8: Commit**

```bash
git add src/hooks/use-pull-requests.ts src/features/pull-request/ui-pr-sidebar-list/index.tsx
git commit -m "feat: migrate pull request queries to normalized cache"
```

---

### Task 12: Migrate Pull Request Mutations and Events

**Files:**
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `electron/ipc/handlers.ts`

**Step 1: Replace title/description mutation internals**

On success, ingest returned PR detail into normalized cache. Do not invalidate list/all/feed keys.

**Step 2: Replace vote/autocomplete/publish mutation internals**

For mutations returning no PR object, either call a targeted detail refetch or emit `pullRequest.patch`/`resource.invalidate` from main. Prefer patch when the API returns enough data.

**Step 3: Replace comment/thread mutations**

For comment add/reply/status changes, mark only `pullRequestThreads:${projectId}:${prId}` stale or patch the thread document if service returns updated thread data.

**Step 4: Emit main events after PR mutations**

In handlers for Azure DevOps PR mutations, emit:

| Handler | Event |
| --- | --- |
| `azureDevOps:updatePullRequestTitle` | `pullRequest.upsert` with updated PR |
| `azureDevOps:updatePullRequestDescription` | `pullRequest.upsert` with updated PR |
| `azureDevOps:addPullRequestComment` | `pullRequest.threadsChanged` |
| `azureDevOps:addPullRequestFileComment` | `pullRequest.threadsChanged` |
| `azureDevOps:addThreadReply` | `pullRequest.threadsChanged` |
| `azureDevOps:updateThreadStatus` | `pullRequest.threadsChanged` |
| `azureDevOps:votePullRequest` | `resource.invalidate` for PR detail or `pullRequest.patch` when data is available |
| `azureDevOps:setPullRequestAutoComplete` | `resource.invalidate` for PR detail or `pullRequest.patch` when data is available |
| `azureDevOps:publishPullRequest` | `resource.invalidate` for PR detail and list index |

**Step 5: Verify PR mutation UX**

Manual dev check:

| Action | Expected |
| --- | --- |
| Edit PR title | Header and sidebar update without list refetch. |
| Edit PR description | Overview updates without list refetch. |
| Add thread reply | Only thread document refetches. |
| Publish draft PR | Detail/list update or only exact PR/list resource invalidates. |

**Step 6: Verify**

Run: `pnpm ts-check`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/hooks/use-pull-requests.ts electron/ipc/handlers.ts
git commit -m "feat: migrate pull request mutations to cache events"
```

---

### Task 13: Remove PR Detail Direct QueryClient Usage

**Files:**
- Modify: `src/features/pull-request/ui-pr-detail/index.tsx`
- Modify: `src/hooks/use-pr-view-snapshot.ts`
- Modify: `src/cache/domains/feed.ts` if created in this task

**Step 1: Replace feed `setQueryData` in PR detail**

Current code patches `feedQueryKeys.pullRequests` when recording a PR view. Replace with a cache action that marks the PR feed item viewed or patches PR activity metadata.

**Step 2: Replace `useRecordPrView` mutation**

Use `useCacheMutation` or a simple async hook since it is a fire-and-forget side effect.

**Step 3: Emit event from main if persisted snapshot changes feed activity**

After `pr-snapshots:record`, emit `feed.sourceChanged` for `pullRequests` or a future granular PR activity patch.

**Step 4: Verify**

Run:

```bash
rg "@tanstack/react-query|useQueryClient|setQueryData" src/features/pull-request/ui-pr-detail/index.tsx src/hooks/use-pr-view-snapshot.ts
pnpm ts-check
```

Expected: no React Query matches in target files; TypeScript PASS.

**Step 5: Commit**

```bash
git add src/features/pull-request/ui-pr-detail/index.tsx src/hooks/use-pr-view-snapshot.ts src/cache/domains/feed.ts electron/ipc/handlers.ts
git commit -m "feat: move pr view state into normalized cache"
```

---

### Task 14: Migrate Feed Queries

**Files:**
- Create: `src/cache/domains/feed.ts`
- Modify: `src/hooks/use-feed.ts`
- Modify: `src/hooks/use-feed-notes.ts`
- Modify: `electron/ipc/handlers.ts`

**Step 1: Treat feed as view state, not canonical entity data**

Store feed source indexes separately:

| Feed source | Index key |
| --- | --- |
| tasks | `feed:tasks` |
| pull requests | `feed:pullRequests` |
| notes | `feed:notes` |
| work items | `feed:workItems` |

Start by storing full `FeedItem` documents in the feed domain. Later derive fields from canonical task/PR/project entities where safe.

**Step 2: Replace four feed `useQuery` calls**

Use four `useCacheResource` calls with existing `api.feed.get*Items` functions and same 3-minute focused refetch behavior until main push events cover all sources.

**Step 3: Replace feed note mutations**

On note create/update/delete, patch feed note entity/index locally and emit `feed.sourceChanged` from main after persistence.

**Step 4: Preserve current partition logic**

Do not refactor `partitionFeedItems` or feed UI preferences in this task.

**Step 5: Verify**

Run:

```bash
rg "@tanstack/react-query|useQuery\(|useMutation\(" src/hooks/use-feed.ts src/hooks/use-feed-notes.ts
pnpm test src/lib/use-feed-partition.test.ts
pnpm ts-check
```

Expected: no React Query matches in target files; tests and TypeScript PASS.

**Step 6: Commit**

```bash
git add src/cache/domains/feed.ts src/hooks/use-feed.ts src/hooks/use-feed-notes.ts electron/ipc/handlers.ts
git commit -m "feat: migrate feed queries to Legend cache"
```

---

### Task 15: Migrate Task and Step Read Hooks

**Files:**
- Create: `src/cache/domains/tasks.ts`
- Create: `src/cache/domains/steps.ts`
- Modify: `src/hooks/use-tasks.ts`
- Modify: `src/hooks/use-steps.ts`
- Modify: `src/hooks/use-task-summary.ts`

**Step 1: Add task and step normalizers**

Normalize task lists by IDs:

| Current hook | New index |
| --- | --- |
| `useTasks` | `tasks:all` |
| `useProjectTasks(projectId)` | `tasks:project:${projectId}` |
| `useAllActiveTasks` | `tasks:allActive` |
| `useAllCompletedTasks({ limit })` | document/infinite resource initially |
| `useTask(id)` | entity lookup + `task:${id}` resource metadata |
| `useSteps(taskId)` | `steps:task:${taskId}` |
| `useStep(stepId)` | entity lookup + `step:${stepId}` resource metadata |

**Step 2: Replace read hook internals only**

Migrate `useTasks`, `useProjectTasks`, `useAllActiveTasks`, `useAllCompletedTasks`, `useTask`, `useSteps`, `useStep`, and `useTaskSummary` to `useCacheResource` or document resources. Keep exported mutation hook names in the same files but leave their React Query internals for Task 16.

**Step 3: Keep completed infinite list simple**

Do not build custom infinite query machinery first. Store completed pages as a document resource keyed by limit/offset, or add a small `useCacheInfiniteResource` only for this one hook.

**Step 4: Verify read migration**

Run:

```bash
rg "useQuery\(|useInfiniteQuery\(" src/hooks/use-tasks.ts src/hooks/use-steps.ts src/hooks/use-task-summary.ts
pnpm ts-check
```

Expected: no read-query matches in target files. `useMutation` and `useQueryClient` may remain for Task 16. TypeScript PASS.

**Step 5: Commit**

```bash
git add src/cache/domains/tasks.ts src/cache/domains/steps.ts src/hooks/use-tasks.ts src/hooks/use-steps.ts src/hooks/use-task-summary.ts
git commit -m "feat: migrate task read hooks to cache"
```

---

### Task 16: Migrate Task and Step Mutations and Events

**Files:**
- Modify: `src/cache/domains/tasks.ts`
- Modify: `src/cache/domains/steps.ts`
- Modify: `src/hooks/use-tasks.ts`
- Modify: `src/hooks/use-steps.ts`
- Modify: `src/hooks/use-task-summary.ts`
- Modify: `src/features/agent/task-message-manager/index.tsx`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/services/agent-service.ts` if emitting task/step events belongs closer to agent state transitions

**Step 1: Emit main events for task/step mutations**

Emit `task.upsert`, `task.patch`, `task.delete`, `step.upsert`, and `step.patch` after handlers mutate repositories.

**Step 2: Replace task and step mutation internals**

Use `useCacheMutation`. Preserve side effects that clear run command logs and background job handling.

This task may be split into smaller commits if the diff grows: task lifecycle mutations, task permission/tool mutations, step mutations, then summary generation.

**Step 3: Replace `task-message-manager` invalidations**

Current agent events invalidate task, step, feed, worktree diff, and file-content queries. Replace with cache actions:

| Agent event effect | New action |
| --- | --- |
| Task status changed | `task.patch` or mark task resource stale |
| Step status changed | `step.patch` |
| Tool writes file | mark `worktreeDiff:${taskId}` and related file content docs stale |
| Permission/question state changes | update existing `task-messages` Zustand store and patch feed source if needed |

**Step 4: Verify mutation/event migration**

Run:

```bash
rg "@tanstack/react-query|useQuery\(|useMutation\(|useQueryClient" src/hooks/use-tasks.ts src/hooks/use-steps.ts src/hooks/use-task-summary.ts src/features/agent/task-message-manager/index.tsx
pnpm test electron/services/agent-service.test.ts electron/services/session-summary-service.test.ts
pnpm ts-check
```

Expected: no React Query matches in target files; relevant tests and TypeScript PASS. If listed tests do not exist, run nearest existing agent/task tests plus full `pnpm test` at phase end.

**Step 5: Commit**

```bash
git add src/cache/domains/tasks.ts src/cache/domains/steps.ts src/hooks/use-tasks.ts src/hooks/use-steps.ts src/hooks/use-task-summary.ts src/features/agent/task-message-manager/index.tsx electron/ipc/handlers.ts electron/services/agent-service.ts
git commit -m "feat: migrate task and step cache"
```

---

### Task 17: Migrate Worktree and File Document Resources

**Files:**
- Modify: `src/hooks/use-worktree-diff.ts`
- Modify: `src/hooks/use-task-root-path.ts`
- Modify: `src/hooks/use-project-file-paths.ts`
- Modify: `src/hooks/use-directory-listing.ts`
- Modify: `src/hooks/use-package-scripts.ts`
- Modify: `src/features/agent/ui-worktree-review-view/index.tsx`
- Modify: `src/features/task/ui-task-panel/file-explorer-pane/index.tsx`

**Step 1: Use document resources**

Keep worktree/file payloads as documents with targeted stale keys.

**Step 2: Preserve existing side effects**

Worktree commit/merge/push/delete mutations still trigger background jobs and task updates. Replace query invalidations with document stale marks and task patches.

**Step 3: Verify**

Run:

```bash
rg "@tanstack/react-query|useQuery\(|useMutation\(|useQueryClient" src/hooks/use-worktree-diff.ts src/hooks/use-task-root-path.ts src/hooks/use-project-file-paths.ts src/hooks/use-directory-listing.ts src/hooks/use-package-scripts.ts src/features/agent/ui-worktree-review-view/index.tsx src/features/task/ui-task-panel/file-explorer-pane/index.tsx
pnpm ts-check
```

Expected: no React Query matches in target files; TypeScript PASS.

**Step 4: Commit**

```bash
git add src/hooks/use-worktree-diff.ts src/hooks/use-task-root-path.ts src/hooks/use-project-file-paths.ts src/hooks/use-directory-listing.ts src/hooks/use-package-scripts.ts src/features/agent/ui-worktree-review-view/index.tsx src/features/task/ui-task-panel/file-explorer-pane/index.tsx
git commit -m "feat: migrate worktree document cache"
```

---

### Task 18: Migrate Project-Adjacent CRUD Hooks

**Files:**
- Modify: `src/hooks/use-project-commands.ts`
- Modify: `src/hooks/use-project-command-groups.ts`
- Modify: `src/hooks/use-project-run-config.ts`
- Modify: `src/hooks/use-project-todos.ts`
- Modify: `src/hooks/use-project-permissions.ts`
- Modify: `src/hooks/use-global-permissions.ts`
- Modify: `src/hooks/use-mcp-templates.ts`
- Modify: `electron/ipc/handlers.ts`

**Step 1: Use entity tables where IDs exist**

Commands, groups, todos, templates, overrides, and permissions should each use either entity tables plus project indexes or document resources if shape is small and not shared.

**Step 2: Replace optimistic reorder logic**

Move current `getQueryData`/`setQueryData` reorder logic into domain cache actions so command/group/todo reorder updates stay local and rollback on error.

**Step 3: Emit events from main**

Emit project-adjacent `resource.invalidate` events first. Add granular events only for domains that are shared across multiple views.

**Step 4: Verify**

Run:

```bash
rg "@tanstack/react-query|useQuery\(|useMutation\(|useQueryClient" src/hooks/use-project-commands.ts src/hooks/use-project-command-groups.ts src/hooks/use-project-run-config.ts src/hooks/use-project-todos.ts src/hooks/use-project-permissions.ts src/hooks/use-global-permissions.ts src/hooks/use-mcp-templates.ts
pnpm ts-check
```

Expected: no React Query matches in target files; TypeScript PASS.

**Step 5: Commit**

```bash
git add src/hooks/use-project-commands.ts src/hooks/use-project-command-groups.ts src/hooks/use-project-run-config.ts src/hooks/use-project-todos.ts src/hooks/use-project-permissions.ts src/hooks/use-global-permissions.ts src/hooks/use-mcp-templates.ts electron/ipc/handlers.ts
git commit -m "feat: migrate project crud hooks to cache"
```

---

### Task 19: Migrate Settings, Providers, Tokens, Skills, Agents

**Files:**
- Modify: `src/hooks/use-settings.ts`
- Modify: `src/hooks/use-providers.ts`
- Modify: `src/hooks/use-tokens.ts`
- Modify: `src/hooks/use-skills.ts`
- Modify: `src/hooks/use-managed-skills.ts`
- Modify: `src/hooks/use-managed-agents.ts`
- Modify: `src/hooks/use-enabled-backends.ts`
- Modify: `src/hooks/use-backend-models.ts`
- Modify: `src/hooks/use-model.ts`
- Modify: `electron/ipc/handlers.ts`

**Step 1: Use document resources for settings**

Settings are key-value documents. Keep optimistic updates currently in `use-settings.ts`, but move rollback into `useCacheMutation`.

**Step 2: Use entity tables for providers/tokens**

Providers and token metadata are shared by settings, PRs, work items, pipelines, and Azure users.

**Step 3: Use document resources for managed skill/agent lists initially**

Skill/agent content is path-keyed and can stay document-based unless duplicated UI becomes an issue.

**Step 4: Verify**

Run:

```bash
rg "@tanstack/react-query|useQuery\(|useMutation\(|useQueryClient" src/hooks/use-settings.ts src/hooks/use-providers.ts src/hooks/use-tokens.ts src/hooks/use-skills.ts src/hooks/use-managed-skills.ts src/hooks/use-managed-agents.ts src/hooks/use-enabled-backends.ts src/hooks/use-backend-models.ts src/hooks/use-model.ts
pnpm ts-check
```

Expected: no React Query matches in target files; TypeScript PASS.

**Step 5: Commit**

```bash
git add src/hooks/use-settings.ts src/hooks/use-providers.ts src/hooks/use-tokens.ts src/hooks/use-skills.ts src/hooks/use-managed-skills.ts src/hooks/use-managed-agents.ts src/hooks/use-enabled-backends.ts src/hooks/use-backend-models.ts src/hooks/use-model.ts electron/ipc/handlers.ts
git commit -m "feat: migrate settings and management hooks"
```

---

### Task 20: Migrate External/Polling Resources

**Files:**
- Modify: `src/hooks/use-work-items.ts`
- Modify: `src/hooks/use-pipeline-runs.ts`
- Modify: `src/hooks/use-tracked-pipelines.ts`
- Modify: `src/hooks/use-usage.ts`
- Modify: `src/hooks/use-usage-history.ts`
- Modify: `src/hooks/use-memory-usage.ts`
- Modify: `src/hooks/use-debug.ts`
- Modify: `src/hooks/use-messages-with-raw-data.ts`
- Modify: `src/features/pull-request/ui-pr-pipeline-pane/use-build-detail.ts`
- Modify: `src/features/pull-request/ui-pr-work-items/index.tsx`
- Modify: `src/features/activity-center/ui-activity-center-overlay/index.tsx`
- Modify: `src/features/background-jobs/ui-background-jobs-overlay/index.tsx`

**Step 1: Keep polling where external systems do not push**

Usage, memory, pipeline runs, policy evaluations, and Azure work items can keep polling through `useCacheResource` until main has watchers for those systems.

**Step 2: Normalize work items**

Store work item entities by `${providerId}:${workItemId}` and store query result indexes by filter key. Updating one work item state should patch entity and leave list indexes intact.

**Step 3: Keep pipeline details as documents**

Pipeline runs/details/timelines are external documents keyed by provider/project/build/release IDs.

**Step 4: Verify**

Run:

```bash
rg "@tanstack/react-query" src/hooks src/features | wc -l
pnpm ts-check
```

Expected: zero or only files intentionally deferred. TypeScript PASS.

**Step 5: Commit**

```bash
git add src/hooks/use-work-items.ts src/hooks/use-pipeline-runs.ts src/hooks/use-tracked-pipelines.ts src/hooks/use-usage.ts src/hooks/use-usage-history.ts src/hooks/use-memory-usage.ts src/hooks/use-debug.ts src/hooks/use-messages-with-raw-data.ts src/features/pull-request/ui-pr-pipeline-pane/use-build-detail.ts src/features/pull-request/ui-pr-work-items/index.tsx src/features/activity-center/ui-activity-center-overlay/index.tsx src/features/background-jobs/ui-background-jobs-overlay/index.tsx
git commit -m "feat: migrate external resource hooks"
```

---

### Task 21: Remove React Query from Root and Dependencies

**Files:**
- Modify: `src/app.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` after install

**Step 1: Confirm no imports remain**

Run:

```bash
rg "@tanstack/react-query|QueryClient|QueryClientProvider|useQueryClient|invalidateQueries|setQueryData|getQueryData" --glob '*.{ts,tsx}'
```

Expected: no matches.

**Step 2: Remove root provider**

In `src/app.tsx`, remove `QueryClient`, `QueryClientProvider`, and `queryClient`.

**Step 3: Remove dependency**

Run: `pnpm remove @tanstack/react-query`

Expected: `package.json` and `pnpm-lock.yaml` update.

**Step 4: Verify full app**

Run:

```bash
pnpm install
pnpm test
pnpm lint --fix
pnpm ts-check
pnpm lint
```

Expected: all pass. Inspect any lint changes before commit.

**Step 5: Commit**

```bash
git add src/app.tsx package.json pnpm-lock.yaml src/cache
git add -u
git commit -m "chore: remove react query cache layer"
```

---

### Task 22: Performance and Behavior Verification

**Files:**
- Create or update: `docs/plans/2026-05-31-react-query-cache-migration-verification.md` if detailed results are worth preserving

**Step 1: Measure duplicate fetch reduction**

Use dev tools or temporary debug logging around `api.azureDevOps.listPullRequests` and `api.azureDevOps.getPullRequest`.

Scenario:

| Action | Expected after migration |
| --- | --- |
| Open PR sidebar for project | one list fetch per status/project when stale |
| Open PR detail from sidebar | one detail fetch, list entity reused |
| Switch to all-project PR view | no duplicate fetch for already-fresh project/status indexes |
| Edit PR title | no full PR list refetch |
| Add PR comment | only PR threads resource refetches or patches |

**Step 2: Measure render behavior**

Use React Profiler for PR sidebar and PR detail:

| Update | Expected render scope |
| --- | --- |
| PR title patch | affected PR row/header only, not whole app shell |
| Project summary patch | project cards/feed items using summary only |
| Task status event | affected task row/feed item and step bar |

**Step 3: Validate event recovery**

Reload renderer while main is running. Initial resource fetches should rebuild snapshots. Missed events should not corrupt cache because snapshots are canonical.

**Step 4: Validate stale data recovery**

Reload renderer while main is running, then revisit migrated pages. Expected: resource fetches rebuild canonical snapshots even though events missed during reload are not replayed.

**Step 5: Commit docs if created**

```bash
git add docs/plans/2026-05-31-react-query-cache-migration-verification.md
git commit -m "docs: record cache migration verification"
```

## Risk Controls

| Risk | Mitigation |
| --- | --- |
| New cache subtly diverges from main data | Treat IPC fetch snapshots as canonical; events are optimization, not only source. |
| Too much cache infrastructure | Keep generic resource loading tiny. Put complexity in domain actions with tests. |
| Out-of-order events | Prefer full entity upserts after writes. For high-risk domains, compare entity `updatedAt`/revision before applying older patches. |
| Accidental broad rerenders | Use narrow `useValue` reads and split hot rows into child components that observe exact fields. |
| Raw data mutation bypasses notifications | Never mutate values returned by `.get()` or `.peek()`. Use `.set()`, `.assign()`, `.delete()`, `.push()`, or cache actions. |
| Legend-State v3 beta changes | Isolate Legend usage behind `src/cache/*` and hook wrappers so replacement remains bounded. |
| Infinite query replacement grows scope | Keep completed-task pages as documents first. Build generic infinite helper only if second use appears. |
| External services lack push events | Keep polling via `useCacheResource` until a main watcher exists. |
| Dual-running stale data | Avoid broad compatibility bridges. Add narrow domain adapters only when a slice proves it needs legacy invalidation. |
| Over-normalizing large documents | Keep diffs, file contents, raw messages, timelines, and logs document-based. |

## Success Criteria

| Area | Criteria |
| --- | --- |
| Dependency | `@legendapp/state` installed and `@tanstack/react-query` removed from `package.json`. |
| Code search | `rg "@tanstack/react-query|useQuery\(|useMutation\(|useQueryClient" src electron shared` has no migrated-app matches. |
| PR cache | List, all-project list, detail, and feed all share one PR entity per `${projectId}:${prId}`. |
| Updates | Project/task/step/PR mutations apply local patches and main emits events. |
| Refetching | Broad invalidations are replaced by entity patches or targeted resource stale marks. |
| Tests | Cache normalizer/event tests cover idempotency, stale events, index updates, and rollback paths. |
| Verification | `pnpm install`, `pnpm test`, `pnpm lint --fix`, `pnpm ts-check`, and `pnpm lint` pass. |

## Chosen Direction

Use Legend-State for the normalized server cache. Keep Zustand for existing UI stores. Do not run a TanStack DB spike unless Legend-State fails the PR pilot on event ingestion, render scope, or migration ergonomics.
