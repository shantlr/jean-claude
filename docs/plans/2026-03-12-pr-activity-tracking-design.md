# PR Activity Tracking — Design

## Goal

Track PR activity (new commits, comments, approvals) so the feed list shows meaningful badges and sorts PRs by what needs attention. Users see at a glance which PRs have new activity, which have active comments, who approved, and approved-by-me PRs sink to the bottom of the list.

## Key Decisions

- **Last-viewed tracking**: Store a snapshot of PR state when the user views it. Compare against current state to detect changes.
- **Timestamp-based diffing**: Use `lastCommitDate` and `lastThreadActivityDate` instead of counts (handles deletions correctly).
- **Single "new activity" dot**: One blue dot for any change since last viewed (not separate icons per change type).
- **Active comments**: Only threads with Azure DevOps status `active` count.
- **Approver badges**: Stacked badges with reviewer initials for each approver.
- **Approved-by-me sorting**: PRs approved by current user (with no new activity) sort to bottom within their feed zone.
- **View triggers**: Opening PR detail page OR switching to PR tab in task panel records a view.

---

## Architecture Overview

```
Azure DevOps API
      │
      ▼
feed-service.ts (enriches PR feed items with activity metadata)
      │
      ▼
pr_view_snapshots table (SQLite, stores state at last view)
      │
      ▼
use-feed.ts (compares current vs snapshot → sets attention, sorts)
      │
      ▼
feed-item-card.tsx (renders badges, dots, approver initials)
```

**Data flow for the feed list:**

1. `feed-service.ts` fetches PRs (existing) + fetches activity metadata per PR (new)
2. Loads snapshots from `pr_view_snapshots` for all active PRs (new)
3. Compares current metadata vs snapshot → determines `hasNewActivity`, `activeThreadCount`, `approvedBy`, `isApprovedByMe`
4. Enriches each PR `FeedItem` with activity fields
5. Feed hook uses `isApprovedByMe && !hasNewActivity` to sort to bottom
6. Feed card renders blue dot, comment count, approver badges

**Data flow on PR view:**

1. User opens PR detail or task PR tab
2. `useRecordPrView` mutation fires
3. Fetches current activity metadata from Azure DevOps
4. Upserts snapshot into `pr_view_snapshots`
5. Invalidates feed query → badges clear

---

## 1. Database — `pr_view_snapshots` Table

### Migration: `NNN_pr_view_snapshots.ts`

```sql
CREATE TABLE pr_view_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pull_request_id TEXT NOT NULL,
  last_viewed_at TEXT NOT NULL,
  last_commit_date TEXT,
  last_thread_activity_date TEXT,
  active_thread_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, pull_request_id)
);
```

### Repository: `pr-view-snapshots.ts`

```ts
upsertSnapshot({ projectId, pullRequestId, lastCommitDate, lastThreadActivityDate, activeThreadCount })
// Sets lastViewedAt to now, upserts on UNIQUE(project_id, pull_request_id)

getSnapshot(projectId, pullRequestId): PrViewSnapshot | null

getAllSnapshots(projectId): Map<string, PrViewSnapshot>
// For batch use in feed service — keyed by pullRequestId

deleteByProject(projectId): void
// Cleanup when project is deleted
```

### Schema type

```ts
interface PrViewSnapshotTable {
  id: string;
  projectId: string;
  pullRequestId: string;
  lastViewedAt: string;
  lastCommitDate: string | null;
  lastThreadActivityDate: string | null;
  activeThreadCount: number;
}
```

---

## 2. Azure DevOps Service — Activity Metadata

### New method: `getPullRequestActivityMetadata`

```ts
async getPullRequestActivityMetadata(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<{
  lastCommitDate: string | null;
  lastThreadActivityDate: string | null;
  activeThreadCount: number;
}>
```

**Implementation:**
- Fetch commits (`$top=1`, sorted by date desc) → extract date of latest commit
- Fetch threads → filter to non-system threads, find max `lastUpdatedDate`, count threads with `status === 'active'`
- Run both calls in parallel

This is called in two places:
1. **Feed service** — for each active PR when building feed items (cached alongside PR data with same 3-min TTL)
2. **Record view mutation** — to snapshot current state when user opens a PR

---

## 3. Feed Service — Enrich PR Items

### New fields on `FeedItem`

```ts
// Add to FeedItem in shared/feed-types.ts
interface FeedItem {
  // ... existing fields ...

  // PR activity (only present when source === 'pull-request')
  hasNewActivity?: boolean;
  activeThreadCount?: number;
  approvedBy?: Array<{ displayName: string; uniqueName: string; imageUrl?: string }>;
  isApprovedByMe?: boolean;
}
```

### Enrichment in `fetchPrFeedItems()`

After fetching PRs (existing logic), for each PR:

1. Fetch activity metadata (batch, cached with PR data)
2. Load snapshot from `pr_view_snapshots`
3. Compute:
   - `hasNewActivity`: no snapshot exists yet → `false` (first-time PRs don't show badge); otherwise `currentLastCommitDate > snapshot.lastCommitDate || currentLastThreadActivityDate > snapshot.lastThreadActivityDate`
   - `activeThreadCount`: from current metadata
   - `approvedBy`: filter PR `reviewers` where vote is `approved` or `approvedWithSuggestions` (already available on the PR object, no extra call)
   - `isApprovedByMe`: current user email matches any entry in `approvedBy`
4. Set `attention` based on state:
   - `hasNewActivity` → `'review-requested'` (keeps existing high urgency)
   - `activeThreadCount > 0` → `'pr-comments'`
   - `isApprovedByMe && !hasNewActivity` → new attention level `'pr-approved-by-me'` (low urgency)
   - Default → `'review-requested'`

### New attention level

Add `'pr-approved-by-me'` to `FeedItemAttention` type with low base urgency:

```ts
// In shared/feed-types.ts
type FeedItemAttention = ... | 'pr-approved-by-me';

// In utils-feed-scoring.ts
const BASE_URGENCY = {
  ...existing,
  'pr-approved-by-me': 15,  // Below 'pr-comments' (45) and 'review-requested' (50)
};
```

This naturally sorts approved-by-me PRs below other PRs in the feed without special sort logic.

---

## 4. Feed Card — Visual Changes

### In `feed-item-card.tsx`

**4a. New activity dot**

When `item.hasNewActivity` is true, show a small blue dot (8px) to the left of the title or in the top-right corner of the card. Uses `bg-blue-500` with a subtle pulse animation on first appearance.

```tsx
{item.hasNewActivity && (
  <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
)}
```

**4b. Active comments indicator**

When `item.activeThreadCount > 0`, show a message icon with count near the metadata row:

```tsx
{item.activeThreadCount > 0 && (
  <span className="flex items-center gap-0.5 text-xs text-purple-400">
    <MessageSquare className="h-3 w-3" />
    {item.activeThreadCount}
  </span>
)}
```

**4c. Approver badges**

Replace or augment the existing owner badge area. For each reviewer in `item.approvedBy`, show a small stacked circle with initials and a green accent:

```tsx
{item.approvedBy?.length > 0 && (
  <div className="flex -space-x-1.5">
    {item.approvedBy.map((reviewer) => (
      <span
        key={reviewer.uniqueName}
        className="flex h-5 w-5 items-center justify-center rounded-full bg-green-900/50 text-[10px] font-medium text-green-300 ring-1 ring-green-500/50"
        title={reviewer.displayName}
      >
        {getInitials(reviewer.displayName)}
      </span>
    ))}
  </div>
)}
```

**4d. De-emphasized styling for approved-by-me**

When `item.attention === 'pr-approved-by-me'`, use a muted border color instead of purple:

```ts
'pr-approved-by-me': 'border-neutral-600',  // Instead of border-purple-500
```

---

## 5. IPC — New Endpoints

### `pr-snapshots:record`

Called when user views a PR. Handler:
1. Calls `getPullRequestActivityMetadata()` to get current state
2. Calls `prViewSnapshotRepository.upsertSnapshot()` with current metadata
3. Returns the new snapshot

### `pr-snapshots:getAll`

Called by feed service to load all snapshots for a project. Handler:
1. Calls `prViewSnapshotRepository.getAllSnapshots(projectId)`
2. Returns `Map<pullRequestId, PrViewSnapshot>`

---

## 6. React Hooks

### `useRecordPrView()`

Mutation hook that records a PR view:

```ts
useRecordPrView(): {
  mutate: (params: { projectId: string; pullRequestId: string }) => void
}
```

On success: invalidates the feed query so badges update immediately.

**Called from:**
- PR detail page component (`useEffect` on mount)
- Task panel PR tab (when tab becomes active)

---

## 7. PR Sidebar List — Approver Badges & Sorting

The PR sidebar list (`ui-pr-sidebar-list`) also benefits from this data, though the primary target is the feed card.

In the PR list item component, add the same approver initials badges as the feed card. The "To Review" tab already filters to PRs not created by the current user — within that tab, PRs where `isApprovedByMe && !hasNewActivity` sort to the bottom.

---

## Summary of Changes

| Area | Files | Change |
|------|-------|--------|
| Migration | `electron/database/migrations/NNN_pr_view_snapshots.ts` | Create table |
| Migrator | `electron/database/migrator.ts` | Register migration |
| Schema | `electron/database/schema.ts` | Add `PrViewSnapshotTable` |
| Repository | `electron/database/repositories/pr-view-snapshots.ts` | CRUD operations |
| Service | `electron/services/azure-devops-service.ts` | `getPullRequestActivityMetadata()` |
| Service | `electron/services/feed-service.ts` | Enrich PR feed items with activity data |
| Types | `shared/feed-types.ts` | Add activity fields to `FeedItem`, new attention level |
| Scoring | `src/features/feed/utils-feed-scoring.ts` | Add `pr-approved-by-me` score |
| IPC | `electron/ipc/handlers.ts` | `pr-snapshots:record`, `pr-snapshots:getAll` |
| IPC | `src/lib/api.ts` | Add API methods |
| IPC | `electron/preload.ts` | Expose new methods |
| Hook | `src/hooks/use-pr-view-snapshot.ts` | `useRecordPrView()` |
| UI | `src/features/feed/ui-feed-list/feed-item-card.tsx` | Blue dot, comments, approver badges |
| UI | `src/features/pull-request/ui-pr-list-item/index.tsx` | Approver badges (optional) |
| UI | PR detail page & task PR tab | Call `useRecordPrView()` on mount/activate |
