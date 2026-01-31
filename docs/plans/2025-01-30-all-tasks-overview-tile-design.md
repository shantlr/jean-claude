# All Tasks Overview Tile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "All Tasks" tile to the main sidebar that shows all non-completed tasks across projects, sorted by last modified.

**Architecture:** New route `/all-tasks` with a sidebar component, extending the navigation store to track All Tasks context independently. Reuses existing TaskListItem with optional project info display.

**Tech Stack:** React, TanStack Router, Zustand, Kysely, Electron IPC

---

## Task 1: Add findAllActive to Task Repository

**Files:**
- Modify: `electron/database/repositories/tasks.ts`

**Step 1: Add findAllActive method**

Add this method to `TaskRepository` after `findByProjectId`:

```typescript
findAllActive: async () => {
  const rows = await db
    .selectFrom('tasks')
    .innerJoin('projects', 'projects.id', 'tasks.projectId')
    .selectAll('tasks')
    .select(['projects.name as projectName', 'projects.color as projectColor'])
    .select((eb) =>
      eb
        .selectFrom('agent_messages')
        .whereRef('agent_messages.taskId', '=', 'tasks.id')
        .select((eb2) => eb2.fn.countAll<number>().as('count'))
        .as('messageCount'),
    )
    .where('tasks.userCompleted', '=', 0)
    .orderBy('tasks.updatedAt', 'desc')
    .execute();
  return rows.map(toTask);
},
```

---

## Task 2: Add IPC Handler and Preload Bridge

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`

**Step 1: Add IPC handler**

In `electron/ipc/handlers.ts`, after the `tasks:findByProjectId` handler (~line 111), add:

```typescript
ipcMain.handle('tasks:findAllActive', () => TaskRepository.findAllActive());
```

**Step 2: Add preload bridge**

In `electron/preload.ts`, in the `tasks` object after `findByProjectId`, add:

```typescript
findAllActive: () => ipcRenderer.invoke('tasks:findAllActive'),
```

---

## Task 3: Add API Type Definition

**Files:**
- Modify: `src/lib/api.ts`

**Step 1: Add TaskWithProject type**

Near the top of the file (after line 36), add:

```typescript
export interface TaskWithProject {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  name: string | null;
  prompt: string;
  status: string;
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  branchName: string | null;
  readAt: string | null;
  lastReadIndex: number;
  interactionMode: string;
  userCompleted: boolean;
  sessionAllowedTools: string[];
  workItemId: string | null;
  workItemUrl: string | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}
```

**Step 2: Add findAllActive to Api interface**

In the `tasks` section of the `Api` interface (after line 155), add:

```typescript
findAllActive: () => Promise<TaskWithProject[]>;
```

**Step 3: Add fallback implementation**

In the fallback api object's `tasks` section (after line 360), add:

```typescript
findAllActive: async () => [],
```

---

## Task 4: Add useAllActiveTasks Hook

**Files:**
- Modify: `src/hooks/use-tasks.ts`

**Step 1: Add the hook**

After `useProjectTasks` function, add:

```typescript
export function useAllActiveTasks() {
  return useQuery({
    queryKey: ['tasks', 'allActive'],
    queryFn: () => api.tasks.findAllActive(),
  });
}
```

---

## Task 5: Extend Navigation Store

**Files:**
- Modify: `src/stores/navigation.ts`

**Step 1: Add new state fields**

In `NavigationState` interface (after line 49), add:

```typescript
// All Tasks view: last viewed task and whether we were in All Tasks view
allTasksLastTaskId: string | null;
wasAllTasks: boolean;
```

**Step 2: Add new actions to interface**

In the actions section of `NavigationState` (after line 61), add:

```typescript
setAllTasksLastTaskId: (taskId: string | null) => void;
setWasAllTasks: (wasAllTasks: boolean) => void;
clearAllTasksLastTaskId: () => void;
```

**Step 3: Add initial state values**

In the store initial state (after line 70), add:

```typescript
allTasksLastTaskId: null,
wasAllTasks: false,
```

**Step 4: Add action implementations**

After `setLastLocation` implementation (after line 74), add:

```typescript
setAllTasksLastTaskId: (taskId) => set({ allTasksLastTaskId: taskId }),

