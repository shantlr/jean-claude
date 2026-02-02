# Management & Multitasking UX - Remaining Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining features from the Management & Multitasking UX redesign: Session List, Work Item integration, and Annotated Diff.

**Architecture:** Build on existing keyboard bindings and command palette infrastructure. Session list replaces the current project-centric sidebar with a flat task list filtered by project tabs. Work item integration connects the New Task overlay to Azure DevOps. Annotated diff adds summary panel and gutter annotations to the existing diff view.

**Tech Stack:** React, TypeScript, Zustand (state), TanStack Query (data), TanStack Router (navigation), Kysely (database)

**Design Document:** `docs/plans/2025-02-01-management-multitasking-ux-design.md`

---

## Phase 2: Session List Redesign

### Task 2.1: Add Session Navigation Shortcuts

**Files:**
- Modify: `src/routes/__root.tsx`
- Modify: `src/lib/keyboard-bindings/utils.ts`

**Step 1: Add global shortcuts to utils.ts**

Add `cmd+up`, `cmd+down`, and `cmd+1` through `cmd+9` to GLOBAL_SHORTCUTS:

```typescript
const GLOBAL_SHORTCUTS: Set<BindingKey> = new Set([
  'cmd+p',
  'cmd+n',
  'cmd+,',
  'cmd+/',
  'cmd+1',
  'cmd+2',
  'cmd+3',
  'cmd+4',
  'cmd+5',
  'cmd+6',
  'cmd+7',
  'cmd+8',
  'cmd+9',
  'cmd+up',
  'cmd+down',
  'escape',
]);
```

**Step 2: Create SessionNavigationBindings component in __root.tsx**

Add a component that registers session navigation shortcuts:

```tsx
function SessionNavigationBindings() {
  const navigate = useNavigate();
  const { data: tasks = [] } = useAllActiveTasks();
  const projectFilter = useNavigationStore((s) => s.projectFilter);

  // Filter tasks by current project filter
  const filteredTasks = useMemo(() => {
    if (projectFilter === 'all') return tasks;
    return tasks.filter((t) => t.projectId === projectFilter);
  }, [tasks, projectFilter]);

  useKeyboardBindings('session-navigation', {
    'cmd+1': () => navigateToTask(0),
    'cmd+2': () => navigateToTask(1),
    // ... cmd+3 through cmd+9
    'cmd+up': () => navigatePrevTask(),
    'cmd+down': () => navigateNextTask(),
  });

  return null;
}
```

**Step 3: Commit**

```bash
git add src/routes/__root.tsx src/lib/keyboard-bindings/utils.ts
git commit -m "feat: add session navigation keyboard shortcuts (cmd+1-9, cmd+up/down)"
```

---

### Task 2.2: Create Session Card Component

**Files:**
- Create: `src/features/task/ui-session-card/index.tsx`

**Step 1: Create the component**

A minimal card showing: status icon, truncated name, project color dot, relative time, number badge.

```tsx
// src/features/task/ui-session-card/index.tsx
import clsx from 'clsx';
import { StatusIndicator } from '@/common/ui/status-indicator';
import { formatRelativeTime } from '@/lib/time';
import type { Task, Project } from '../../../../shared/types';

export function SessionCard({
  task,
  project,
  index,
  isSelected,
  onClick,
}: {
  task: Task;
  project: Project | undefined;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const displayNumber = index < 9 ? index + 1 : null;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full rounded-lg border p-2 text-left transition-colors',
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-transparent hover:bg-neutral-800',
      )}
    >
      <div className="flex items-center gap-2">
        <StatusIndicator status={task.status} size="sm" />
        <span className="flex-1 truncate text-sm font-medium">
          {task.name || 'Untitled'}
        </span>
        {displayNumber && (
          <span className="text-muted-foreground text-xs">{displayNumber}</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
        {project && (
          <>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate">{project.name}</span>
          </>
        )}
        <span className="ml-auto">{formatRelativeTime(task.updatedAt)}</span>
      </div>
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/task/ui-session-card/index.tsx
git commit -m "feat: add SessionCard component"
```

---

### Task 2.3: Create Project Filter Tabs Component

**Files:**
- Create: `src/features/project/ui-project-filter-tabs/index.tsx`

**Step 1: Create the component**

Horizontal tabs showing "All" + each project. Uses navigation store for filter state.

