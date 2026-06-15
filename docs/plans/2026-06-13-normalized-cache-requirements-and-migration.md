# Normalized Cache Requirements And Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define normalized server-state cache requirements, verify current cache foundation against them, then migrate each entity family without broad refetch storms.

**Architecture:** Electron main remains source of truth for persistence and external service writes. Renderer owns a normalized Legend-State cache with entity records, relation indexes, document resources, granular event application, active-use tracking, and field-level selectors. React Query remains only for unmigrated slices until each entity family has read paths, mutation sync, event handling, and GC coverage.

**Tech Stack:** TypeScript, Electron IPC, Legend-State, React 19, Vitest, existing `window.api` preload bridge, existing React Query during transition.

---

## Product Requirements

| Requirement | Detail | Why |
| --- | --- | --- |
| Single entity source | Each logical entity has one canonical cache record. | Avoid duplicate query documents drifting. |
| Stable entity identity | Entity key must use real domain identity, not UI ownership. | Same entity can appear through feed, detail pages, lists, and relations. |
| Partial shape merge | List, feed, detail, mutation, and event payloads can hydrate same entity with different field coverage. | Avoid overfetching while preserving richer data. |
| No data downgrade | Smaller payload must not erase richer known fields. | Opening detail page should improve cache, not be undone by feed/list refresh. |
| Foreign-key joins | Main should send IDs/relations where possible; renderer joins entities. | Reduce duplicated project/task/PR fields in feed payloads. |
| Granular change events | Main emits patch/upsert/delete/invalidate events after successful writes. | Mutations update visible UI immediately without invalidating whole domains. |
| Event relevance | Main may filter events by subscriptions, and renderer must also be able to ignore irrelevant events. | Correctness should not depend on main-side optimization. |
| Active-use tracking | Cache tracks mounted resources/selectors and releases unused data after TTL. | Bound memory while allowing fast back/forward navigation. |
| Minimal selectors | UI reads exact fields it needs through small hooks/selectors. | Minimize rerenders when unrelated fields change. |
| Canonical repair | Stale/missed events are repaired by scoped refetch. | Keep event system simple, no replay log initially. |
| Mutation immediacy | Mutation success patches normalized cache and emits event to other windows. | Feed/detail/list should update in same interaction. |
| Gradual migration | Existing hook names remain compatible while internals migrate. | Keep slices shippable and rollback-safe. |

## Entity Identity Rules

| Entity | Canonical key | Notes |
| --- | --- | --- |
| Project | `project:${projectId}` | Project is local app entity. |
| Task | `task:${taskId}` | Task belongs to project through `projectId` field, not key. |
| Task step | `step:${stepId}` | Step belongs to task through `taskId` field. |
| Pull request | `pullRequest:${providerId}:${repoId}:${pullRequestId}` | Do not key by `projectId`; project is one consumer/relation, not PR identity. |
| Pull request thread | `pullRequestThread:${providerId}:${repoId}:${pullRequestId}:${threadId}` | Thread identity follows PR identity. |
| Work item | `workItem:${providerId}:${workItemId}` | Provider scope prevents ID collisions. |
| Feed note | `feedNote:${noteId}` | Local app entity. |
| Provider | `provider:${providerId}` | Shared by projects, PRs, work items. |
| Token metadata | `token:${tokenId}` | Secret value should not be cached in renderer unless already exposed today. |

Relation/index keys are separate from entity identity:

| Relation/index | Key |
| --- | --- |
| Project list | `projects` |
| Project tasks | `tasks:project:${projectId}` |
| Task steps | `steps:task:${taskId}` |
| Project PRs | `pullRequests:project:${projectId}` |
| Repo PRs | `pullRequests:repo:${providerId}:${repoId}` |
| Project work items | `workItems:project:${projectId}` |
| Feed source | `feed:${source}` |

## Merge Contract

