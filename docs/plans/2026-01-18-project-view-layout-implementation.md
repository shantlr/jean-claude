# Project View Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the project view layout with secondary sidebar, task list, read tracking, and placeholder task panel.

**Architecture:** Nested routes under `/projects/$projectId` with a layout component rendering project sidebar + content outlet. Database extended with `readAt` column for unread tracking. Components follow existing patterns (hooks for data, Tailwind for styling).

**Tech Stack:** React, TanStack Router, TanStack Query, Kysely, Tailwind CSS, Lucide icons

---

## Task 1: Database Migration for readAt Column

**Files:**

- Create: `electron/database/migrations/003_task_read_at.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`
- Modify: `shared/types.ts`

**Step 1: Create the migration file**

Create `electron/database/migrations/003_task_read_at.ts`:

```typescript
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').addColumn('readAt', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('tasks').dropColumn('readAt').execute();
}
```

**Step 2: Register migration in migrator.ts**

Add import and registration to `electron/database/migrator.ts`:

```typescript
import * as m003 from './migrations/003_task_read_at';

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_project_color': m002,
  '003_task_read_at': m003,
};
```

**Step 3: Update TaskTable in schema.ts**

In `electron/database/schema.ts`, add to `TaskTable` interface:

```typescript
export interface TaskTable {
  // ... existing fields
  readAt: string | null;
}
```

**Step 4: Update Task types in shared/types.ts**

In `shared/types.ts`, add to `Task`, `NewTask`, and `UpdateTask` interfaces:

```typescript
// In Task interface:
readAt: string | null;

// In NewTask interface:
readAt?: string | null;

// In UpdateTask interface:
readAt?: string | null;
```

**Step 5: Verify by running the app**

Run: `pnpm dev`
Expected: App starts, migration runs automatically

**Step 6: Commit**

```bash
git add electron/database/migrations/003_task_read_at.ts electron/database/migrator.ts electron/database/schema.ts shared/types.ts
git commit -m "feat: add readAt column to tasks table for read tracking"
```

---

## Task 2: Add markAsRead API Method

**Files:**

- Modify: `electron/database/repositories/tasks.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/hooks/use-tasks.ts`

**Step 1: Add markAsRead to TaskRepository**

In `electron/database/repositories/tasks.ts`, add method:

```typescript
markAsRead: (id: string) =>
  db
    .updateTable('tasks')
    .set({ readAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow(),
```

**Step 2: Register IPC handler**

In `electron/ipc/handlers.ts`, add after other task handlers:

```typescript
ipcMain.handle('tasks:markAsRead', (_, id: string) =>
  TaskRepository.markAsRead(id),
);
```

**Step 3: Expose in preload.ts**

In `electron/preload.ts`, add to tasks object:

```typescript
markAsRead: (id: string) => ipcRenderer.invoke('tasks:markAsRead', id),
```

**Step 4: Update API type in src/lib/api.ts**

In `src/lib/api.ts`, add to tasks interface:

```typescript
tasks: {
  // ... existing methods
  markAsRead: (id: string) => Promise<Task>;
}
```

And in the fallback implementation:

```typescript
markAsRead: async () => { throw new Error('API not available'); },
```

**Step 5: Add useMarkTaskAsRead hook**

In `src/hooks/use-tasks.ts`, add:

```typescript
export function useMarkTaskAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.markAsRead(id),
    onSuccess: (task, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({
        queryKey: ['tasks', { projectId: task.projectId }],
      });
    },
  });
}
```

**Step 6: Commit**

```bash
git add electron/database/repositories/tasks.ts electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts src/hooks/use-tasks.ts
git commit -m "feat: add markAsRead API for task read tracking"
```

---

## Task 3: Create Status Indicator Component

**Files:**

- Create: `src/components/status-indicator.tsx`

**Step 1: Create the component**

Create `src/components/status-indicator.tsx`:

