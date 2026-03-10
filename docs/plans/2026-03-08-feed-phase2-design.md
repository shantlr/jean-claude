# Phase 2: Feed — Attention Routing Inbox

> Replaces the task list sidebar in the "All Projects" view with a unified, urgency-sorted feed of items that need the user's attention.

## Problem

Today, Jean-Claude's interaction model is drill-down: pick a project → pick a task → pick a step → read the message stream. When multiple tasks run across multiple projects, there's no single place to see what needs you. You rely on scanning sidebar indicators and desktop notifications.

## Solution

The Feed is a **smart inbox** in the sidebar. It aggregates attention-worthy items from multiple sources (agent tasks, pull requests) into a single flat list sorted by urgency. Users can pin items, mark them low priority, or dismiss them. Clicking an item navigates to the existing task panel or PR view — the Feed is a smarter navigator, not a new interaction surface.

## Scope

**In scope (Phase 2):**

- Feed architecture with extensible source system
- Task attention items (real-time via existing IPC events)
- PR attention items (polled from existing Azure DevOps integration)
- Priority scoring with project tiers
- Pinning, low priority, and dismiss actions
- Project priority setting (high / normal / low)

**Out of scope (future):**

- Azure DevOps pipeline job failures
- Work items assigned to me
- Feed search / filtering
- Inline quick actions (approve permissions from the feed)

## Feed Item Abstraction

A `FeedItem` represents the **current attention state** of a task or PR. It is not an event log — when a task goes from "running" to "needs-permission" to "running," the item updates in place.

```ts
type FeedItemSource = 'task' | 'pull-request';
// Extensible later: 'pipeline' | 'work-item'

type FeedItemAttention =
  | 'needs-permission'
  | 'has-question'
  | 'errored'
  | 'completed'
  | 'interrupted'
  | 'running'
  | 'review-requested'
  | 'pr-comments'
  | 'waiting';

type FeedItem = {
  id: string;                    // e.g. 'task:abc123' or 'pr:456'
  source: FeedItemSource;
  attention: FeedItemAttention;
  priority: number;              // computed finalScore
  timestamp: Date;               // when this attention state was entered
  projectId: string;
  projectName: string;
  projectColor: string;
  title: string;                 // task name or PR title
  subtitle?: string;             // e.g. "Step 2: Implement auth" or "PR #142"
  taskId?: string;
  pullRequestId?: string;
  pinned: boolean;
  pinOrder?: number;             // sort position within pinned zone
  lowPriority: boolean;
  dismissed: boolean;
  lastAttention?: FeedItemAttention;
};
```

## Priority Scoring

### Formula

```
finalScore = baseUrgency + projectBoost + itemOverride
```

Tiebreaker: same score → most recent `timestamp` first.

### Base Urgency (from attention state)

| Base Score | Attention State     |
| ---------- | ------------------- |
| 100        | `errored`           |
| 90         | `needs-permission`  |
| 85         | `has-question`      |
| 70         | `completed`         |
| 60         | `interrupted`       |
| 50         | `review-requested`  |
| 45         | `pr-comments`       |
| 30         | `running`           |
| 10         | `waiting`           |

### Project Priority Tier

Set per project in project settings. New column on `projects` table, defaults to `normal`.

| Tier   | Boost |
| ------ | ----- |
| High   | +30   |
| Normal | 0     |
| Low    | −20   |

### Item Override (user action)

| Override     | Effect                                  |
| ------------ | --------------------------------------- |
| Low priority | −50 (sinks to bottom, still visible)    |
| Dismissed    | Removed from feed entirely              |

### Reset Behavior

- **Low priority** resets automatically when the item's attention state changes.
- **Dismissed** items resurface when their attention state changes.
- **Project tier** is persistent, set once per project.

### Examples

| Scenario                              | Score           |
| ------------------------------------- | --------------- |
| Error on high-priority project        | 100 + 30 = 130 |
| Permission needed on normal project   | 90 + 0 = 90    |
| Running task on low-priority project  | 30 − 20 = 10   |
| PR review marked low-prio            | 50 + 0 − 50 = 0|
| Completed task on high project        | 70 + 30 = 100  |

## Two-Zone Layout

The feed has two zones:

1. **Pinned zone** (top) — manually ordered by the user via drag-and-drop. Only visible when items are pinned.
2. **Auto-sorted zone** (below) — algorithm-controlled, sorted by `finalScore` descending.

Items marked low priority collapse into a "N low priority" expandable row at the bottom.

```
┌─────────────────────────────────┐
│ 📌 Pinned                      │
│ ┌─────────────────────────────┐ │
│ │ ● Auth refactor          2m │ │
│ │   Step 2 · needs permission │ │
│ ├─────────────────────────────┤ │
│ │ ● Deploy script         15m │ │
│ │   Running                   │ │
│ └─────────────────────────────┘ │
│╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
│ ┌─────────────────────────────┐ │
│ │ 🔴 Fix bug #42          30s │ │
│ │   Step 1 · errored          │ │
│ ├─────────────────────────────┤ │
│ │ 🟠 API tests              1m │ │
│ │   Step 3 · needs permission │ │
│ ├─────────────────────────────┤ │
│ │ ✅ Refactor utils         5m │ │
│ │   Completed                 │ │
│ ├─────────────────────────────┤ │
│ │ 🔵 Lint fixes             8m │ │
│ │   Step 1 · running          │ │
│ ├─────────────────────────────┤ │
│ │ 📋 PR #203 — Add caching 20m │ │
│ │   Review requested          │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┈┈┈ 2 low priority ┈┈┈         │
└─────────────────────────────────┘
```