| Payload kind | Meaning | Merge rule |
| --- | --- | --- |
| Snapshot summary | Known subset from list/feed. | Merge present fields; keep absent fields. |
| Snapshot detail | Rich canonical read. | Merge present fields; mark detail scope loaded. |
| Patch | Mutation/event field change. | Apply present fields exactly. |
| `undefined` | Field absent from payload. | Ignore. |
| `null` | Field intentionally cleared. | Store null. |
| Delete | Entity removed or no longer accessible. | Remove entity and related index entries. |

Each entity domain should track loaded scopes when useful:

| Scope | Example |
| --- | --- |
| `summary` | Feed/list fields loaded. |
| `detail` | Full detail view fields loaded. |
| `threads` | PR threads loaded. |
| `diff` | PR/task diff documents loaded. |

Rule: lower scope never clears higher-scope-only fields.

## Event Model Requirements

| Requirement | Detail |
| --- | --- |
| Event resource keys | Every event maps to all affected entity and relation keys. |
| Main filtering optional | Main can avoid sending irrelevant events using subscriptions. |
| Renderer ignore required | Renderer should check active subscriptions/retained resources before applying event payloads when possible. |
| Idempotent apply | Applying same event twice must be safe. |
| No event sequence initially | Refetch repairs missed/out-of-order cases. |
| Scoped invalidation | Prefer `pullRequest.patch` over `feed.invalidate`; prefer `feed.sourceChanged` over all-feed invalidation. |

## Current Implementation Assessment

| Requirement | Current state | Gap |
| --- | --- | --- |
| Normalized store | `src/cache/cache-store.ts` has entities, indexes, documents, resources. | Only projects actively use it. |
| Load dedupe | `ensureResource` dedupes by resource key. | No batch loader yet. |
| Subscriptions | Renderer sends subscription set; main filters events. | Renderer does not independently ignore irrelevant received events. |
| Granular events | Project events exist. Feed source events started. | Task/step/PR/work-item events not wired to mutations. |
| Merge contract | Project upsert/patch works for simple full records. | No generic no-downgrade merge helpers or scope tests. |
| Field selectors | Legend can support path-level reads. | Current hooks return whole projects; feed card hook can load per card. |
| GC | Resources and projects have TTL cleanup. | Need generic entity/index relation cleanup. |
| Mutation immediacy | Some React Query invalidations narrowed. | Most mutations still rely on query invalidation/refetch. |
| Feed joins | Feed uses live project data for some fields. | Feed still stores duplicated task/PR/work-item/project fields. |
| Stale during load | Change version preserves stale on successful older response. | Failed older response can clear stale marker. |

## Foundation Hardening Plan

### Task 1: Document Entity Key Helpers

**Files:**
- Modify: `src/cache/README.md`
- Create or Modify: `src/cache/domains/pull-requests.ts`
- Test: `src/cache/domains/pull-requests.test.ts`

**Steps:**
1. Add PR key helper using provider/repo identity: `pullRequestResourceKey({ providerId, repoId, pullRequestId })`.
2. Add relation key helpers: `projectPullRequestsResourceKey(projectId)`, `repoPullRequestsResourceKey({ providerId, repoId })`.
3. Test that PR key does not include `projectId`.
4. Run: `pnpm vitest src/cache/domains/pull-requests.test.ts`

### Task 2: Add No-Downgrade Merge Helper

**Files:**
- Create: `src/cache/entity-merge.ts`
- Test: `src/cache/entity-merge.test.ts`

**Steps:**
1. Write tests for absent fields, null clearing, detail fields surviving summary merge.
2. Implement `mergeEntitySnapshot(current, snapshot)` that ignores `undefined` fields.
3. Implement `applyEntityPatch(current, patch)` that applies present fields including `null`.
4. Run: `pnpm vitest src/cache/entity-merge.test.ts`

### Task 3: Preserve Stale Marker On Failed Older Loads

**Files:**
- Modify: `src/cache/use-cache-resource.ts`
- Test: `src/cache/use-cache-resource.test.ts`