```tsx
import type { TaskStatus } from '../../shared/types';

interface StatusIndicatorProps {
  status: TaskStatus;
  className?: string;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  running: 'bg-green-500',
  waiting: 'bg-yellow-500',
  completed: 'bg-neutral-500',
  errored: 'bg-red-500',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  errored: 'Errored',
};

export function StatusIndicator({
  status,
  className = '',
}: StatusIndicatorProps) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status]} ${className}`}
      title={STATUS_LABELS[status]}
    />
  );
}
```

**Step 2: Commit**

```bash
git add src/components/status-indicator.tsx
git commit -m "feat: add StatusIndicator component"
```

---

## Task 4: Create Task List Item Component

**Files:**

- Create: `src/components/task-list-item.tsx`
- Create: `src/lib/time.ts`

**Step 1: Create time utility**

Create `src/lib/time.ts`:

```typescript
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}
```

**Step 2: Create the component**

Create `src/components/task-list-item.tsx`:

```tsx
import { Link } from '@tanstack/react-router';

import { formatRelativeTime } from '@/lib/time';

import type { Task } from '../../shared/types';
import { StatusIndicator } from './status-indicator';

interface TaskListItemProps {
  task: Task;
  projectId: string;
  isActive?: boolean;
}

function isTaskUnread(task: Task): boolean {
  if (task.status === 'running') return false;
  if (!task.readAt) return true;
  return new Date(task.updatedAt) > new Date(task.readAt);
}

export function TaskListItem({ task, projectId, isActive }: TaskListItemProps) {
  const unread = isTaskUnread(task);

  return (
    <Link
      to="/projects/$projectId/tasks/$taskId"
      params={{ projectId, taskId: task.id }}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isActive ? 'bg-neutral-700' : 'hover:bg-neutral-800'
      }`}
    >
      <StatusIndicator status={task.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{task.name}</span>
          {unread && (
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
          )}
        </div>
        <span className="text-xs text-neutral-500">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>
    </Link>
  );
}

export { isTaskUnread };
```

**Step 3: Commit**

```bash
git add src/lib/time.ts src/components/task-list-item.tsx
git commit -m "feat: add TaskListItem component with unread indicator"
```

---

## Task 5: Create Project Sidebar Component

**Files:**

- Create: `src/components/project-sidebar.tsx`

**Step 1: Create the component**

Create `src/components/project-sidebar.tsx`:

```tsx
import { Link, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { useProject } from '@/hooks/use-projects';
import { useProjectTasks } from '@/hooks/use-tasks';

import { TaskListItem } from './task-list-item';

export function ProjectSidebar() {
  const { projectId, taskId } = useParams({ strict: false });
  const { data: project } = useProject(projectId!);
  const { data: tasks } = useProjectTasks(projectId!);

  if (!project) return null;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-700 bg-neutral-900">
      {/* Project header */}
      <Link
        to="/projects/$projectId/details"
        params={{ projectId: project.id }}
        className="flex items-center gap-3 border-b border-neutral-700 px-4 py-3 transition-colors hover:bg-neutral-800"
      >
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <span className="truncate font-semibold">{project.name}</span>
      </Link>

      {/* New task button */}
      <div className="border-b border-neutral-700 p-3">
        <Link
          to="/projects/$projectId/tasks/new"
          params={{ projectId: project.id }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
        >
          <Plus className="h-4 w-4" />
          New Task
        </Link>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2">
        {tasks && tasks.length > 0 ? (
          <div className="flex flex-col gap-1">
            {tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                projectId={project.id}
                isActive={task.id === taskId}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            No tasks yet
          </div>
        )}
      </div>
    </aside>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/project-sidebar.tsx
git commit -m "feat: add ProjectSidebar component with task list"
```

---

## Task 6: Update Project Layout Route

**Files:**

- Modify: `src/routes/projects/$projectId.tsx`

**Step 1: Update the layout**

Replace contents of `src/routes/projects/$projectId.tsx`:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';

import { ProjectSidebar } from '@/components/project-sidebar';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
});