```tsx
// src/features/project/ui-project-filter-tabs/index.tsx
import clsx from 'clsx';
import { useProjects } from '@/hooks/use-projects';
import { useNavigationStore } from '@/stores/navigation';

export function ProjectFilterTabs() {
  const { data: projects = [] } = useProjects();
  const projectFilter = useNavigationStore((s) => s.projectFilter);
  const setProjectFilter = useNavigationStore((s) => s.setProjectFilter);

  const sortedProjects = [...projects].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2 py-1">
      <button
        onClick={() => setProjectFilter('all')}
        className={clsx(
          'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors',
          projectFilter === 'all'
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
        )}
      >
        All
      </button>
      {sortedProjects.map((project) => (
        <button
          key={project.id}
          onClick={() => setProjectFilter(project.id)}
          className={clsx(
            'flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
            projectFilter === project.id
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
          )}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span className="max-w-16 truncate">{project.name}</span>
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/project/ui-project-filter-tabs/index.tsx
git commit -m "feat: add ProjectFilterTabs component"
```

---

### Task 2.4: Create Session List Component

**Files:**
- Create: `src/features/task/ui-session-list/index.tsx`

**Step 1: Create the component**

Combines ProjectFilterTabs + list of SessionCards. Filters by selected project.

```tsx
// src/features/task/ui-session-list/index.tsx
import { useMemo } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import { useProjects } from '@/hooks/use-projects';
import { useNavigationStore } from '@/stores/navigation';
import { ProjectFilterTabs } from '@/features/project/ui-project-filter-tabs';
import { SessionCard } from '@/features/task/ui-session-card';

export function SessionList() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentTaskId = params.taskId;

  const { data: tasks = [] } = useAllActiveTasks();
  const { data: projects = [] } = useProjects();
  const projectFilter = useNavigationStore((s) => s.projectFilter);

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const filteredTasks = useMemo(() => {
    const active = tasks.filter((t) => !t.userCompleted);
    if (projectFilter === 'all') return active;
    return active.filter((t) => t.projectId === projectFilter);
  }, [tasks, projectFilter]);

  const handleTaskClick = (task: typeof tasks[0]) => {
    navigate({
      to: '/projects/$projectId/tasks/$taskId',
      params: { projectId: task.projectId, taskId: task.id },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <ProjectFilterTabs />
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {filteredTasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500">
            No active sessions
          </div>
        ) : (
          filteredTasks.map((task, index) => (
            <SessionCard
              key={task.id}
              task={task}
              project={projectMap.get(task.projectId)}
              index={index}
              isSelected={task.id === currentTaskId}
              onClick={() => handleTaskClick(task)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/task/ui-session-list/index.tsx
git commit -m "feat: add SessionList component with project filtering"
```

---

### Task 2.5: Create All Tasks Page

**Files:**
- Modify: `src/routes/all-tasks.tsx`

**Step 1: Read and update all-tasks route**

Update to use the new SessionList component and provide a proper layout.

**Step 2: Commit**

```bash
git add src/routes/all-tasks.tsx
git commit -m "feat: update all-tasks page to use SessionList"
```

---

### Task 2.6: Update Main Sidebar with Session List

**Files:**
- Modify: `src/layout/ui-main-sidebar/index.tsx`

**Step 1: Integrate SessionList into sidebar**

Replace or augment the current project tiles with the new session-centric layout.

**Step 2: Commit**

```bash
git add src/layout/ui-main-sidebar/
git commit -m "feat: integrate SessionList into main sidebar"
```

---

## Phase 3: Work Item Integration (New Task Spotlight)

### Task 3.1: Create useWorkItems Hook

**Files:**
- Create: `src/hooks/use-work-items.ts`

**Step 1: Create the hook**

Uses existing `queryWorkItems` API to fetch work items for a project.

```typescript
// src/hooks/use-work-items.ts
import { useQuery } from '@tanstack/react-query';

interface WorkItemFilters {
  states?: string[];
  workItemTypes?: string[];
  searchText?: string;
}

export function useWorkItems(
  providerId: string | null,
  projectId: string | null,
  projectName: string | null,
  filters: WorkItemFilters = {},
) {
  return useQuery({
    queryKey: ['workItems', providerId, projectId, filters],
    queryFn: async () => {
      if (!providerId || !projectId || !projectName) return [];
      return window.api.azureDevOps.queryWorkItems({
        providerId,
        projectId,
        projectName,
        filters,
      });
    },
    enabled: !!providerId && !!projectId && !!projectName,
    staleTime: 60000, // 1 minute
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-work-items.ts
git commit -m "feat: add useWorkItems hook"
```

---

### Task 3.2: Create Work Item List Component

**Files:**
- Create: `src/features/new-task/ui-work-item-list/index.tsx`

**Step 1: Create the component**

List of work items with type icon, ID, title, and selection states.

