# Feed (Phase 2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the task list sidebar in the "All Projects" view with a unified, urgency-sorted attention feed that aggregates tasks and PRs.

**Architecture:** The feed is a computed view — no new database table for feed items. A main-process `feed-service` aggregates tasks (real-time) and PRs (polled) into `FeedItem[]`, pushed to the renderer via IPC. The renderer merges raw items with user overrides (pins, dismissed, low-priority) from a persisted Zustand store, applies priority scoring, and renders a two-zone sidebar list (pinned + auto-sorted).

**Tech Stack:** Electron IPC, Kysely (migration), Zustand (persist), React Query, TanStack Router, HTML5 drag-and-drop.

**Design doc:** `docs/plans/2026-03-08-feed-phase2-design.md`

---

## Task 1: Shared Types — `shared/feed-types.ts`

**Files:**
- Create: `shared/feed-types.ts`

**Step 1: Create the feed types file**

```ts
// shared/feed-types.ts

export type FeedItemSource = 'task' | 'pull-request';

export type FeedItemAttention =
  | 'needs-permission'
  | 'has-question'
  | 'errored'
  | 'completed'
  | 'interrupted'
  | 'running'
  | 'review-requested'
  | 'pr-comments'
  | 'waiting';

export type ProjectPriority = 'high' | 'normal' | 'low';

export type FeedItem = {
  id: string;
  source: FeedItemSource;
  attention: FeedItemAttention;
  timestamp: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  title: string;
  subtitle?: string;
  taskId?: string;
  pullRequestId?: number;
  pullRequestUrl?: string;
};
```

Note: `FeedItem` from the main process is **raw** — no pin/dismissed/lowPriority fields. Those live in the renderer Zustand store. The `timestamp` is ISO string (consistent with all other dates in the codebase). `priority` is computed on the renderer side.

**Step 2: Add `ProjectPriority` to `shared/types.ts`**

Add `priority` field to the `Project` interface in `shared/types.ts` (~line 190, after `completionContext`):

```ts
priority: ProjectPriority;
```

Import `ProjectPriority` from `shared/feed-types.ts`.

Also add to `UpdateProject` interface:

```ts
priority?: ProjectPriority;
```

**Step 3: Commit**

```
feat: add shared feed types and project priority to Project type
```

---

## Task 2: Database Migration — `034_project_priority.ts`

**Files:**
- Create: `electron/database/migrations/034_project_priority.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Create migration file**

```ts
// electron/database/migrations/034_project_priority.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('priority', 'text', (col) => col.notNull().defaultTo('normal'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('projects').dropColumn('priority').execute();
}
```

**Step 2: Register migration in `electron/database/migrator.ts`**

Add import after line 34:

```ts
import * as m034 from './migrations/034_project_priority';
```

Add to `migrations` object after line 68:

```ts
'034_project_priority': m034,
```

**Step 3: Update `electron/database/schema.ts`**

Add `priority` column to `ProjectTable` interface (after `completionContext`):

```ts
priority: string;
```

**Step 4: Commit**

```
feat: add project priority column via migration 034
```

---

## Task 3: Project Repository & IPC — Expose Priority

**Files:**
- Modify: `electron/database/repositories/projects.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Update project repository**

The `findAll`, `findById`, `create`, `update` methods already use `selectAll()` and pass through all columns, so the new `priority` column is automatically returned. No repository changes needed — the Kysely schema type update from Task 2 handles it.

Verify the `toTask` equivalent for projects returns all fields. In `projects.ts`, the repository returns raw rows directly (no `toProject` conversion). This means the `priority` field flows through automatically.

**Step 2: Add `priority` to `TaskWithProject` join queries**

In `electron/database/repositories/tasks.ts`, the `findAllActive` method (line 180) joins with projects and selects `projects.name` and `projects.color`. Add `projects.priority` to the select list:

```ts
.select([
  'projects.name as projectName',
  'projects.color as projectColor',
  'projects.priority as projectPriority',
])
```

Do the same for `findAllCompleted` (line 195).

**Step 3: Update `TaskWithProject` type in `src/lib/api.ts`**

Add to the `TaskWithProject` interface:

```ts
projectPriority: ProjectPriority;
```

Import `ProjectPriority` from `@shared/feed-types`.

**Step 4: No preload/handler changes needed**

The existing `projects:update` handler already passes arbitrary `UpdateProject` data through. Since we added `priority` to `UpdateProject` in Task 1, it's already supported.

**Step 5: Commit**

```
feat: expose project priority through repository and API types
```

---

## Task 4: Feed Scoring — `src/features/feed/utils-feed-scoring.ts`