function ProjectLayout() {
  return (
    <div className="flex h-full">
      <ProjectSidebar />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId.tsx
git commit -m "feat: update project layout with ProjectSidebar"
```

---

## Task 7: Create Project Index Route

**Files:**

- Create: `src/routes/projects/$projectId/index.tsx`

**Step 1: Create the route**

Create `src/routes/projects/$projectId/index.tsx`:

```tsx
import { createFileRoute, Navigate } from '@tanstack/react-router';

import { useProjectTasks } from '@/hooks/use-tasks';

export const Route = createFileRoute('/projects/$projectId/')({
  component: ProjectIndex,
});

function ProjectIndex() {
  const { projectId } = Route.useParams();
  const { data: tasks, isLoading } = useProjectTasks(projectId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  // Redirect to first task if any exist
  if (tasks && tasks.length > 0) {
    return (
      <Navigate
        to="/projects/$projectId/tasks/$taskId"
        params={{ projectId, taskId: tasks[0].id }}
        replace
      />
    );
  }

  // Empty state
  return (
    <div className="flex h-full flex-col items-center justify-center text-neutral-500">
      <p className="mb-2 text-lg">No tasks yet</p>
      <p className="text-sm">Create a new task to get started</p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/index.tsx
git commit -m "feat: add project index route with redirect logic"
```

---

## Task 8: Create Project Details Route

**Files:**

- Create: `src/routes/projects/$projectId/details.tsx`

**Step 1: Create the route**

Create `src/routes/projects/$projectId/details.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  useProject,
  useUpdateProject,
  useDeleteProject,
} from '@/hooks/use-projects';
import { PROJECT_COLORS } from '@/lib/colors';

export const Route = createFileRoute('/projects/$projectId/details')({
  component: ProjectDetails,
});

function ProjectDetails() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: project } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync local state when project loads
  if (project && !name && !color) {
    setName(project.name);
    setColor(project.color);
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  async function handleSave() {
    await updateProject.mutateAsync({
      id: projectId,
      data: { name, color },
    });
  }

  async function handleDelete() {
    await deleteProject.mutateAsync(projectId);
    navigate({ to: '/' });
  }

  const hasChanges = name !== project.name || color !== project.color;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() =>
            navigate({ to: '/projects/$projectId', params: { projectId } })
          }
          className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tasks
        </button>

        <h1 className="mb-6 text-2xl font-bold">Project Settings</h1>

        <div className="space-y-6">
          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Path */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Path
            </label>
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
              <span className="text-sm text-neutral-400">{project.path}</span>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Type
            </label>
            <span className="inline-block rounded-md bg-neutral-700 px-2 py-1 text-sm">
              {project.type === 'local' ? 'Local folder' : 'Git provider'}
            </span>
          </div>

          {/* Color */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 cursor-pointer rounded-lg transition-all ${
                    color === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Save button */}
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={updateProject.isPending}
              className="w-full cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updateProject.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          )}

          {/* Danger zone */}
          <div className="border-t border-neutral-700 pt-6">
            <h2 className="mb-4 text-lg font-semibold text-red-400">
              Danger Zone
            </h2>
            {showDeleteConfirm ? (
              <div className="rounded-lg border border-red-900 bg-red-950/50 p-4">
                <p className="mb-4 text-sm text-neutral-300">
                  Are you sure you want to delete this project? This action
                  cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteProject.isPending}
                    className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteProject.isPending ? 'Deleting...' : 'Delete Project'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-2 text-red-400 transition-colors hover:bg-red-950"
              >
                <Trash2 className="h-4 w-4" />
                Delete Project
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/details.tsx
git commit -m "feat: add project details page with settings"
```

---

## Task 9: Create New Task Route

**Files:**

- Create: `src/routes/projects/$projectId/tasks/new.tsx`

**Step 1: Create the route**

Create `src/routes/projects/$projectId/tasks/new.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { useCreateTask } from '@/hooks/use-tasks';

export const Route = createFileRoute('/projects/$projectId/tasks/new')({
  component: NewTask,
});

function NewTask() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const createTask = useCreateTask();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [useWorktree, setUseWorktree] = useState(true);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Auto-generate name from first line of prompt if empty
    const taskName =
      name.trim() || prompt.split('\n')[0].slice(0, 50) || 'Untitled task';

    const task = await createTask.mutateAsync({
      projectId,
      name: taskName,
      prompt,
      status: 'waiting', // Agent integration deferred to Phase 2.3
      updatedAt: new Date().toISOString(),
    });

    navigate({
      to: '/projects/$projectId/tasks/$taskId',
      params: { projectId, taskId: task.id },
    });
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-xl">
        <button
          type="button"
          onClick={() =>
            navigate({ to: '/projects/$projectId', params: { projectId } })
          }
          className="mb-6 flex cursor-pointer items-center gap-2 text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <h1 className="mb-6 text-2xl font-bold">New Task</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task name */}
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Name <span className="text-neutral-500">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-generated from prompt if empty"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Prompt */}
          <div>
            <label
              htmlFor="prompt"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the agent to do..."
              rows={8}
              required
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Use worktree checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="useWorktree"
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => setUseWorktree(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900"
            />
            <label
              htmlFor="useWorktree"
              className="cursor-pointer text-sm text-neutral-300"
            >
              Create git worktree for isolation
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={createTask.isPending || !prompt.trim()}
            className="w-full cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createTask.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/tasks/new.tsx
git commit -m "feat: add new task creation page"
```

---

## Task 10: Create Task Panel Route (Placeholder)

**Files:**

- Create: `src/routes/projects/$projectId/tasks/$taskId.tsx`

**Step 1: Create the route**

Create `src/routes/projects/$projectId/tasks/$taskId.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useTask, useMarkTaskAsRead } from '@/hooks/use-tasks';
import { formatRelativeTime } from '@/lib/time';

import { StatusIndicator } from '@/components/status-indicator';

export const Route = createFileRoute('/projects/$projectId/tasks/$taskId')({
  component: TaskPanel,
});

function TaskPanel() {
  const { taskId } = Route.useParams();
  const { data: task } = useTask(taskId);
  const markAsRead = useMarkTaskAsRead();

  // Mark task as read when viewing
  useEffect(() => {
    if (task && task.status !== 'running') {
      markAsRead.mutate(taskId);
    }
  }, [taskId, task?.status]);

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-700 px-6 py-4">
        <StatusIndicator status={task.status} className="h-3 w-3" />
        <h1 className="flex-1 truncate text-lg font-semibold">{task.name}</h1>
        <span className="text-sm text-neutral-500">
          {formatRelativeTime(task.createdAt)}
        </span>
      </div>

      {/* Body (placeholder) */}
      <div className="flex-1 overflow-auto p-6">
        {/* Task prompt */}
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-neutral-400">Prompt</h2>
          <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm">
              {task.prompt}
            </pre>
          </div>
        </div>

        {/* Placeholder message */}
        <div className="rounded-lg border border-dashed border-neutral-700 p-8 text-center">
          <p className="mb-2 text-neutral-400">
            Agent session will appear here
          </p>
          <p className="text-sm text-neutral-600">
            Agent integration coming in Phase 2.3
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/routes/projects/\$projectId/tasks/\$taskId.tsx
git commit -m "feat: add task panel placeholder route"
```

---

## Task 11: Update ProjectTile with Unread Badge

**Files:**

- Modify: `src/components/project-tile.tsx`

**Step 1: Add unread badge logic**

Replace contents of `src/components/project-tile.tsx`:

```tsx
import { Link } from '@tanstack/react-router';

import { useProjectTasks } from '@/hooks/use-tasks';
import { getInitials } from '@/lib/colors';

import { isTaskUnread } from './task-list-item';

interface ProjectTileProps {
  id: string;
  name: string;
  color: string;
}

export function ProjectTile({ id, name, color }: ProjectTileProps) {
  const initials = getInitials(name);
  const { data: tasks } = useProjectTasks(id);

  const unreadCount = tasks?.filter(isTaskUnread).length ?? 0;

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: id }}
      className="group relative flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 data-[status=active]:ring-2 data-[status=active]:ring-white"
      style={{ backgroundColor: color }}
    >
      {initials}
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/project-tile.tsx
git commit -m "feat: add unread badge to project tiles"
```

---

## Task 12: Regenerate Routes and Verify

**Step 1: Run dev to regenerate route tree**

Run: `pnpm dev`
Expected: App compiles, route tree auto-generates

**Step 2: Manually test the following flows:**

1. Click a project tile -> Should show project sidebar with task list
2. Click "New Task" -> Should navigate to task creation form
3. Fill form and submit -> Should create task and navigate to task panel
4. Click project name in sidebar -> Should navigate to project details
5. Change color and save -> Should update project
6. Check project tile -> Should show unread badge for new task
7. View task -> Badge should disappear (marked as read)

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint issues"
```

---

## Summary

This plan implements Phase 2.1 (Project View Layout) with:

- Database migration for read tracking (`readAt` column)
- API method `markAsRead` for updating read status
- `StatusIndicator` component for task status visualization
- `TaskListItem` component with unread badges
- `ProjectSidebar` component with task list
- Routes: project index, details, new task, task panel
- Unread badge on project tiles in main sidebar
