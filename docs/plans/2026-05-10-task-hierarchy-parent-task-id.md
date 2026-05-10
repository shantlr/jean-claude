# Task Hierarchy (parent_task_id) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hierarchical task relationships via `parent_task_id` so sub-tasks render nested below their parent in the feed sidebar with branch-graph visual connectors.

**Architecture:** Add a nullable `parentTaskId` column to the tasks table. The feed service groups child tasks under parents, and the FeedItem type gains a `children` array. The feed UI renders sub-tasks indented with a vertical tree line and horizontal connectors (matching the V3a "Solid Rail" design from the design bundle).

**Tech Stack:** SQLite migration (Kysely), TypeScript types, React feed components with Tailwind CSS.

---

### Task 1: Database Migration — Add `parent_task_id` Column

**Files:**
- Create: `electron/database/migrations/052_task_parent_task_id.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Create the migration file**

```typescript
// electron/database/migrations/052_task_parent_task_id.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('parentTaskId', 'text', (col) => col.defaultTo(null))
    .execute();

  // Add index for efficient subtask lookups
  await db.schema
    .createIndex('idx_tasks_parent_task_id')
    .on('tasks')
    .column('parentTaskId')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_tasks_parent_task_id').execute();
  await db.schema.alterTable('tasks').dropColumn('parentTaskId').execute();
}
```

**Step 2: Register migration in migrator.ts**

Add import and register entry:
```typescript
import * as m052 from './migrations/052_task_parent_task_id';
// In the migrations record:
'052_task_parent_task_id': m052,
```

**Step 3: Update schema.ts — add column to TaskTable interface**

```typescript
// In TaskTable interface, after pullRequestUrl:
parentTaskId: string | null;
```

**Step 4: Commit**

```bash
git add electron/database/migrations/052_task_parent_task_id.ts electron/database/migrator.ts electron/database/schema.ts
git commit -m "feat(db): add parent_task_id column to tasks table"
```

---

### Task 2: Update Shared Types

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/feed-types.ts`

**Step 1: Add parentTaskId to Task, NewTask, UpdateTask interfaces**

In `shared/types.ts`:

```typescript
// In interface Task, after pendingMessage:
parentTaskId: string | null;

// In interface NewTask, after pendingMessage:
parentTaskId?: string | null;

// In interface UpdateTask, after pendingMessage:
parentTaskId?: string | null;
```

**Step 2: Add children array to FeedItem**

In `shared/feed-types.ts`:

```typescript
// In interface FeedItem, after isCompleted:
parentTaskId?: string;
children?: FeedItem[];
```

**Step 3: Commit**

```bash
git add shared/types.ts shared/feed-types.ts
git commit -m "feat(types): add parentTaskId to Task and FeedItem types"
```

---

### Task 3: Update Task Repository

**Files:**
- Modify: `electron/database/repositories/tasks.ts`

**Step 1: Add parentTaskId to CreateTaskInput and UpdateTaskInput interfaces**

```typescript
// In CreateTaskInput, after pendingMessage:
parentTaskId?: string | null;

// In UpdateTaskInput, after pendingMessage:
parentTaskId?: string | null;
```

**Step 2: Add findByParentTaskId query method**

```typescript
findByParentTaskId: async (parentTaskId: string) => {
  const rows = await db
    .selectFrom('tasks')
    .selectAll()
    .where('parentTaskId', '=', parentTaskId)
    .orderBy('sortOrder', 'asc')
    .execute();
  return rows.map(toTask);
},

findChildTaskIds: async (parentTaskId: string): Promise<string[]> => {
  const rows = await db
    .selectFrom('tasks')
    .select('id')
    .where('parentTaskId', '=', parentTaskId)
    .execute();
  return rows.map((r) => r.id);
},
```

**Step 3: Update findAllActive to exclude child tasks at top level**

In the `findAllActive` method, add a WHERE clause:
```typescript
.where('tasks.parentTaskId', 'is', null)
```

This ensures child tasks don't appear as independent feed items — they'll be fetched separately and nested under their parent.

**Step 4: Add findChildrenForTasks batch method (for feed efficiency)**

