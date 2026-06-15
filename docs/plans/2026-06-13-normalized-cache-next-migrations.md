# Normalized Cache Next Migrations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the Project cache migration, then migrate Pull Request read and mutation paths onto the normalized cache so lists, details, and feed share one entity source.

**Architecture:** Keep Electron main and external APIs as canonical sources. Renderer hooks ingest API responses into `src/cache/cache-store.ts`, select normalized entities through domain selectors, and consume `cache:event` patches for cross-window/mutation updates. React Query remains for unmigrated documents and external polling until each slice is converted.

**Tech Stack:** TypeScript, React 19, Electron IPC, Legend-State, Vitest, existing `window.api`, temporary TanStack React Query compatibility.

---

## Execution Notes

- Do not commit unless user explicitly asks. If using an executing plan workflow that says to commit, skip commit steps and report files changed instead.
- Do not touch `changelogs/`.
- Keep changes slice-sized and revertible.
- Preserve existing hook names where possible.
- Run targeted tests after every task; run full repo verification after each phase.

## Phase 1: Finish Project Cache Migration

### Task 1: Add Project Mutation Cache Tests

**Files:**
- Modify: `src/cache/domains/projects.test.ts`
- Modify: `src/cache/cache-store.test.ts`

**Step 1: Add event application tests**

Add tests for:
- `project.upsert` hydrates entity and updates project list freshness.
- `project.patch` updates `name`, `color`, `logoPath`, `prPriority`, `workItemPriority` without replacing unrelated fields.
- `project.delete` removes entity and index entry.

Use existing `createProject` helpers already present in tests.

**Step 2: Run failing test**

Run: `pnpm vitest src/cache/domains/projects.test.ts src/cache/cache-store.test.ts`

Expected: pass if current behavior already covers it, or fail only where assertions reveal missing behavior.

**Step 3: Implement minimal fixes if needed**

Only update `src/cache/domains/projects.ts` or `src/cache/cache-events.ts` if tests reveal missing behavior.

**Step 4: Verify**

Run: `pnpm vitest src/cache/domains/projects.test.ts src/cache/cache-store.test.ts`

Expected: PASS.

### Task 2: Ingest Project Mutation Results In Hooks

**Files:**
- Modify: `src/hooks/use-projects.ts`
- Test: `src/cache/domains/projects.test.ts`

**Step 1: Identify mutations returning `Project`**

In `src/hooks/use-projects.ts`, update mutation `onSuccess` handlers that receive a `Project` result:
- `useCreateProject`
- `useUpdateProject`
- `useUploadProjectLogo`
- `useGenerateProjectLogo`
- `useSelectGeneratedProjectLogo`
- `useRegenerateProjectSummary`
- `useRemoveProjectLogo`
- `useDeleteProjectWorktreesFolder` if API returns/starts returning project later

**Step 2: Apply immediate cache ingestion**

For each mutation returning project data, call `ingestProject(project)` inside `onSuccess` before narrow React Query invalidations.

Example:

```ts
onSuccess: (project) => {
  ingestProject(project);
  queryClient.invalidateQueries({ queryKey: ['project-logo'] });
}
```

**Step 3: Keep only non-migrated invalidations**

Keep invalidations for non-project documents:
- `project-logo`
- `project-logo-history`
- branch/git checks
- feed source keys when repo/work-item config changed

Remove redundant `['projects']` / `['projects', id]` invalidations only when cache events + direct ingestion cover the migrated readers.

**Step 4: Verify**