**Files:**
- Create: `src/features/feed/utils-feed-scoring.ts`

**Step 1: Create the pure scoring function**

```ts
// src/features/feed/utils-feed-scoring.ts
import type { FeedItemAttention, ProjectPriority } from '@shared/feed-types';

const BASE_URGENCY: Record<FeedItemAttention, number> = {
  errored: 100,
  'needs-permission': 90,
  'has-question': 85,
  completed: 70,
  interrupted: 60,
  'review-requested': 50,
  'pr-comments': 45,
  running: 30,
  waiting: 10,
};

const PROJECT_BOOST: Record<ProjectPriority, number> = {
  high: 30,
  normal: 0,
  low: -20,
};

const LOW_PRIORITY_PENALTY = -50;

export function computeFeedScore({
  attention,
  projectPriority,
  isLowPriority,
}: {
  attention: FeedItemAttention;
  projectPriority: ProjectPriority;
  isLowPriority: boolean;
}): number {
  return (
    BASE_URGENCY[attention] +
    PROJECT_BOOST[projectPriority] +
    (isLowPriority ? LOW_PRIORITY_PENALTY : 0)
  );
}

export function getBaseUrgency(attention: FeedItemAttention): number {
  return BASE_URGENCY[attention];
}
```

**Step 2: Commit**

```
feat: add feed priority scoring utility
```

---

## Task 5: Feed Zustand Store — `src/stores/feed.ts`

**Files:**
- Create: `src/stores/feed.ts`

**Step 1: Create the feed overrides store**

This store manages user overrides (pins, dismissed, low-priority) and merges them with raw feed items from the main process. It persists to localStorage.

```ts
// src/stores/feed.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { FeedItemAttention } from '@shared/feed-types';

interface PinnedItem {
  id: string;
  order: number;
}

interface FeedOverridesState {
  pinned: PinnedItem[];
  dismissed: string[];
  lowPriority: string[];
  /** Tracks last-seen attention per item for auto-reset */
  lastAttention: Record<string, FeedItemAttention>;

  pin: (id: string) => void;
  unpin: (id: string) => void;
  reorderPinned: (orderedIds: string[]) => void;
  dismiss: (id: string) => void;
  undismiss: (id: string) => void;
  toggleLowPriority: (id: string) => void;
  /** Called when new feed items arrive — resets overrides if attention changed */
  reconcile: (items: { id: string; attention: FeedItemAttention }[]) => void;
}

export const useFeedStore = create<FeedOverridesState>()(
  persist(
    (set, get) => ({
      pinned: [],
      dismissed: [],
      lowPriority: [],
      lastAttention: {},

      pin: (id) =>
        set((state) => {
          if (state.pinned.some((p) => p.id === id)) return state;
          const maxOrder = state.pinned.reduce(
            (max, p) => Math.max(max, p.order),
            -1,
          );
          return {
            pinned: [...state.pinned, { id, order: maxOrder + 1 }],
          };
        }),

      unpin: (id) =>
        set((state) => ({
          pinned: state.pinned.filter((p) => p.id !== id),
        })),

      reorderPinned: (orderedIds) =>
        set(() => ({
          pinned: orderedIds.map((id, i) => ({ id, order: i })),
        })),

      dismiss: (id) =>
        set((state) => ({
          dismissed: [...state.dismissed, id],
        })),

      undismiss: (id) =>
        set((state) => ({
          dismissed: state.dismissed.filter((d) => d !== id),
        })),

      toggleLowPriority: (id) =>
        set((state) => {
          const isLow = state.lowPriority.includes(id);
          return {
            lowPriority: isLow
              ? state.lowPriority.filter((l) => l !== id)
              : [...state.lowPriority, id],
          };
        }),

      reconcile: (items) =>
        set((state) => {
          const prev = state.lastAttention;
          const nextAttention: Record<string, FeedItemAttention> = {};
          let dismissedChanged = false;
          let lowPrioChanged = false;
          const newDismissed = [...state.dismissed];
          const newLowPriority = [...state.lowPriority];

          for (const item of items) {
            nextAttention[item.id] = item.attention;
            const prevAttention = prev[item.id];
            if (prevAttention && prevAttention !== item.attention) {
              // Attention changed — reset overrides for this item
              const dIdx = newDismissed.indexOf(item.id);
              if (dIdx !== -1) {
                newDismissed.splice(dIdx, 1);
                dismissedChanged = true;
              }
              const lIdx = newLowPriority.indexOf(item.id);
              if (lIdx !== -1) {
                newLowPriority.splice(lIdx, 1);
                lowPrioChanged = true;
              }
            }
          }

          return {
            lastAttention: nextAttention,
            ...(dismissedChanged ? { dismissed: newDismissed } : {}),
            ...(lowPrioChanged ? { lowPriority: newLowPriority } : {}),
          };
        }),
    }),
    {
      name: 'jean-claude-feed-overrides',
      partialize: (state) => ({
        pinned: state.pinned,
        dismissed: state.dismissed,
        lowPriority: state.lowPriority,
        lastAttention: state.lastAttention,
      }),
    },
  ),
);
```