```typescript
findChildrenForTasks: async (parentTaskIds: string[]) => {
  if (parentTaskIds.length === 0) return {};
  const rows = await db
    .selectFrom('tasks')
    .innerJoin('projects', 'projects.id', 'tasks.projectId')
    .selectAll('tasks')
    .select([
      'projects.name as projectName',
      'projects.color as projectColor',
    ])
    .where('tasks.parentTaskId', 'in', parentTaskIds)
    .orderBy('tasks.sortOrder', 'asc')
    .execute();

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    const pid = row.parentTaskId!;
    if (!grouped[pid]) grouped[pid] = [];
    grouped[pid].push(row);
  }
  return grouped;
},
```

**Step 5: Commit**

```bash
git add electron/database/repositories/tasks.ts
git commit -m "feat(repo): add parent task query methods, exclude children from top-level feed"
```

---

### Task 4: Update Feed Service — Nest Child Tasks Under Parents

**Files:**
- Modify: `electron/services/feed-service.ts`

**Step 1: Fetch child tasks and nest them into parent feed items**

After building the initial `feedItems` array from active tasks, add:

```typescript
// Fetch child tasks for all active parent tasks
const parentTaskIds = activeTasks.map((t) => t.id);
const childrenByParent = await TaskRepository.findChildrenForTasks(parentTaskIds);
const childStepsByTaskId = await TaskStepRepository.findByTaskIds(
  Object.values(childrenByParent).flat().map((c) => c.id),
);

// Attach children to their parent feed items
for (const item of feedItems) {
  if (item.source !== 'task' || !item.taskId) continue;
  const children = childrenByParent[item.taskId];
  if (!children?.length) continue;

  item.children = children.map((child) => {
    const childTask = toTask(child) as typeof child & {
      projectName: string;
      projectColor: string;
    };
    const steps = childStepsByTaskId[child.id] ?? [];
    const attention = deriveTaskAttention({ taskStatus: childTask.status, steps });
    const subtitle = getSubtitleFromSteps({
      stepStatuses: steps.map((s) => s.status),
      stepNames: steps.map((s) => s.name),
    });

    return {
      id: `task:${childTask.id}`,
      source: 'task' as const,
      attention,
      timestamp: childTask.updatedAt,
      projectId: childTask.projectId,
      projectName: childTask.projectName,
      projectColor: childTask.projectColor,
      projectPriority: 'normal' as const,
      title: childTask.name ?? childTask.prompt.slice(0, 80),
      subtitle,
      hasUnread: childTask.hasUnread,
      taskId: childTask.id,
      taskType: childTask.type,
      parentTaskId: childTask.parentTaskId ?? undefined,
      pendingMessage: childTask.pendingMessage ?? undefined,
      pullRequestId: childTask.pullRequestId ? parseInt(childTask.pullRequestId, 10) : undefined,
      pullRequestUrl: childTask.pullRequestUrl ?? undefined,
      workItemIds: childTask.workItemIds ?? undefined,
    };
  });
}
```

Note: The `toTask` import may already be available from TaskRepository internals, or you'll need to import the raw row type. Adapt based on what `findChildrenForTasks` returns (it returns rows already mapped through `toTask` join).

**Step 2: Commit**

```bash
git add electron/services/feed-service.ts
git commit -m "feat(feed): nest child tasks under parent in feed items"
```

---

### Task 5: Update IPC / API Layer for parentTaskId

**Files:**
- Modify: `electron/ipc/handlers.ts` (pass parentTaskId through on task creation)
- Modify: `src/lib/api.ts` (type already flows through NewTask)

**Step 1: Ensure createWithWorktree handler passes parentTaskId**

In the task creation handler, `parentTaskId` should already flow through since `NewTask` includes it. Verify the handler spreads all fields correctly — no changes needed if it does `{ ...data }` spread.

If the handler destructures specific fields, add `parentTaskId` to the list.