## Feed Item Card

Each card shows:

- **Left**: Project color dot
- **Right**: Relative timestamp
- **Line 1**: Task name or PR title (truncated)
- **Line 2**: Subtitle (current step name + attention badge, or PR number)
- **Visual indicator**: Attention-state icon/color matching existing `TaskSummaryCard` patterns

### Context Menu (right-click)

- 📌 Pin / Unpin
- ↓ Mark low priority / Remove low priority
- ✕ Dismiss
- ↗ Open in project (navigates to `/projects/$id/tasks/$taskId`)

### Keyboard Shortcuts

- `Cmd+1-9` — jump to feed item by position
- `Cmd+↑/↓` — navigate feed items
- `Cmd+Shift+D` — dismiss selected item
- `Cmd+Shift+L` — toggle low priority on selected item

## Drag-and-Drop

Reuses the same drag pattern as the existing Project Todos backlog:

- **Drag into pinned zone**: Item gets pinned at drop position
- **Drag within pinned zone**: Reorders pinned items
- **Drag below divider**: Unpins item, falls back to auto-sorted position
- **No drag in auto-sorted zone**: Algorithm-controlled

## Data Sources & Aggregation

The Feed is a **computed view** — no new database table for feed items. Assembled in real-time from existing data.

### Architecture

```
┌─────────────────────────────────────────────┐
│               Feed Aggregator               │
│          (electron/services/feed-service.ts) │
├─────────────┬───────────────────────────────┤
│  Task Source │       PR Source              │
│  (real-time) │       (polled)              │
├─────────────┼───────────────────────────────┤
│ task repo    │  azure-devops-service        │
│ task-steps   │  (existing PR queries)       │
│ agent events │                              │
└─────────────┴───────────────────────────────┘
         ↓ IPC: feed:items-changed
┌─────────────────────────────────────────────┐
│           Renderer (Zustand + React Query)  │
│  feed store: pins, overrides, dismissed     │
│  React Query: feed items from main process  │
│  Computed: merged + scored + sorted         │
└─────────────────────────────────────────────┘
```

### Task Source (real-time)

Listens to existing IPC agent events (`agent:status`, `agent:permission`, `agent:question`). Derives attention state by scanning all steps in a task — the highest-urgency step state wins:

- Any step errored → `errored`
- Any step needs permission → `needs-permission`
- Any step has question → `has-question`
- All steps completed → `completed`
- Any step running → `running`
- Otherwise → `waiting`

### PR Source (polled)

For projects with Azure DevOps linked, polls assigned PRs and PR activity every ~3 minutes using existing `azure-devops-service.ts`.

### IPC Contract

```ts
'feed:getItems': () => FeedItem[];           // initial load
'feed:items-changed': (items: FeedItem[]) => void;  // pushed on change
'feed:refresh': () => FeedItem[];            // manual refresh
```

### Renderer Responsibilities

Pin state, dismissed set, low-priority set, and pin order live in a Zustand store (`stores/feed.ts`) persisted to localStorage. The main process sends raw items; the renderer merges with overrides and computes the final sorted list.

## Integration

### Sidebar Switching

```tsx
// ui-main-sidebar
if (projectId === 'all') {
  return <FeedList />;
}
return <TaskList projectId={projectId} />;
```

Per-project task list is unchanged.

### Navigation

- Task items → `/all/${taskId}` (existing route)
- PR items → `/all/prs/${projectId}/${prId}` (existing route)

Main content area is unchanged — Feed only affects the sidebar.

### Database Change

One new column on `projects` table:

```sql
ALTER TABLE projects ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
-- CHECK (priority IN ('high', 'normal', 'low'))
```

### New Files

```
src/
  features/feed/
    ui-feed-list/
      index.tsx              # Main feed sidebar component
      feed-item-card.tsx     # Individual feed item card
      feed-pinned-zone.tsx   # Pinned section with drag-to-reorder
      feed-low-priority.tsx  # Collapsed low-prio section
    utils-feed-scoring.ts    # Priority computation (pure function)
  stores/
    feed.ts                  # Zustand: pins, dismissed, low-prio overrides
  hooks/
    use-feed.ts              # React Query hook for feed items from main

electron/
  services/
    feed-service.ts          # Aggregates tasks + PRs into FeedItem[]
  ipc/
    handlers.ts              # Add feed:getItems, feed:refresh handlers
```

## State Transitions

```
                    ┌──────────────────┐
                    │   Normal item    │
                    │ (auto-sorted)    │
                    └──┬──────┬───┬────┘
                  drag │  ctx  │   │ ctx menu
                  up   │  menu │   │
                  ┌────▼──┐ ┌─▼───▼──────┐
                  │Pinned │ │Low priority │
                  │       │ │ (collapsed) │
                  └───────┘ └─────┬───────┘
                                  │ ctx menu
                              ┌───▼──────┐
                              │Dismissed │
                              │(hidden)  │
                              └──────────┘

    ── attention state changes ──→ resets low-prio & dismissed
```