**Step 2: Commit**

```
feat: add feed overrides Zustand store with pin/dismiss/low-priority
```

---

## Task 6: Feed Service — `electron/services/feed-service.ts`

**Files:**
- Create: `electron/services/feed-service.ts`

**Step 1: Create the feed service**

The feed service aggregates tasks and PRs into raw `FeedItem[]`. It derives attention state from tasks+steps and wraps PR data.

```ts
// electron/services/feed-service.ts
import debug from 'debug';

import type {
  FeedItem,
  FeedItemAttention,
} from '@shared/feed-types';
import type { TaskStatus } from '@shared/types';

import { TaskRepository } from '../database/repositories/tasks';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { ProjectRepository } from '../database/repositories/projects';

const dbg = debug('jc:feed');

function deriveTaskAttention(
  taskStatus: TaskStatus,
  stepStatuses: string[],
): FeedItemAttention {
  // Check step-level states (highest urgency wins)
  if (stepStatuses.includes('errored')) return 'errored';

  // Task-level 'waiting' means agent is paused for permission or question
  // The specific type (permission vs question) is determined by the renderer
  // from the task-messages store. At the feed level, we use the task status.
  if (taskStatus === 'waiting') return 'needs-permission';
  if (taskStatus === 'errored') return 'errored';
  if (taskStatus === 'completed') return 'completed';
  if (taskStatus === 'interrupted') return 'interrupted';
  if (stepStatuses.includes('running') || taskStatus === 'running')
    return 'running';

  return 'waiting';
}

export async function getFeedItems(): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  // --- Task source ---
  const tasks = await TaskRepository.findAllActive();
  // Also include recently completed tasks (last 24h)
  const recentCompleted = await TaskRepository.findAllCompleted({
    limit: 20,
    offset: 0,
  });

  const allTasks = [
    ...tasks,
    ...recentCompleted.tasks,
  ];

  // Deduplicate (findAllActive returns non-completed, findAllCompleted returns completed)
  const seen = new Set<string>();

  for (const task of allTasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);

    const steps = await TaskStepRepository.findByTaskId(task.id);
    const stepStatuses = steps.map((s) => s.status);
    const attention = deriveTaskAttention(
      task.status as TaskStatus,
      stepStatuses,
    );

    // Find the most relevant step for subtitle
    const activeStep =
      steps.find((s) => s.status === 'running') ??
      steps.find((s) => s.status === 'ready') ??
      steps[steps.length - 1];

    const subtitle =
      steps.length > 1 && activeStep?.name
        ? `${activeStep.name}`
        : undefined;

    items.push({
      id: `task:${task.id}`,
      source: 'task',
      attention,
      timestamp: task.updatedAt,
      projectId: task.projectId,
      projectName: (task as Record<string, unknown>).projectName as string ?? '',
      projectColor: (task as Record<string, unknown>).projectColor as string ?? '',
      title: task.name ?? task.prompt.split('\n')[0].slice(0, 60),
      subtitle,
      taskId: task.id,
    });
  }

  // --- PR source ---
  // PRs are fetched on-demand via polling. For the initial implementation,
  // we fetch from projects that have Azure DevOps repo linking configured.
  // This is handled separately by the PR polling mechanism.
  // The feed service only returns task items synchronously;
  // PR items are merged on the renderer side from a separate query.

  dbg('getFeedItems: %d items', items.length);
  return items;
}
```

Note: PR items will be integrated as a follow-up within this task list (Task 9). The feed service starts with tasks to get the core loop working.

**Step 2: Commit**

```
feat: add feed service for deriving task attention states
```

---

## Task 7: Feed IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handlers in `electron/ipc/handlers.ts`**

Add near the end of the handler registration (before the closing of the function), after the skills handlers:

```ts
// Feed
ipcMain.handle('feed:getItems', async () => {
  const { getFeedItems } = await import('../services/feed-service');
  return getFeedItems();
});
```

**Step 2: Add preload bridge in `electron/preload.ts`**

Add a `feed` section to the `contextBridge.exposeInMainWorld('api', { ... })` object:

```ts
feed: {
  getItems: () => ipcRenderer.invoke('feed:getItems'),
},
```

**Step 3: Add API types in `src/lib/api.ts`**

Import `FeedItem` from `@shared/feed-types`. Add to the `Api` interface:

```ts
feed: {
  getItems: () => Promise<FeedItem[]>;
};
```

**Step 4: Commit**

```
feat: add feed IPC handlers, preload bridge, and API types
```

---

## Task 8: Feed React Query Hook — `src/hooks/use-feed.ts`

**Files:**
- Create: `src/hooks/use-feed.ts`

**Step 1: Create the hook**

```ts
// src/hooks/use-feed.ts
import { useQuery } from '@tanstack/react-query';

import type { FeedItem, ProjectPriority } from '@shared/feed-types';

import { useFeedStore } from '@/stores/feed';
import { computeFeedScore } from '@/features/feed/utils-feed-scoring';

const api = window.api;

export function useFeedItems() {
  const pinned = useFeedStore((s) => s.pinned);
  const dismissed = useFeedStore((s) => s.dismissed);
  const lowPriority = useFeedStore((s) => s.lowPriority);
  const reconcile = useFeedStore((s) => s.reconcile);

  const query = useQuery({
    queryKey: ['feed', 'items'],
    queryFn: async () => {
      const items = await api.feed.getItems();
      // Reconcile attention changes to auto-reset overrides
      reconcile(items.map((i) => ({ id: i.id, attention: i.attention })));
      return items;
    },
    refetchInterval: 3000, // Poll every 3 seconds for task status changes
  });

  const rawItems = query.data ?? [];

  // Partition into pinned, auto-sorted, and low-priority
  const dismissedSet = new Set(dismissed);
  const lowPrioSet = new Set(lowPriority);
  const pinnedIds = new Set(pinned.map((p) => p.id));

  const visibleItems = rawItems.filter((item) => !dismissedSet.has(item.id));

  const pinnedItems = pinned
    .map((p) => visibleItems.find((item) => item.id === p.id))
    .filter((item): item is FeedItem => item != null);

  const unpinnedItems = visibleItems.filter((item) => !pinnedIds.has(item.id));

  const normalItems = unpinnedItems
    .filter((item) => !lowPrioSet.has(item.id))
    .map((item) => ({
      item,
      score: computeFeedScore({
        attention: item.attention,
        projectPriority:
          ((item as Record<string, unknown>).projectPriority as ProjectPriority) ?? 'normal',
        isLowPriority: false,
      }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.item.timestamp).getTime() - new Date(a.item.timestamp).getTime();
    })
    .map((entry) => entry.item);

  const lowPriorityItems = unpinnedItems.filter((item) =>
    lowPrioSet.has(item.id),
  );

  return {
    ...query,
    pinnedItems,
    normalItems,
    lowPriorityItems,
    dismissedCount: rawItems.length - visibleItems.length,
  };
}
```

Note: We use short polling (3s) since the feed service reads from the database which is updated in real-time by the agent service. This is simpler than adding a dedicated IPC push channel and performs well given the small payload.

**Step 2: Commit**

```
feat: add useFeedItems hook with scoring and override merging
```

---

## Task 9: Feed Item Card — `src/features/feed/ui-feed-list/feed-item-card.tsx`

**Files:**
- Create: `src/features/feed/ui-feed-list/feed-item-card.tsx`

**Step 1: Create the feed item card component**

Model after the existing `TaskSummaryCard` component patterns. Shows project color dot, title, subtitle, attention indicator, and relative time.