**Step 2: Commit (if changes needed)**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat(ipc): pass parentTaskId through task creation handler"
```

---

### Task 6: Feed UI — Render Sub-Tasks with Tree Connectors

**Files:**
- Modify: `src/features/feed/ui-feed-list/feed-item-card.tsx`
- Modify: `src/features/feed/ui-feed-list/index.tsx`

**Step 1: Update FeedItemCard to accept isSubtask prop and render children**

In `feed-item-card.tsx`, add after the main card div:

```tsx
// Props addition:
isSubtask?: boolean;

// Inside the component, conditionally render children:
{!isSubtask && item.children && item.children.length > 0 && (
  <div className="relative ml-4 pl-3 border-l border-ink-4/30">
    {item.children.map((child) => (
      <div key={child.id} className="relative py-0.5">
        {/* Horizontal connector */}
        <div className="absolute -left-3 top-4 h-px w-3 bg-ink-4/30" />
        <FeedItemCard item={child} isSubtask />
      </div>
    ))}
  </div>
)}
```

**Step 2: Adjust styling for sub-task cards**

Sub-tasks should be:
- Slightly smaller font (text-xs instead of text-sm for title)
- Dimmer text (opacity or lighter color)
- No project chip (inherits from parent)
- Smaller status indicator

```tsx
// Conditional classes based on isSubtask:
<div className={clsx(
  'group relative rounded-md px-2.5 py-1.5',
  isSubtask && 'py-1 px-2',
  // ... existing classes
)}>
  {/* Title with conditional size */}
  <span className={clsx(
    'truncate',
    isSubtask ? 'text-xs text-ink-2' : 'text-sm text-ink-1',
  )}>
    {item.title}
  </span>
</div>
```

**Step 3: Update index.tsx FeedCard to pass children through**

The `FeedCard` component already passes all props. Children come from the `FeedItem.children` array which flows naturally.

**Step 4: Commit**

```bash
git add src/features/feed/ui-feed-list/feed-item-card.tsx src/features/feed/ui-feed-list/index.tsx
git commit -m "feat(feed-ui): render hierarchical sub-tasks with tree connectors"
```

---

### Task 7: New Task Overlay — Support Creating Sub-Tasks

**Files:**
- Modify: `src/features/new-task/` (the new-task overlay component)

**Step 1: Accept optional parentTaskId in new task overlay**

When creating a sub-task from an existing task, pass `parentTaskId` into the creation payload. This could be triggered by a context menu action on a feed item: "Create sub-task".

In the new-task store or overlay, add:
```typescript
parentTaskId?: string | null;
```

**Step 2: Add "Create Sub-task" action to feed item context menu**

In the feed item card's dropdown menu:
```tsx
<DropdownItem
  onClick={() => {
    // Open new-task overlay with parentTaskId pre-set
    openNewTask({ parentTaskId: item.taskId, projectId: item.projectId });
  }}
>
  <ListTodo className="h-3.5 w-3.5" />
  Create sub-task
</DropdownItem>
```

**Step 3: Pass parentTaskId through the create mutation**

In the create task mutation call, include `parentTaskId` from the overlay state.

**Step 4: Commit**

```bash
git add src/features/new-task/ src/features/feed/ui-feed-list/feed-item-card.tsx
git commit -m "feat(new-task): support creating sub-tasks from feed context menu"
```

---

### Task 8: Lint, Type-Check, Verify

**Step 1: Install deps and lint**

```bash
pnpm install
pnpm lint --fix
pnpm ts-check
pnpm lint
```

**Step 2: Fix any issues found**

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: fix lint and type errors from task hierarchy feature"
```

---

## Summary of Data Flow

```
DB: tasks.parentTaskId → Repository: findChildrenForTasks()
  → Feed Service: nest children[] into FeedItem
  → IPC → Renderer: FeedItem.children[]
  → Feed UI: renders sub-tasks indented with tree lines
```

## Key Design Decisions

1. **Children excluded from top-level feed** — Only root tasks (parentTaskId=null) appear at feed top level. Children render nested.
2. **Single-level nesting only** — Design shows one level of sub-tasks. No recursive nesting for now (YAGNI).
3. **V3a "Solid Rail" visual** — Vertical tree line colored by parent status, horizontal connectors to each child node.
4. **Sub-task inherits project** — Sub-tasks always belong to same project as parent (enforced at creation, not DB constraint).