**Steps:**
1. Add failing test: mark resource stale during in-flight load, make load reject, expect `stale:true`.
2. Update error path to preserve stale when resource changed during load.
3. Run: `pnpm vitest src/cache/use-cache-resource.test.ts`

### Task 4: Renderer-Side Event Relevance Guard

**Files:**
- Modify: `src/cache/cache-subscriptions.ts`
- Modify: `src/cache/cache-listener.tsx`
- Test: `src/cache/cache-listener.test.ts`

**Steps:**
1. Expose `shouldApplyCacheEvent(event)` based on current subscription set or retained resource keys.
2. Keep main filtering as optimization only.
3. In `CacheListener`, ignore irrelevant events before `applyCacheEvent`.
4. Test that unrelated event does not stale/write cache when no matching active resource exists.
5. Run: `pnpm vitest src/cache/cache-listener.test.ts`

### Task 5: Field Selector Hook Pattern

**Files:**
- Modify: `src/cache/domains/projects.ts`
- Modify: `src/hooks/use-projects.ts`
- Test: `src/cache/domains/projects.test.ts`

**Steps:**
1. Add selectors for `name`, `color`, `logoPath`, `prPriority`, `workItemPriority`.
2. Add small hooks: `useProjectName`, `useProjectLogoFields`, `useProjectFeedPriority`.
3. Replace feed card per-card `useProject` with field selectors or parent-provided project map.
4. Run: `pnpm vitest src/cache/domains/projects.test.ts src/hooks/use-feed.test.ts`

### Task 6: Generic Entity GC Contract

**Files:**
- Modify: `src/cache/cache-gc.ts`
- Test: `src/cache/cache-gc.test.ts`

**Steps:**
1. Add tests for entity kept by retained index.
2. Add tests for entity removed when no retained resource/index references it after TTL.
3. Generalize project-only GC pattern enough for next entities.
4. Run: `pnpm vitest src/cache/cache-gc.test.ts`

## Entity Migration Plan

### Phase 1: Projects Finish

**Goal:** Project data becomes first complete normalized domain.

**Files:**
- Modify: `src/hooks/use-projects.ts`
- Modify: `src/cache/domains/projects.ts`
- Modify: `electron/ipc/handlers.ts`
- Test: `src/cache/domains/projects.test.ts`, `src/hooks/use-feed.test.ts`

**Steps:**
1. Replace broad project React Query invalidations where migrated readers no longer need them.
2. Add project field hooks for frequent UI reads.
3. Make project reorder update index + entity sort order without full refetch where possible.
4. Ensure project delete removes project from index and related feed resources stale.
5. Run targeted tests.

### Phase 2: Pull Requests Read Paths

**Goal:** PR list, detail page, and feed share one PR entity keyed by provider/repo/PR id.

**Files:**
- Create: `src/cache/domains/pull-requests.ts`
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `shared/cache-events.ts`
- Modify: `src/cache/cache-events.ts`
- Test: `src/cache/domains/pull-requests.test.ts`, `shared/cache-events.test.ts`

**Steps:**
1. Ensure PR API/feed payloads include provider/repo identity, not only projectId.
2. Ingest PR summaries from list/feed into `cache$.pullRequests`.
3. Ingest PR detail into same entity with detail scope.
4. Store project/repo PR indexes separately from entity records.
5. Update feed PR cards to select PR fields from normalized cache where possible.
6. Run targeted tests and `pnpm ts-check`.

### Phase 3: Pull Requests Mutations And Events

**Goal:** Approve/comment/status mutations patch PR entity and feed immediately.

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `src/cache/cache-events.ts`
- Test: PR hook/domain/event tests

**Steps:**
1. Emit `pullRequest.patch` after approve/vote/status/comment count changes.
2. Emit `pullRequest.threadsChanged` when thread documents change.
3. Patch normalized PR on mutation success.
4. Remove broad feed invalidation where patch has enough data.
5. Keep scoped refetch only for unknown derived data.

### Phase 4: Tasks And Steps Read Paths

**Goal:** Task list/detail/feed/task panel share task and step entities.