```tsx
// src/features/feed/ui-feed-list/feed-item-card.tsx
import { useCallback, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertCircle,
  CheckCircle2,
  CirclePause,
  GitPullRequest,
  Loader2,
  MessageCircleQuestion,
  ShieldQuestion,
} from 'lucide-react';

import type { FeedItem, FeedItemAttention } from '@shared/feed-types';

import { useFeedStore } from '@/stores/feed';
import { formatRelativeTime } from '@/lib/time';

function AttentionIcon({ attention }: { attention: FeedItemAttention }) {
  switch (attention) {
    case 'errored':
      return <AlertCircle size={14} className="text-red-400" />;
    case 'needs-permission':
      return <ShieldQuestion size={14} className="text-amber-400" />;
    case 'has-question':
      return <MessageCircleQuestion size={14} className="text-amber-400" />;
    case 'completed':
      return <CheckCircle2 size={14} className="text-green-400" />;
    case 'interrupted':
      return <CirclePause size={14} className="text-yellow-400" />;
    case 'running':
      return <Loader2 size={14} className="animate-spin text-blue-400" />;
    case 'review-requested':
    case 'pr-comments':
      return <GitPullRequest size={14} className="text-purple-400" />;
    case 'waiting':
      return <div className="h-2 w-2 rounded-full bg-neutral-500" />;
  }
}

const ATTENTION_LABELS: Record<FeedItemAttention, string> = {
  errored: 'Errored',
  'needs-permission': 'Needs permission',
  'has-question': 'Has question',
  completed: 'Completed',
  interrupted: 'Interrupted',
  running: 'Running',
  'review-requested': 'Review requested',
  'pr-comments': 'New comments',
  waiting: 'Waiting',
};

export function FeedItemCard({
  item,
  isSelected,
  isDraggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  item: FeedItem;
  isSelected?: boolean;
  isDraggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const navigate = useNavigate();
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const pin = useFeedStore((s) => s.pin);
  const unpin = useFeedStore((s) => s.unpin);
  const dismiss = useFeedStore((s) => s.dismiss);
  const toggleLowPriority = useFeedStore((s) => s.toggleLowPriority);
  const isPinned = useFeedStore((s) => s.pinned.some((p) => p.id === item.id));
  const isLowPriority = useFeedStore((s) => s.lowPriority.includes(item.id));

  const handleClick = useCallback(() => {
    if (item.source === 'task' && item.taskId) {
      navigate({ to: '/all/$taskId', params: { taskId: item.taskId } });
    } else if (item.source === 'pull-request' && item.pullRequestId) {
      navigate({
        to: '/all/prs/$projectId/$prId',
        params: {
          projectId: item.projectId,
          prId: String(item.pullRequestId),
        },
      });
    }
  }, [item, navigate]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);
    },
    [],
  );

  const borderColor = (() => {
    if (isSelected) return 'border-blue-500/50';
    if (item.attention === 'errored') return 'border-red-500/30';
    if (
      item.attention === 'needs-permission' ||
      item.attention === 'has-question'
    )
      return 'border-amber-500/30';
    if (item.attention === 'running') return 'border-blue-500/20';
    return 'border-transparent';
  })();

  return (
    <>
      <div
        draggable={isDraggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={clsx(
          'group flex cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-2 transition-all',
          borderColor,
          isSelected
            ? 'bg-neutral-700/80'
            : 'hover:translate-x-0.5 hover:bg-neutral-800/80',
        )}
      >
        {/* Row 1: project dot + title + time */}
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.projectColor }}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-200">
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-neutral-500">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>

        {/* Row 2: attention icon + label + subtitle */}
        <div className="flex items-center gap-1.5 pl-4">
          <AttentionIcon attention={item.attention} />
          <span className="text-xs text-neutral-400">
            {ATTENTION_LABELS[item.attention]}
          </span>
          {item.subtitle && (
            <>
              <span className="text-xs text-neutral-600">·</span>
              <span className="truncate text-xs text-neutral-500">
                {item.subtitle}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Context menu */}
      {showContextMenu && (
        <FeedItemContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          isPinned={isPinned}
          isLowPriority={isLowPriority}
          onPin={() => {
            isPinned ? unpin(item.id) : pin(item.id);
            setShowContextMenu(false);
          }}
          onDismiss={() => {
            dismiss(item.id);
            setShowContextMenu(false);
          }}
          onToggleLowPriority={() => {
            toggleLowPriority(item.id);
            setShowContextMenu(false);
          }}
          onNavigateToProject={() => {
            if (item.taskId) {
              navigate({
                to: '/projects/$projectId/tasks/$taskId',
                params: { projectId: item.projectId, taskId: item.taskId },
              });
            }
            setShowContextMenu(false);
          }}
          onClose={() => setShowContextMenu(false)}
        />
      )}
    </>
  );
}

function FeedItemContextMenu({
  x,
  y,
  isPinned,
  isLowPriority,
  onPin,
  onDismiss,
  onToggleLowPriority,
  onNavigateToProject,
  onClose,
}: {
  x: number;
  y: number;
  isPinned: boolean;
  isLowPriority: boolean;
  onPin: () => void;
  onDismiss: () => void;
  onToggleLowPriority: () => void;
  onNavigateToProject: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[180px] rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-xl"
        style={{ left: x, top: y }}
      >
        <button
          onClick={onPin}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-700"
        >
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          onClick={onToggleLowPriority}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-700"
        >
          {isLowPriority ? 'Remove low priority' : 'Mark low priority'}
        </button>
        <button
          onClick={onDismiss}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-700"
        >
          Dismiss
        </button>
        <div className="my-1 border-t border-neutral-700" />
        <button
          onClick={onNavigateToProject}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-700"
        >
          Open in project
        </button>
      </div>
    </>
  );
}
```