```tsx
// src/features/new-task/ui-work-item-list/index.tsx
import clsx from 'clsx';
import type { WorkItem } from '../../../../shared/azure-devops-types';

const TYPE_ICONS: Record<string, string> = {
  Bug: '🐛',
  'User Story': '📘',
  Task: '📋',
  Feature: '⭐',
  Epic: '🏔️',
};

export function WorkItemList({
  workItems,
  highlightedId,
  selectedId,
  onHighlight,
  onSelect,
}: {
  workItems: WorkItem[];
  highlightedId: string | null;
  selectedId: string | null;
  onHighlight: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {workItems.map((item) => {
        const isHighlighted = item.id.toString() === highlightedId;
        const isSelected = item.id.toString() === selectedId;
        const icon = TYPE_ICONS[item.fields['System.WorkItemType']] || '📄';

        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id.toString())}
            onMouseEnter={() => onHighlight(item.id.toString())}
            className={clsx(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
              isSelected
                ? 'bg-blue-600 text-white'
                : isHighlighted
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-300 hover:bg-neutral-800',
            )}
          >
            {isSelected && <span className="text-xs">●</span>}
            <span>{icon}</span>
            <span className="text-xs text-neutral-500">#{item.id}</span>
            <span className="flex-1 truncate">
              {item.fields['System.Title']}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/new-task/ui-work-item-list/index.tsx
git commit -m "feat: add WorkItemList component"
```

---

### Task 3.3: Create Work Item Details Component

**Files:**
- Create: `src/features/new-task/ui-work-item-details/index.tsx`

**Step 1: Create the component**

Shows full work item details: title, metadata, description.

```tsx
// src/features/new-task/ui-work-item-details/index.tsx
import type { WorkItem } from '../../../../shared/azure-devops-types';

const TYPE_ICONS: Record<string, string> = {
  Bug: '🐛',
  'User Story': '📘',
  Task: '📋',
  Feature: '⭐',
  Epic: '🏔️',
};

export function WorkItemDetails({ workItem }: { workItem: WorkItem | null }) {
  if (!workItem) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-neutral-500">
        <p className="text-sm">Select a work item to see details</p>
      </div>
    );
  }

  const type = workItem.fields['System.WorkItemType'];
  const title = workItem.fields['System.Title'];
  const state = workItem.fields['System.State'];
  const assignedTo = workItem.fields['System.AssignedTo']?.displayName;
  const description = workItem.fields['System.Description'] || '';
  const icon = TYPE_ICONS[type] || '📄';

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-lg">{icon}</span>
        <div>
          <div className="text-xs text-neutral-500">#{workItem.id}</div>
          <div className="font-medium">{title}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
        {assignedTo && <span>Assigned: {assignedTo}</span>}
        <span>State: {state}</span>
      </div>

      {description && (
        <>
          <hr className="border-neutral-700" />
          <div
            className="prose prose-invert prose-sm max-h-40 overflow-y-auto text-sm"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/new-task/ui-work-item-details/index.tsx
git commit -m "feat: add WorkItemDetails component"
```

---

### Task 3.4: Integrate Work Items into NewTaskOverlay

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`

**Step 1: Replace placeholder components with real implementations**

- Import and use WorkItemList and WorkItemDetails
- Wire up useWorkItems hook
- Implement keyboard navigation (arrow keys, Enter to select)
- Connect selection to draft state

**Step 2: Commit**

```bash
git add src/features/new-task/ui-new-task-overlay/index.tsx
git commit -m "feat: integrate work items into NewTaskOverlay"
```

---

## Phase 4: Annotated Diff

### Task 4.1: Create Summary Panel Component

**Files:**
- Create: `src/features/agent/ui-summary-panel/index.tsx`

**Step 1: Create the component**

Collapsible panel showing "What I Did" and "Key Decisions" from task summary.

```tsx
// src/features/agent/ui-summary-panel/index.tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TaskSummaryContent } from '@/lib/api';

