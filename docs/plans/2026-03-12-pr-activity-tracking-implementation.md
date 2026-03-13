# PR Activity Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track PR activity (commits, comments, approvals) with last-viewed snapshots so the feed shows meaningful badges — blue dot for new activity, comment count, approver initials — and approved-by-me PRs sort to the bottom.

**Architecture:** New `pr_view_snapshots` table stores PR state at last view. Feed service fetches activity metadata per PR, compares against snapshots, and enriches `FeedItem` with activity fields. A new `pr-approved-by-me` attention level with low urgency naturally sorts approved PRs down. PR detail component records view snapshots on mount.

**Tech Stack:** SQLite/Kysely, Electron IPC, React Query, Tailwind CSS, Lucide icons

---

### Task 1: Database Migration — `pr_view_snapshots` table

**Files:**
- Create: `electron/database/migrations/040_pr_view_snapshots.ts`

**What to do:**

Create the migration file:

```ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('pr_view_snapshots')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),
    )
    .addColumn('projectId', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade'),
    )
    .addColumn('pullRequestId', 'text', (col) => col.notNull())
    .addColumn('lastViewedAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`),
    )
    .addColumn('lastCommitDate', 'text')
    .addColumn('lastThreadActivityDate', 'text')
    .addColumn('activeThreadCount', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();

  await db.schema
    .createIndex('idx_pr_view_snapshots_project_pr')
    .on('pr_view_snapshots')
    .columns(['projectId', 'pullRequestId'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('pr_view_snapshots').execute();
}
```

---

### Task 2: Register migration and add schema type

**Files:**
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**What to do:**

**2a. Register migration in `electron/database/migrator.ts`:**

Add import at the end of the import block:

```ts
import * as m040 from './migrations/040_pr_view_snapshots';
```

Add entry at the end of the `migrations` record:

```ts
  '040_pr_view_snapshots': m040,
```

**2b. Add table type in `electron/database/schema.ts`:**

Add to the `Database` interface:

```ts
  pr_view_snapshots: PrViewSnapshotTable;
```

Add the table interface (after `FeedNoteTable`):

```ts
export interface PrViewSnapshotTable {
  id: Generated<string>;
  projectId: string;
  pullRequestId: string;
  lastViewedAt: string;
  lastCommitDate: string | null;
  lastThreadActivityDate: string | null;
  activeThreadCount: number;
}

export type PrViewSnapshotRow = Selectable<PrViewSnapshotTable>;
```

---

### Task 3: Repository — `pr-view-snapshots.ts`

**Files:**
- Create: `electron/database/repositories/pr-view-snapshots.ts`
- Modify: `electron/database/repositories/index.ts`

**What to do:**

**3a. Create `electron/database/repositories/pr-view-snapshots.ts`:**

```ts
import { dbg } from '../../lib/debug';
import { db } from '../index';

export const PrViewSnapshotRepository = {
  upsert: async (data: {
    projectId: string;
    pullRequestId: string;
    lastCommitDate: string | null;
    lastThreadActivityDate: string | null;
    activeThreadCount: number;
  }) => {
    dbg.db('prViewSnapshots.upsert projectId=%s prId=%s', data.projectId, data.pullRequestId);
    const now = new Date().toISOString();

    // Try update first, then insert if no rows affected
    const updated = await db
      .updateTable('pr_view_snapshots')
      .set({
        lastViewedAt: now,
        lastCommitDate: data.lastCommitDate,
        lastThreadActivityDate: data.lastThreadActivityDate,
        activeThreadCount: data.activeThreadCount,
      })
      .where('projectId', '=', data.projectId)
      .where('pullRequestId', '=', data.pullRequestId)
      .executeTakeFirst();

    if (updated.numUpdatedRows === 0n) {
      await db
        .insertInto('pr_view_snapshots')
        .values({
          projectId: data.projectId,
          pullRequestId: data.pullRequestId,
          lastViewedAt: now,
          lastCommitDate: data.lastCommitDate,
          lastThreadActivityDate: data.lastThreadActivityDate,
          activeThreadCount: data.activeThreadCount,
        })
        .execute();
    }
  },

  findByProject: async (projectId: string) => {
    dbg.db('prViewSnapshots.findByProject projectId=%s', projectId);
    return db
      .selectFrom('pr_view_snapshots')
      .selectAll()
      .where('projectId', '=', projectId)
      .execute();
  },

  findByProjectAndPr: async (projectId: string, pullRequestId: string) => {
    dbg.db('prViewSnapshots.findByProjectAndPr projectId=%s prId=%s', projectId, pullRequestId);
    return db
      .selectFrom('pr_view_snapshots')
      .selectAll()
      .where('projectId', '=', projectId)
      .where('pullRequestId', '=', pullRequestId)
      .executeTakeFirst() ?? null;
  },
};
```

**3b. Export from `electron/database/repositories/index.ts`:**

Add at the end:

```ts
export { PrViewSnapshotRepository } from './pr-view-snapshots';
```

---

### Task 4: Azure DevOps Service — `getPullRequestActivityMetadata`

**Files:**
- Modify: `electron/services/azure-devops-service.ts`

**What to do:**

Add this new exported function. It reuses the existing `getPullRequestCommits` and `getPullRequestThreads` functions already in the service:

```ts
export async function getPullRequestActivityMetadata(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<{
  lastCommitDate: string | null;
  lastThreadActivityDate: string | null;
  activeThreadCount: number;
}> {
  const [commits, threads] = await Promise.all([
    getPullRequestCommits(params),
    getPullRequestThreads(params),
  ]);

  // Latest commit date (commits are returned newest-first by Azure DevOps)
  const lastCommitDate = commits.length > 0
    ? commits[0].author.date
    : null;

  // Filter out deleted and system threads
  const realThreads = threads.filter(
    (t) => !t.isDeleted && t.comments.some((c) => c.commentType !== 'system'),
  );

  // Find max lastUpdatedDate across all comments in all threads
  let lastThreadActivityDate: string | null = null;
  let activeThreadCount = 0;

  for (const thread of realThreads) {
    if (thread.status === 'active') {
      activeThreadCount++;
    }
    for (const comment of thread.comments) {
      if (
        !lastThreadActivityDate ||
        comment.lastUpdatedDate > lastThreadActivityDate
      ) {
        lastThreadActivityDate = comment.lastUpdatedDate;
      }
    }
  }

  return { lastCommitDate, lastThreadActivityDate, activeThreadCount };
}
```

---

### Task 5: Shared Types — Extend `FeedItem` and `FeedItemAttention`

**Files:**
- Modify: `shared/feed-types.ts`

**What to do:**

**5a. Add `'pr-approved-by-me'` to `FeedItemAttention`:**

```ts
export type FeedItemAttention =
  | 'needs-permission'
  | 'has-question'
  | 'errored'
  | 'completed'
  | 'interrupted'
  | 'running'
  | 'review-requested'
  | 'pr-comments'
  | 'pr-approved-by-me'
  | 'waiting'
  | 'note';
```

**5b. Add activity fields to `FeedItem`:**

Add these fields at the end of the `FeedItem` interface (before the closing `}`):

```ts
  // PR activity tracking (only present when source === 'pull-request')
  hasNewActivity?: boolean;
  activeThreadCount?: number;
  approvedBy?: Array<{ displayName: string; uniqueName: string; imageUrl?: string }>;
  isApprovedByMe?: boolean;
```

---

### Task 6: Feed Scoring — Add `pr-approved-by-me` urgency

**Files:**
- Modify: `src/features/feed/utils-feed-scoring.ts`

**What to do:**

Add `'pr-approved-by-me': 15` to the `BASE_URGENCY` record:

```ts
const BASE_URGENCY: Record<FeedItemAttention, number> = {
  errored: 100,
  'needs-permission': 90,
  'has-question': 85,
  completed: 70,
  interrupted: 60,
  'review-requested': 50,
  'pr-comments': 45,
  running: 30,
  'pr-approved-by-me': 15,
  note: 105,
  waiting: 10,
};
```

---

### Task 7: Feed Service — Enrich PR items with activity data

**Files:**
- Modify: `electron/services/feed-service.ts`

**What to do:**

Modify the `fetchPrFeedItems()` function. After fetching PRs and building the basic `FeedItem` array, add activity metadata enrichment.

**7a. Add imports at the top:**

```ts
import { getPullRequestActivityMetadata } from './azure-devops-service';
import { PrViewSnapshotRepository } from '../database/repositories/pr-view-snapshots';
```

**7b. Add an activity metadata cache alongside the existing PR cache:**

After the existing `prCache` declaration (line ~16), add:

```ts
let activityCache: {
  metadata: Map<string, { lastCommitDate: string | null; lastThreadActivityDate: string | null; activeThreadCount: number }>;
  fetchedAt: number;
} | null = null;
```

**7c. Modify `fetchPrFeedItems()` to enrich items:**

After building the basic `prItems` array (the existing `projectItems.flat()` line), but before caching and returning, add enrichment. Replace the section from `const prItems = projectItems.flat();` to the end of the function with:

```ts
  const prItems = projectItems.flat();

  // Fetch activity metadata for each PR (cached separately)
  const shouldRefreshActivity = !activityCache || Date.now() - activityCache.fetchedAt > PR_CACHE_TTL_MS;

  if (shouldRefreshActivity) {
    const metadataMap = new Map<string, { lastCommitDate: string | null; lastThreadActivityDate: string | null; activeThreadCount: number }>();

    await Promise.all(
      prItems.map(async (item) => {
        if (!item.pullRequestId) return;
        const project = repoProjects.find((p) => p.id === item.projectId);
        if (!project?.repoProviderId || !project.repoProjectId || !project.repoId) return;

        try {
          const metadata = await getPullRequestActivityMetadata({
            providerId: project.repoProviderId,
            projectId: project.repoProjectId,
            repoId: project.repoId,
            pullRequestId: item.pullRequestId,
          });
          metadataMap.set(item.id, metadata);
        } catch (err) {
          dbg.feed('fetchPrFeedItems: error fetching activity for %s: %O', item.id, err);
        }
      }),
    );

    activityCache = { metadata: metadataMap, fetchedAt: Date.now() };
  }

  // Load all snapshots for comparison
  const snapshotsByProject = new Map<string, Map<string, { lastCommitDate: string | null; lastThreadActivityDate: string | null }>>();
  const projectIds = [...new Set(prItems.map((item) => item.projectId))];
  await Promise.all(
    projectIds.map(async (projectId) => {
      const snapshots = await PrViewSnapshotRepository.findByProject(projectId);
      const map = new Map<string, { lastCommitDate: string | null; lastThreadActivityDate: string | null }>();
      for (const s of snapshots) {
        map.set(s.pullRequestId, { lastCommitDate: s.lastCommitDate, lastThreadActivityDate: s.lastThreadActivityDate });
      }
      snapshotsByProject.set(projectId, map);
    }),
  );

  // Enrich each PR item
  const enrichedItems = prItems.map((item) => {
    if (!item.pullRequestId) return item;

    const metadata = activityCache?.metadata.get(item.id);
    const snapshot = snapshotsByProject.get(item.projectId)?.get(String(item.pullRequestId));

    // Determine hasNewActivity by comparing timestamps
    let hasNewActivity = false;
    if (snapshot && metadata) {
      const newCommits = !!(metadata.lastCommitDate && snapshot.lastCommitDate && metadata.lastCommitDate > snapshot.lastCommitDate);
      const newThreads = !!(metadata.lastThreadActivityDate && snapshot.lastThreadActivityDate && metadata.lastThreadActivityDate > snapshot.lastThreadActivityDate);
      hasNewActivity = newCommits || newThreads;
    }
    // No snapshot = first time seeing this PR, don't show badge

    const activeThreadCount = metadata?.activeThreadCount ?? 0;

    // Extract approvers from the PR reviewers (already on the PR data via listPullRequests)
    // We need to get the original PR object — we stored ownerName and isOwnedByCurrentUser
    // but not reviewers. We'll need to pass reviewer data through.
    // For now, approvedBy comes from the PR data we fetched.

    // Determine attention level
    let attention = item.attention;
    if (item.isApprovedByMe && !hasNewActivity) {
      attention = 'pr-approved-by-me' as const;
    } else if (hasNewActivity) {
      attention = 'review-requested' as const;
    } else if (activeThreadCount > 0) {
      attention = 'pr-comments' as const;
    }

    return {
      ...item,
      attention,
      hasNewActivity,
      activeThreadCount,
    };
  });

  prCache = { items: enrichedItems, fetchedAt: Date.now() };
  dbg.feed('fetchPrFeedItems: cached %d PR items', enrichedItems.length);
  return enrichedItems;
```

**7d. Pass reviewer/approval data through the PR mapping:**

In the `prs.map((pr): FeedItem => ({...}))` block, add these fields to each PR feed item:

```ts
  approvedBy: pr.reviewers
    .filter((r) => !r.isContainer && (r.voteStatus === 'approved' || r.voteStatus === 'approved-with-suggestions'))
    .map((r) => ({ displayName: r.displayName, uniqueName: r.uniqueName, imageUrl: r.imageUrl })),
  isApprovedByMe:
    !!project.repoProviderId &&
    pr.reviewers.some(
      (r) =>
        !r.isContainer &&
        (r.voteStatus === 'approved' || r.voteStatus === 'approved-with-suggestions') &&
        r.uniqueName.toLowerCase() === providerUserEmailMap.get(project.repoProviderId!),
    ),
```

---

### Task 8: IPC Handlers — `pr-snapshots:record`

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**What to do:**

**8a. Add IPC handler in `electron/ipc/handlers.ts`:**

Add inside `registerIpcHandlers()`:

```ts
  ipcMain.handle(
    'pr-snapshots:record',
    async (
      _event,
      params: {
        projectId: string;
        pullRequestId: number;
        providerId: string;
        repoProjectId: string;
        repoId: string;
      },
    ) => {
      const { getPullRequestActivityMetadata } = await import(
        '../services/azure-devops-service'
      );
      const { PrViewSnapshotRepository } = await import(
        '../database/repositories/pr-view-snapshots'
      );

      const metadata = await getPullRequestActivityMetadata({
        providerId: params.providerId,
        projectId: params.repoProjectId,
        repoId: params.repoId,
        pullRequestId: params.pullRequestId,
      });

      await PrViewSnapshotRepository.upsert({
        projectId: params.projectId,
        pullRequestId: String(params.pullRequestId),
        lastCommitDate: metadata.lastCommitDate,
        lastThreadActivityDate: metadata.lastThreadActivityDate,
        activeThreadCount: metadata.activeThreadCount,
      });
    },
  );
```

**8b. Add to preload bridge in `electron/preload.ts`:**

Find the `feed` namespace object and add a new `prSnapshots` namespace after it:

```ts
  prSnapshots: {
    record: (params: {
      projectId: string;
      pullRequestId: number;
      providerId: string;
      repoProjectId: string;
      repoId: string;
    }) => ipcRenderer.invoke('pr-snapshots:record', params),
  },
```

**8c. Add API type in `src/lib/api.ts`:**

Find the `feed` section in the API interface and add a `prSnapshots` section after it:

```ts
  prSnapshots: {
    record: (params: {
      projectId: string;
      pullRequestId: number;
      providerId: string;
      repoProjectId: string;
      repoId: string;
    }) => Promise<void>;
  };
```

---

### Task 9: React Hook — `useRecordPrView`

**Files:**
- Create: `src/hooks/use-pr-view-snapshot.ts`

**What to do:**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useRecordPrView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      projectId: string;
      pullRequestId: number;
      providerId: string;
      repoProjectId: string;
      repoId: string;
    }) => api.prSnapshots.record(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'items'] });
    },
  });
}
```

---

### Task 10: Record PR view in `PrDetail` component

**Files:**
- Modify: `src/features/pull-request/ui-pr-detail/index.tsx`

**What to do:**

**10a. Add import:**

```ts
import { useRecordPrView } from '@/hooks/use-pr-view-snapshot';
```

**10b. Add the hook call and `useEffect` inside `PrDetail`:**

After the existing `const { data: project } = useProject(projectId);` line, add:

```ts
  const recordPrView = useRecordPrView();

  // Record PR view for activity tracking
  useEffect(() => {
    if (!project?.repoProviderId || !project?.repoProjectId || !project?.repoId) return;
    recordPrView.mutate({
      projectId,
      pullRequestId: prId,
      providerId: project.repoProviderId,
      repoProjectId: project.repoProjectId,
      repoId: project.repoId,
    });
    // Only record on mount, not on every project data change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, prId]);
```

Also add `useEffect` to the existing imports from React:

Make sure the import line reads:

```ts
import { useState, useCallback, useMemo, useEffect } from 'react';
```

---

### Task 11: Feed Card — Blue dot, comments indicator, approver badges

**Files:**
- Modify: `src/features/feed/ui-feed-list/feed-item-card.tsx`

**What to do:**

**11a. Add `MessageSquare` to the lucide import:**

Add `MessageSquare` to the existing destructured import from `lucide-react`.

**11b. Add `'pr-approved-by-me'` to the `AttentionIcon` component:**

In the `switch` statement, add it alongside the existing PR cases:

```ts
    case 'review-requested':
    case 'pr-comments':
    case 'pr-approved-by-me':
      return (
        <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-purple-400" />
      );
```

**11c. Add `'pr-approved-by-me'` to `borderClasses`:**

In the `isSelected` switch, add after the `'pr-comments'` case:

```ts
      case 'pr-approved-by-me':
        return 'border border-neutral-600 bg-neutral-800 shadow-sm';
```

The default (non-selected) case already returns `'border border-transparent'` for unmatched attention types, which is fine for `pr-approved-by-me`.

**11d. Add a `getInitials` helper at the top of the file (before `AttentionIcon`):**

```ts
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
```

**11e. Modify the card JSX to add activity indicators:**

In the title row (the first `<div className="flex items-center gap-2">`), add the blue dot before the title and activity indicators after the timestamp:

Replace this section:

```tsx
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
              {item.title}
            </span>
            <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>
```

With:

```tsx
          <div className="flex items-center gap-2">
            {item.hasNewActivity && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
              {item.title}
            </span>
            {item.source === 'pull-request' && (item.activeThreadCount ?? 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-purple-400">
                <MessageSquare className="h-3 w-3" />
                <span className="text-[10px]">{item.activeThreadCount}</span>
              </span>
            )}
            <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>
```

**11f. Add approver badges in the metadata row:**

In the second `<div>` (the metadata row with `AttentionIcon`), add approver badges after the existing `isDraft` badge:

After the closing of the `isDraft` conditional span, add:

```tsx
            {item.approvedBy && item.approvedBy.length > 0 && (
              <div className="flex shrink-0 -space-x-1.5">
                {item.approvedBy.map((reviewer) => (
                  <span
                    key={reviewer.uniqueName}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-green-900/50 text-[8px] font-medium text-green-300 ring-1 ring-green-500/50"
                    title={`${reviewer.displayName} approved`}
                  >
                    {getInitials(reviewer.displayName)}
                  </span>
                ))}
              </div>
            )}
```

---

### Task 12: Lint and type-check

**Step 1:** `pnpm install && pnpm lint --fix`
**Step 2:** `pnpm ts-check`
**Step 3:** `pnpm lint`

Fix any TypeScript errors or lint issues discovered. Common things to watch for:
- `FeedItemAttention` exhaustiveness checks in switch statements — any other `switch` on `FeedItemAttention` may need a new case for `'pr-approved-by-me'`
- Import paths — ensure `@shared/` aliases resolve
- Unused variables from the enrichment logic