setWasAllTasks: (wasAllTasks) => set({ wasAllTasks }),

clearAllTasksLastTaskId: () => set({ allTasksLastTaskId: null }),
```

**Step 5: Update clearTaskNavHistoryState**

In `clearTaskNavHistoryState` (around line 147), also clear from allTasksLastTaskId. Update the function body to include:

```typescript
// Also clear from allTasksLastTaskId if this was the All Tasks last viewed task
const newAllTasksLastTaskId =
  state.allTasksLastTaskId === taskId ? null : state.allTasksLastTaskId;
```

And add `allTasksLastTaskId: newAllTasksLastTaskId` to the return object.

---

## Task 6: Update TaskListItem for Project Info

**Files:**
- Modify: `src/features/task/ui-task-list-item/index.tsx`

**Step 1: Add optional project props**

Update the component props to accept optional project info:

```typescript
export function TaskListItem({ task, projectId, isActive, projectName, projectColor }: {
  task: TaskWithMessageCount;
  projectId: string;
  isActive?: boolean;
  projectName?: string;
  projectColor?: string;
}) {
```

**Step 2: Add project info display**

After the task name span (around line 65), add conditionally:

```typescript
{projectName && projectColor && (
  <div className="flex items-center gap-1.5 text-xs text-neutral-400">
    <span
      className="h-2 w-2 rounded-full"
      style={{ backgroundColor: projectColor }}
    />
    <span className="truncate">{projectName}</span>
  </div>
)}
```

---

## Task 7: Create All Tasks Sidebar Component

**Files:**
- Create: `src/layout/ui-all-tasks-sidebar/index.tsx`

**Step 1: Create the component**

```typescript
import { LayoutList } from 'lucide-react';

import { TaskListItem } from '@/features/task/ui-task-list-item';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import { useNavigationStore } from '@/stores/navigation';

export const ALL_TASKS_HEADER_HEIGHT = 64;

export function AllTasksSidebar() {
  const { data: tasks } = useAllActiveTasks();
  const allTasksLastTaskId = useNavigationStore((s) => s.allTasksLastTaskId);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-700 bg-neutral-900">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-neutral-700 px-4"
        style={{ height: ALL_TASKS_HEADER_HEIGHT }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-700">
          <LayoutList className="h-4 w-4 text-neutral-300" />
        </div>
        <span className="font-semibold">All Tasks</span>
      </div>

      {/* Task list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tasks && tasks.length > 0 ? (
          <div className="flex flex-col gap-1">
            {tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                projectId={task.projectId}
                isActive={task.id === allTasksLastTaskId}
                projectName={task.projectName}
                projectColor={task.projectColor}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            No active tasks
          </div>
        )}
      </div>
    </aside>
  );
}
```

---

## Task 8: Create All Tasks Route

**Files:**
- Create: `src/routes/all-tasks.tsx`

**Step 1: Create the route**

```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';

import { AllTasksSidebar } from '@/layout/ui-all-tasks-sidebar';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigation';

export const Route = createFileRoute('/all-tasks')({
  beforeLoad: async () => {
    const { allTasksLastTaskId, setAllTasksLastTaskId, setWasAllTasks } =
      useNavigationStore.getState();

    // Mark that we're in All Tasks view
    setWasAllTasks(true);

    // If we have a last task, validate and redirect to it
    if (allTasksLastTaskId) {
      const task = await api.tasks.findById(allTasksLastTaskId);
      if (task && !task.userCompleted) {
        throw redirect({
          to: '/projects/$projectId/tasks/$taskId',
          params: {
            projectId: task.projectId,
            taskId: task.id,
          },
        });
      }
      // Task invalid or completed, clear it
      setAllTasksLastTaskId(null);
    }

    // No valid last task, try to get the first active task
    const tasks = await api.tasks.findAllActive();
    if (tasks.length > 0) {
      const firstTask = tasks[0];
      setAllTasksLastTaskId(firstTask.id);
      throw redirect({
        to: '/projects/$projectId/tasks/$taskId',
        params: {
          projectId: firstTask.projectId,
          taskId: firstTask.id,
        },
      });
    }

    // No active tasks, stay on /all-tasks and show empty state
  },
  component: AllTasksLayout,
});

function AllTasksLayout() {
  return (
    <div className="flex h-full border-l border-t rounded-tl-lg border-neutral-800 overflow-hidden">
      <AllTasksSidebar />
      <div className="flex-1 flex items-center justify-center text-neutral-500">
        No active tasks across projects
      </div>
    </div>
  );
}
```

---

## Task 9: Add All Tasks Tile to Main Sidebar

**Files:**
- Modify: `src/layout/ui-main-sidebar/index.tsx`

**Step 1: Add imports**

Add to imports:

```typescript
import { useRouterState } from '@tanstack/react-router';
import { LayoutList } from 'lucide-react';
import clsx from 'clsx';

import { useAllActiveTasks } from '@/hooks/use-tasks';
import { getUnreadCount } from '@/features/task/ui-task-list-item';
```

**Step 2: Create AllTasksTile component**

Add before `MainSidebar` function:

```typescript
function AllTasksTile() {
  const { data: tasks } = useAllActiveTasks();
  const router = useRouter();

  const isActive = useRouterState({
    select: (state) =>
      state.location.pathname === '/all-tasks' ||
      useNavigationStore.getState().wasAllTasks,
  });

  const unreadCount =
    tasks?.reduce((sum, task) => sum + getUnreadCount(task), 0) ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        router.navigate({ to: '/all-tasks' });
      }}
      className={clsx(
        'cursor-pointer group relative flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-700 text-neutral-300 transition-all hover:bg-neutral-600 hover:text-white',
        {
          'ring-white ring-2': isActive,
        },
      )}
    >
      <LayoutList className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}
```

**Step 3: Add tile to sidebar**

In `MainSidebar`, inside the project tiles div (after line 68), add the tile before the DndContext:

```typescript
<AllTasksTile />
<div className="h-px w-8 bg-neutral-700 my-1" />
```

---

## Task 10: Update Index Route for wasAllTasks

**Files:**
- Modify: `src/routes/index.tsx`

**Step 1: Add wasAllTasks check**

Update the `beforeLoad` function to check `wasAllTasks` first:

```typescript
beforeLoad: async () => {
  const { lastLocation, setLastLocation, wasAllTasks } = useNavigationStore.getState();

  // If last session was in All Tasks view, redirect there
  if (wasAllTasks) {
    throw redirect({ to: '/all-tasks' });
  }

  if (lastLocation.projectId) {
    // ... existing project/task logic
  }

  throw redirect({ to: '/settings' });
},
```

---

## Task 11: Update Navigation on Task View

**Files:**
- Modify: `src/routes/projects/$projectId/tasks/$taskId.tsx`

**Step 1: Check if coming from All Tasks**

In the task route component, update navigation state based on context. Read the file first to understand its structure, then add:

After navigating to a task, if `wasAllTasks` is true, update `allTasksLastTaskId`:

```typescript
import { useNavigationStore } from '@/stores/navigation';

// In the component or beforeLoad:
const { wasAllTasks, setAllTasksLastTaskId, setWasAllTasks } = useNavigationStore.getState();

if (wasAllTasks) {
  setAllTasksLastTaskId(taskId);
}
// When entering project context, clear wasAllTasks
setWasAllTasks(false);
```

---

## Task 12: Run Lint and Verify

**Step 1: Run lint**

```bash
pnpm lint --fix
```

**Step 2: Build check**

```bash
pnpm build
```