**Step 2: Commit**

```
feat: add FeedItemCard component with attention indicators and context menu
```

---

## Task 10: Feed List — `src/features/feed/ui-feed-list/index.tsx`

**Files:**
- Create: `src/features/feed/ui-feed-list/index.tsx`

**Step 1: Create the feed list component**

This is the main sidebar component when viewing "All Projects." It renders three zones: pinned, auto-sorted, and collapsed low-priority.

```tsx
// src/features/feed/ui-feed-list/index.tsx
import { useCallback, useState } from 'react';

import clsx from 'clsx';
import { ChevronDown, ChevronRight, Pin } from 'lucide-react';
import { useParams } from '@tanstack/react-router';

import { useFeedItems } from '@/hooks/use-feed';
import { useFeedStore } from '@/stores/feed';
import { FeedItemCard } from './feed-item-card';

export function FeedList() {
  const params = useParams({ strict: false });
  const currentTaskId = params.taskId as string | undefined;

  const { pinnedItems, normalItems, lowPriorityItems } = useFeedItems();
  const reorderPinned = useFeedStore((s) => s.reorderPinned);
  const pin = useFeedStore((s) => s.pin);
  const unpin = useFeedStore((s) => s.unpin);

  const [lowPriorityExpanded, setLowPriorityExpanded] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverPinZone, setDragOverPinZone] = useState(false);

  // --- Pinned zone drag handlers ---
  const handlePinnedDragStart = useCallback(
    (id: string) => {
      setDraggedId(id);
    },
    [],
  );

  const handlePinnedDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(targetId);
    },
    [],
  );

  const handlePinnedDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedId || draggedId === targetId) {
        setDragOverId(null);
        setDraggedId(null);
        return;
      }

      const currentOrder = pinnedItems.map((item) => item.id);

      // If dragged item isn't pinned yet, pin it
      if (!currentOrder.includes(draggedId)) {
        pin(draggedId);
        // Insert at target position
        const targetIdx = currentOrder.indexOf(targetId);
        currentOrder.splice(targetIdx, 0, draggedId);
        reorderPinned(currentOrder);
      } else {
        // Reorder within pinned
        const fromIdx = currentOrder.indexOf(draggedId);
        const toIdx = currentOrder.indexOf(targetId);
        currentOrder.splice(fromIdx, 1);
        currentOrder.splice(toIdx, 0, draggedId);
        reorderPinned(currentOrder);
      }

      setDragOverId(null);
      setDraggedId(null);
    },
    [draggedId, pinnedItems, pin, reorderPinned],
  );

  const handlePinZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPinZone(true);
  }, []);

  const handlePinZoneDragLeave = useCallback(() => {
    setDragOverPinZone(false);
  }, []);

  const handlePinZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedId) {
        pin(draggedId);
      }
      setDragOverPinZone(false);
      setDraggedId(null);
    },
    [draggedId, pin],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
    setDragOverPinZone(false);
  }, []);

  const isSelected = (itemId: string, taskId?: string) =>
    taskId === currentTaskId;

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-2 py-2">
      {/* Pinned zone */}
      {(pinnedItems.length > 0 || draggedId) && (
        <div
          onDragOver={handlePinZoneDragOver}
          onDragLeave={handlePinZoneDragLeave}
          onDrop={handlePinZoneDrop}
          className={clsx(
            'flex flex-col gap-1 rounded-md p-1 transition-colors',
            dragOverPinZone && 'bg-blue-500/10',
          )}
        >
          <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-neutral-500">
            <Pin size={12} />
            Pinned
          </div>
          {pinnedItems.map((item) => (
            <FeedItemCard
              key={item.id}
              item={item}
              isSelected={isSelected(item.id, item.taskId)}
              isDraggable
              onDragStart={() => handlePinnedDragStart(item.id)}
              onDragOver={(e) => handlePinnedDragOver(e, item.id)}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => handlePinnedDrop(e, item.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Divider between pinned and auto-sorted */}
      {pinnedItems.length > 0 && normalItems.length > 0 && (
        <div className="mx-2 border-t border-dashed border-neutral-700/50" />
      )}

      {/* Auto-sorted zone */}
      {normalItems.map((item) => (
        <FeedItemCard
          key={item.id}
          item={item}
          isSelected={isSelected(item.id, item.taskId)}
          isDraggable
          onDragStart={() => setDraggedId(item.id)}
          onDragEnd={handleDragEnd}
        />
      ))}

      {/* Empty state */}
      {pinnedItems.length === 0 &&
        normalItems.length === 0 &&
        lowPriorityItems.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
            No active tasks
          </div>
        )}

      {/* Low priority collapsed section */}
      {lowPriorityItems.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setLowPriorityExpanded(!lowPriorityExpanded)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-800/50 hover:text-neutral-400"
          >
            {lowPriorityExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            {lowPriorityItems.length} low priority
          </button>
          {lowPriorityExpanded && (
            <div className="flex flex-col gap-1 pt-1 opacity-60">
              {lowPriorityItems.map((item) => (
                <FeedItemCard
                  key={item.id}
                  item={item}
                  isSelected={isSelected(item.id, item.taskId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```