export function SummaryPanel({
  summary,
  stats,
}: {
  summary: TaskSummaryContent | null;
  stats: { fileCount: number; linesAdded: number; linesRemoved: number };
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!summary) {
    return null;
  }

  return (
    <div className="border-b border-neutral-700">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-neutral-800"
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>Summary</span>
        <span className="text-xs text-neutral-500">
          {stats.fileCount} files · +{stats.linesAdded} -{stats.linesRemoved}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-3 px-4 pb-4">
          <div>
            <h4 className="mb-1 text-xs font-medium text-neutral-400 uppercase">
              What I Did
            </h4>
            <p className="text-sm text-neutral-300">{summary.whatIDid}</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-medium text-neutral-400 uppercase">
              Key Decisions
            </h4>
            <p className="text-sm whitespace-pre-wrap text-neutral-300">
              {summary.keyDecisions}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/agent/ui-summary-panel/index.tsx
git commit -m "feat: add SummaryPanel component"
```

---

### Task 4.2: Add Gutter Annotations to Diff View

**Files:**
- Modify: `src/features/agent/ui-diff-view/side-by-side-table.tsx`
- Modify: `src/features/agent/ui-diff-view/index.tsx`

**Step 1: Add annotations prop to diff components**

Accept `annotations: FileAnnotation[]` and render 💬 icons in the gutter.

**Step 2: Add expandable annotation popover**

When clicking 💬, show a popover with the explanation text.

**Step 3: Commit**

```bash
git add src/features/agent/ui-diff-view/
git commit -m "feat: add gutter annotations to diff view"
```

---

### Task 4.3: Add Generate Summary Button and Integration

**Files:**
- Modify: `src/features/agent/ui-diff-view/index.tsx`

**Step 1: Add generate summary button to diff view header**

Show "⌘⇧S Generate Summary" button when no summary exists, "Summary ✓" when it does.

**Step 2: Wire up useGenerateSummary mutation**

Call the mutation when button clicked or shortcut pressed.

**Step 3: Add keyboard shortcut for cmd+shift+s**

Register in the diff view's keyboard bindings.

**Step 4: Commit**

```bash
git add src/features/agent/ui-diff-view/
git commit -m "feat: add generate summary button and shortcut to diff view"
```

---

### Task 4.4: Integrate Summary Panel into Diff View

**Files:**
- Modify: `src/features/agent/ui-diff-view/index.tsx`

**Step 1: Add SummaryPanel above file list**

When summary exists, render the SummaryPanel component.

**Step 2: Pass annotations to diff table**

Extract file-specific annotations and pass to the diff table component.

**Step 3: Commit**

```bash
git add src/features/agent/ui-diff-view/index.tsx
git commit -m "feat: integrate SummaryPanel into diff view"
```

---

## Phase 5: Final Polish

### Task 5.1: Add Session Commands to Command Palette

**Files:**
- Create: `src/features/command-palette/session-commands.tsx`

**Step 1: Create session commands component**

Registers active sessions as searchable commands in the command palette.

```tsx
// src/features/command-palette/session-commands.tsx
import { useNavigate } from '@tanstack/react-router';
import { useAllActiveTasks } from '@/hooks/use-tasks';
import { useProjects } from '@/hooks/use-projects';
import { useCommands, type Command } from '@/lib/command-palette';

export function SessionCommands() {
  const navigate = useNavigate();
  const { data: tasks = [] } = useAllActiveTasks();
  const { data: projects = [] } = useProjects();

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const commands: Command[] = tasks
    .filter((t) => !t.userCompleted)
    .map((task, index) => ({
      id: `session-${task.id}`,
      label: task.name || 'Untitled',
      section: 'sessions',
      keywords: [
        projectMap.get(task.projectId)?.name || '',
        task.prompt.slice(0, 50),
      ].filter(Boolean),
      shortcut: index < 9 ? `cmd+${index + 1}` : undefined,
      onSelect: () =>
        navigate({
          to: '/projects/$projectId/tasks/$taskId',
          params: { projectId: task.projectId, taskId: task.id },
        }),
    }));

  useCommands('sessions', commands);

  return null;
}
```

**Step 2: Mount in __root.tsx**

Add `<SessionCommands />` alongside `<GlobalCommands />`.

**Step 3: Commit**

```bash
git add src/features/command-palette/session-commands.tsx src/routes/__root.tsx
git commit -m "feat: add session commands to command palette"
```

---

### Task 5.2: Add Task-Focused Commands

**Files:**
- Create: `src/features/command-palette/task-commands.tsx`

**Step 1: Create task-focused commands**

Register context-aware commands when a task is focused (view diff, create PR, etc.).

**Step 2: Mount in task route**

Add to the task detail page layout.

**Step 3: Commit**

```bash
git add src/features/command-palette/task-commands.tsx
git commit -m "feat: add task-focused commands to command palette"
```

---

### Task 5.3: Final Lint and Cleanup

**Step 1: Run lint**

Run: `pnpm lint --fix`

**Step 2: Run type check**

Run: `pnpm ts-check`

**Step 3: Fix any issues**

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: final lint cleanup for management UX features"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| Phase 2: Session List | 2.1 - 2.6 | Flat task list with project filtering |
| Phase 3: Work Items | 3.1 - 3.4 | Azure DevOps work item integration in New Task |
| Phase 4: Annotated Diff | 4.1 - 4.4 | Summary panel and gutter annotations |
| Phase 5: Polish | 5.1 - 5.3 | Command palette enhancements |

**Total Tasks:** 17

**Dependencies:**
- Phase 2 can start immediately (no dependencies)
- Phase 3 can run in parallel with Phase 2
- Phase 4 can run in parallel with Phases 2-3
- Phase 5 depends on Phases 2-4 completion