Run: `pnpm vitest src/cache/domains/projects.test.ts src/hooks/use-feed.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

### Task 3: Complete Project Delete/Reorder Cache Behavior

**Files:**
- Modify: `src/hooks/use-projects.ts`
- Modify: `src/cache/domains/projects.ts`
- Test: `src/cache/domains/projects.test.ts`

**Step 1: Add tests for reorder index updates**

Test `setProjectIndexIds` preserves order and `selectProjects()` returns projects in that order.

**Step 2: Add tests for delete cache update**

Test `removeProject(projectId)` removes entity and index entry.

**Step 3: Update hooks if needed**

Ensure `useReorderProjects` optimistic update changes the normalized index and rolls back on error.

Ensure `useDeleteProject` removes normalized project on success or relies on emitted `project.delete` event; prefer local immediate removal if simple.

**Step 4: Verify**

Run: `pnpm vitest src/cache/domains/projects.test.ts`

Expected: PASS.

### Task 4: Project Phase Full Verification

**Files:**
- No code expected.

**Step 1: Run checks**

Run: `pnpm test`

Expected: PASS.

Run: `pnpm lint --fix`

Expected: PASS or files auto-fixed.

Run: `pnpm ts-check`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS.

**Step 2: Manual review checklist**

Verify by code inspection:
- Project list readers no longer depend on React Query `['projects']` cache.
- Project detail readers no longer require React Query invalidation.
- Non-project document queries still invalidate where needed.

## Phase 2: Pull Request Read Paths

### Task 5: Add Pull Request Domain Model

**Files:**
- Modify: `src/cache/domains/pull-requests.ts`
- Create or Modify: `src/cache/domains/pull-requests.test.ts`
- Modify: `src/cache/cache-types.ts`

**Step 1: Add domain types and keys**

Use existing helpers:
- `pullRequestResourceKey({ providerId, repoId, pullRequestId })`
- `projectPullRequestsResourceKey(projectId)`
- `repoPullRequestsResourceKey({ providerId, repoId })`

Add entity store key helper if needed, using same canonical key string.

**Step 2: Add ingest helpers**

Implement minimal helpers:

```ts
export function ingestPullRequest(params: {
  providerId: string;
  repoId: string;
  pullRequest: AzureDevOpsPullRequest | AzureDevOpsPullRequestDetails;
})
```

Behavior:
- Merge into `cache$.pullRequests[key]` using `mergeEntitySnapshot`.
- Mark detail resource success for `pullRequestResourceKey(...)`.

Add list ingest:

```ts
export function ingestPullRequestList(params: {
  providerId: string;
  repoId: string;
  projectId?: string;
  pullRequests: AzureDevOpsPullRequest[];
})
```

Behavior:
- Ingest each PR.
- Set repo index IDs for `repoPullRequestsResourceKey`.
- If `projectId` exists, set project index IDs for `projectPullRequestsResourceKey`.

**Step 3: Add selectors**

Add:
- `selectPullRequest(identity)`
- `selectRepoPullRequests({ providerId, repoId })`
- `selectProjectPullRequests(projectId)`

**Step 4: Test**

Tests:
- Ingest summary then detail keeps all fields.
- Ingest later summary does not drop detail fields.
- Repo and project indexes select same entity objects.
- Key does not include local app project id.

Run: `pnpm vitest src/cache/domains/pull-requests.test.ts`

Expected: PASS.

### Task 6: Add Repo Info Selector Hook

**Files:**
- Modify: `src/hooks/use-projects.ts`
- Modify: `src/hooks/use-pull-requests.ts`
- Test: `src/cache/domains/projects.test.ts`

**Step 1: Replace `useProjectRepoInfo` dependency on full project detail**

Current `src/hooks/use-pull-requests.ts` calls `useProject(projectId)` to get repo fields. Add a field selector hook:

```ts
export function useProjectRepoInfo(projectId: string)
```

It should select only:
- `repoProviderId`
- `repoProjectId`
- `repoId`

Return `null` if any missing.

**Step 2: Update PR hook import**

Use the exported field hook in `src/hooks/use-pull-requests.ts`.

**Step 3: Verify**

Run: `pnpm vitest src/cache/domains/projects.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

### Task 7: Migrate `usePullRequests` Read Path

**Files:**
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `src/cache/domains/pull-requests.ts`
- Test: `src/cache/domains/pull-requests.test.ts`

**Step 1: Replace React Query read with `useCacheResource`**

`usePullRequests(projectId, status)` should:
- derive repo info from project field selector
- use key `projectPullRequestsResourceKey(projectId)` for project relation or status-specific variant if status must be distinct
- load through `api.azureDevOps.listPullRequests`
- ingest with provider/repo/project relation
- select from normalized project or repo index

If status is a real filter, include it in relation key:

```ts
pullRequests:project:${projectId}:status:${status}
```

Add helper only if needed for status-specific indexes.

**Step 2: Keep hook return shape**

Return same fields components use:
- `data`
- `isLoading`
- `isFetching`
- `isError`
- `error`
- `refetch`

**Step 3: Test**

Add selector/index tests for status-specific keys if implemented.