feat: add FeedList component with pinned zone, auto-sort, and low-priority section
```

---

## Task 11: Sidebar Integration

**Files:**
- Modify: `src/layout/ui-main-sidebar/index.tsx`
- Modify: `src/features/task/ui-task-list/index.tsx` (if needed)

**Step 1: Conditionally render FeedList in MainSidebar**

The `MainSidebar` currently always renders `<TaskList />`. We need to swap in `<FeedList />` when the user is in the "all" context.

Import `useCurrentVisibleProject` from `@/stores/navigation` and `FeedList` from `@/features/feed/ui-feed-list`.

Replace the `<TaskList />` render with:

```tsx
const { projectId } = useCurrentVisibleProject();

// ... in the JSX:
{projectId === 'all' ? <FeedList /> : <TaskList />}
```

The sidebar tabs component (`SidebarContentTabs`) can remain as-is — when in "all" mode, the "Tasks" tab shows the feed instead of the task list. The "PRs" tab can continue to work as before.

**Step 2: Commit**

```
feat: show FeedList in sidebar when viewing all projects
```

---

## Task 12: Project Priority Setting UI

**Files:**
- Modify: Project settings or project header component

**Step 1: Add priority selector to project settings**

Find where project settings are edited. Add a simple dropdown/select for the project priority tier. Use the existing `Select` component from `src/common/ui/select/`.

Look at how `defaultAgentBackend` or `defaultBranch` are configured in the project settings for the pattern to follow. Add a similar section for "Project Priority" with options: High, Normal, Low.

The mutation uses the existing `useUpdateProject` hook:

```ts
const { mutate: updateProject } = useUpdateProject();

// On change:
updateProject({
  id: projectId,
  data: { priority: 'high' },
});
```

**Step 2: Commit**

```
feat: add project priority setting to project configuration
```

---

## Task 13: Keyboard Shortcuts

**Files:**
- Modify: `src/features/feed/ui-feed-list/index.tsx`

**Step 1: Register feed keyboard shortcuts**

Use the `useCommands` hook (same pattern as `TaskList`) to register:

- `Cmd+1-9` — jump to feed item by position (overrides task list bindings since feed replaces it)
- `Cmd+↑/↓` — navigate feed items
- `Cmd+Shift+D` — dismiss selected item
- `Cmd+Shift+L` — toggle low priority on selected item

Follow the same pattern used in `ui-task-list/index.tsx` for `Cmd+1-9` and `Cmd+↑/↓` navigation. The feed-specific shortcuts (`Cmd+Shift+D`, `Cmd+Shift+L`) operate on the currently selected item by looking up `currentTaskId` in the feed items and calling the corresponding store actions.

**Step 2: Commit**

```
feat: add keyboard shortcuts for feed navigation and actions
```

---

## Task 14: Differentiate Permission vs Question Attention

**Files:**
- Modify: `src/hooks/use-feed.ts`

**Step 1: Enhance attention detection with renderer-side state**

The feed service returns `needs-permission` for any task in `waiting` status. But the renderer has more granular info from the `task-messages` store (which tracks `pendingPermission` vs `pendingQuestion` per step).

In `useFeedItems`, after receiving raw items from the main process, refine the attention for task items:

```ts
import { useTaskMessagesStore } from '@/stores/task-messages';

// Inside the hook, after fetching:
const steps = useTaskMessagesStore((s) => s.steps);