**Files:**
- Create or Expand: `src/cache/domains/tasks.ts`
- Create or Expand: `src/cache/domains/steps.ts`
- Modify: `src/hooks/use-tasks.ts`
- Modify: `src/hooks/use-task-steps.ts`
- Test: task/step cache tests

**Steps:**
1. Key tasks by `task:${taskId}` and steps by `step:${stepId}`.
2. Store indexes for all tasks, project tasks, active tasks, task steps.
3. Ingest feed task summaries into task cache without clearing detail fields.
4. Update task panel and feed to read shared entities.
5. Run targeted tests and `pnpm ts-check`.

### Phase 5: Tasks And Steps Mutations And Events

**Goal:** Complete/delete/update task reflects in feed immediately.

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `src/cache/cache-events.ts`
- Modify: `src/hooks/use-tasks.ts`
- Test: task event tests

**Steps:**
1. Emit `task.patch` for status/title/PR association changes.
2. Emit `task.delete` on delete/remove.
3. Emit `step.upsert/patch/delete` on step changes.
4. Update feed source/index from task event instead of waiting for polling.
5. Remove broad task/feed invalidations from migrated mutations.

### Phase 6: Work Items

**Goal:** Work item feed, board/list, and task relations share work item entities.

**Files:**
- Create: `src/cache/domains/work-items.ts`
- Modify: work item hooks under `src/hooks/`
- Modify: `shared/cache-events.ts`
- Test: work item cache tests

**Steps:**
1. Key by `workItem:${providerId}:${workItemId}`.
2. Store project work item indexes separately.
3. Ingest feed and board/list summaries into same entity.
4. Patch state/comment changes from mutations/events.
5. Update feed/task joins to use foreign keys.

### Phase 7: Feed Notes

**Goal:** Notes are normalized local entities and complete/delete affects feed immediately.

**Files:**
- Create: `src/cache/domains/feed-notes.ts`
- Modify: feed note hooks/components
- Modify: `shared/cache-events.ts`
- Test: feed note cache tests

**Steps:**
1. Key by `feedNote:${noteId}`.
2. Store open note index for feed.
3. Patch complete/delete immediately.
4. Remove feed-wide refetch for note mutations.

### Phase 8: Providers, Repos, Tokens, Settings

**Goal:** Low-churn shared metadata moves to normalized cache or document resources.

**Steps:**
1. Migrate providers as entities.
2. Migrate repo metadata as entities keyed by provider/repo id.
3. Migrate token metadata carefully, no secrets beyond existing renderer exposure.
4. Keep settings as document resources unless shared entity shape helps.

### Phase 9: Document-Heavy Domains

**Goal:** Large/parameterized data uses document resources with scoped invalidation.

**Domains:** diffs, file content, PR threads, debug logs, usage, pipelines, directory listings, raw messages.

**Steps:**
1. Use `cache$.documents[key]` for large payloads.
2. Use exact resource keys for invalidation.
3. Do not normalize unless same entity appears across screens.
4. Add TTL tuned per payload size.

## Optional Request Batching

Defer until field selectors expose a real missing-entity pattern.

If needed, add a batch loader with this shape:

| Piece | Behavior |
| --- | --- |
| Queue | Collect missing IDs during same tick. |
| Loader | Call `api.<domain>.findMany(ids)` once. |
| Hydration | Ingest returned entities into normalized cache. |
| Safety | Keep per-resource `ensureResource` dedupe for direct detail loads. |

Initial likely use case: many `useProjectName(projectId)` or `useProviderName(providerId)` calls after cold start.

## Verification Standard

After each entity phase:

1. Run targeted Vitest files for changed cache domain.
2. Run `pnpm ts-check`.
3. Search migrated hook file for remaining read-path React Query usage.
4. Verify mutation updates feed/list/detail without waiting for polling.
5. Before final handoff, follow repo rule: `pnpm install`, `pnpm test`, `pnpm lint --fix`, `pnpm ts-check`, `pnpm lint`.