Run: `pnpm vitest src/cache/domains/pull-requests.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

### Task 8: Migrate `usePullRequest` Detail Read Path

**Files:**
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `src/cache/domains/pull-requests.ts`
- Test: `src/cache/domains/pull-requests.test.ts`

**Step 1: Use detail key**

`usePullRequest(projectId, prId)` should use `pullRequestResourceKey({ providerId, repoId, pullRequestId: String(prId) })` once repo info exists.

**Step 2: Load and ingest detail**

Use `api.azureDevOps.getPullRequest`, then `ingestPullRequest`.

**Step 3: Select normalized entity**

Return detail object from `selectPullRequest`.

If detail not loaded yet, summary fields may appear first; keep `isLoading` true only when no data and loading.

**Step 4: Verify no downgrade**

Test summary-after-detail preserves `description` and other detail-only fields.

Run: `pnpm vitest src/cache/domains/pull-requests.test.ts`

Expected: PASS.

### Task 9: Migrate `useAllProjectsPullRequests` Read Path

**Files:**
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `src/cache/domains/pull-requests.ts`
- Test: `src/cache/domains/pull-requests.test.ts`

**Step 1: Preserve return shape**

`PullRequestWithProject` currently adds:
- `projectId`
- `projectName`
- `projectColor`

Keep that return shape for UI compatibility, but derive project fields from project cache when selecting rather than storing them on PR entity.

**Step 2: Load per repo and ingest**

Continue loading each configured project repo for now; do not add batching yet.

Ingest each PR into normalized entity cache.

Store project relation index for each local project.

**Step 3: Select combined result**

Read project relation indexes and PR entities, then map with current project fields.

Sort by `creationDate` newest first as before.

**Step 4: Verify**

Run: `pnpm vitest src/cache/domains/pull-requests.test.ts src/hooks/use-feed.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

### Task 10: PR Read Phase Full Verification

**Files:**
- No code expected.

**Step 1: Search for read-path React Query remnants**

Run: `rg "useQuery<AzureDevOpsPullRequest|useQuery<AzureDevOpsPullRequestDetails|queryKey: \['pull-requests'|queryKey: \['pull-request'" src/hooks/use-pull-requests.ts`

Expected: no matches for migrated read paths.

**Step 2: Run checks**

Run: `pnpm test`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

## Phase 3: Pull Request Mutations And Events

### Task 11: Patch PR Entity On Title/Description Mutations

**Files:**
- Modify: `src/hooks/use-pull-requests.ts`
- Modify: `src/cache/domains/pull-requests.ts`
- Test: `src/cache/domains/pull-requests.test.ts`

**Step 1: Update mutation success handlers**

For `useUpdatePullRequestTitle` and `useUpdatePullRequestDescription`:
- ingest returned `AzureDevOpsPullRequestDetails`
- remove broad list invalidations if normalized reads update from entity/index
- keep any document invalidations not yet migrated

**Step 2: Verify UI shape**

Ensure detail page and list page see same updated title/description via normalized selectors.

**Step 3: Test**

Add domain tests for patch/detail ingestion.

Run: `pnpm vitest src/cache/domains/pull-requests.test.ts`

Expected: PASS.

### Task 12: Emit PR Cache Events From Main IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `shared/cache-events.test.ts`
- Test: `shared/cache-events.test.ts`

**Step 1: Locate PR IPC handlers**

Search: `rg "azureDevOps:.*PullRequest|updatePullRequest|approve|vote|comment|thread" electron/ipc/handlers.ts`

**Step 2: Emit granular events after success**

For handlers returning updated PR details, emit:

```ts
emitCacheEvent({
  type: 'pullRequest.upsert',
  providerId: params.providerId,
  repoId: params.repoId,
  projectId: localProjectIdIfKnown,
  pullRequest: updatedPr,
});
```

For thread/comment changes, emit:

```ts
emitCacheEvent({
  type: 'pullRequest.threadsChanged',
  providerId: params.providerId,
  repoId: params.repoId,
  pullRequestId: params.pullRequestId,
});
```

**Step 3: Avoid feed-wide invalidation unless needed**

If returned data has enough fields to update entity, prefer PR event over feed source invalidation.

Use `feed.sourceChanged` only when derived feed data cannot be patched yet.

**Step 4: Verify**

Run: `pnpm vitest shared/cache-events.test.ts src/cache/cache-store.test.ts`

Expected: PASS.

Run: `pnpm ts-check`

Expected: PASS.

### Task 13: PR Mutation Phase Full Verification

**Files:**
- No code expected.

**Step 1: Run full sequence**

Run: `pnpm install`

Expected: PASS.

Run: `pnpm test`

Expected: PASS.

Run: `pnpm lint --fix`

Expected: PASS or files auto-fixed.

Run: `pnpm ts-check`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS.

**Step 2: Manual behavior checklist**

Verify by local UI if available:
- Open PR list, then PR detail. Detail data enriches same entity.
- Rename PR title. List/detail/feed title updates without waiting for polling.
- Approve/comment PR. Comment/status badges update or relevant resource refetches narrowly.

## Stop Point

After Phase 3, stop and review before Task/Step migration.

Expected state:
- Projects are fully normalized for reads and mutation responses.
- PR list/detail/all-projects read paths share normalized PR entities.
- PR title/description/thread changes emit/apply granular events.
- Feed still may keep some document-shaped PR items, but project/PR entity fields should come from normalized cache where migrated.