const refinedItems = rawItems.map((item) => {
  if (item.source !== 'task' || item.attention !== 'needs-permission') return item;

  // Check if any step for this task has a question instead of permission
  const hasQuestion = Object.values(steps).some(
    (step) => step.pendingQuestion?.taskId === item.taskId,
  );
  if (hasQuestion) {
    return { ...item, attention: 'has-question' as const };
  }
  return item;
});
```

**Step 2: Commit**

```
feat: refine feed attention using renderer-side permission/question state
```

---

## Task 15: Feed-Aware Agent Event Invalidation

**Files:**
- Modify: `src/hooks/use-feed.ts` or the agent event listener

**Step 1: Invalidate feed query on agent status changes**

The feed query polls every 3 seconds, but we can make it more responsive by invalidating the query when agent events arrive. Find where `agent:event` IPC messages are handled in the renderer (likely in `useAgentStream` or similar hook) and add a query invalidation:

```ts
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

// When agent status event arrives:
queryClient.invalidateQueries({ queryKey: ['feed', 'items'] });
```

This makes status changes appear instantly in the feed instead of waiting up to 3 seconds.

**Step 2: Commit**

```
feat: invalidate feed query on agent status events for instant updates
```

---

## Task 16: PR Feed Items (Existing Azure DevOps Data)

**Files:**
- Modify: `electron/services/feed-service.ts`

**Step 1: Add PR items to the feed service**

Extend `getFeedItems()` to include PRs from projects with Azure DevOps repo linking. Use the existing `listPullRequests` function from `azure-devops-service.ts`.

```ts
import { listPullRequests } from './azure-devops-service';

// Inside getFeedItems(), after task items:
const projects = await ProjectRepository.findAll();
const projectsWithRepo = projects.filter(
  (p) => p.repoProviderId && p.repoProjectId && p.repoId,
);

for (const project of projectsWithRepo) {
  try {
    const prs = await listPullRequests({
      providerId: project.repoProviderId!,
      projectId: project.repoProjectId!,
      repoId: project.repoId!,
      status: 'active',
    });

    for (const pr of prs) {
      // Determine if this is a "review requested" PR (not created by me)
      // For now, include all active PRs as review-requested
      items.push({
        id: `pr:${project.id}:${pr.id}`,
        source: 'pull-request',
        attention: 'review-requested',
        timestamp: pr.creationDate,
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        title: pr.title,
        subtitle: `PR #${pr.id}`,
        pullRequestId: pr.id,
        pullRequestUrl: pr.url,
      });
    }
  } catch (error) {
    dbg('Failed to fetch PRs for project %s: %O', project.name, error);
    // Non-fatal — continue with other projects
  }
}
```

**Step 2: Add caching to avoid hitting Azure DevOps API on every poll**

The feed is polled every 3 seconds from the renderer, but we shouldn't hit Azure DevOps that often. Add a simple in-memory cache with a 3-minute TTL for PR data:

```ts
let prCache: { items: FeedItem[]; fetchedAt: number } | null = null;
const PR_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

async function getPrFeedItems(): Promise<FeedItem[]> {
  if (prCache && Date.now() - prCache.fetchedAt < PR_CACHE_TTL_MS) {
    return prCache.items;
  }
  // ... fetch and cache
  prCache = { items, fetchedAt: Date.now() };
  return items;
}
```

**Step 3: Commit**

```
feat: add PR items to feed with 3-minute cache
```

---

## Task 17: Lint, Type-Check, Verify

**Step 1: Run lint with autofix**

```bash
pnpm install
pnpm lint --fix
```

**Step 2: Run type-check**

```bash
pnpm ts-check
```

Fix any TypeScript errors.

**Step 3: Run lint again**

```bash
pnpm lint
```

Fix any remaining issues.

**Step 4: Commit any fixes**

```
chore: fix lint and type errors from feed implementation
```

---

## Summary of All Files

**Created:**
- `shared/feed-types.ts` — Feed type definitions
- `electron/database/migrations/034_project_priority.ts` — Migration
- `electron/services/feed-service.ts` — Feed data aggregation
- `src/features/feed/utils-feed-scoring.ts` — Priority scoring
- `src/features/feed/ui-feed-list/index.tsx` — Feed sidebar list
- `src/features/feed/ui-feed-list/feed-item-card.tsx` — Feed item card
- `src/stores/feed.ts` — Feed overrides store
- `src/hooks/use-feed.ts` — Feed React Query hook

**Modified:**
- `shared/types.ts` — Add `priority` to Project
- `electron/database/schema.ts` — Add `priority` to ProjectTable
- `electron/database/migrator.ts` — Register migration 034
- `electron/database/repositories/tasks.ts` — Add projectPriority to joins
- `electron/ipc/handlers.ts` — Add feed handlers
- `electron/preload.ts` — Add feed bridge
- `src/lib/api.ts` — Add feed API types + TaskWithProject.projectPriority
- `src/layout/ui-main-sidebar/index.tsx` — Conditional FeedList rendering
