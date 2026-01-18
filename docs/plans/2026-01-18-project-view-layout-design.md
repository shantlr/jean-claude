# Project View Layout Design

## Overview

Implement the project view layout (Phase 2.1) with a secondary project sidebar, task list, and placeholder task panel. Includes read tracking for unread badges and project details page.

## Route Structure

```
/projects/$projectId              → Project layout (sidebar + content area)
/projects/$projectId/             → Redirect to first task or empty state
/projects/$projectId/details      → Project details/settings
/projects/$projectId/tasks/new    → New task creation form
/projects/$projectId/tasks/$taskId → Task panel (placeholder for now)
```

## Database Changes

### TaskTable Addition

Add `readAt` column to track when user last viewed a task:

```typescript
interface TaskTable {
  // ... existing fields
  readAt: string | null;  // ISO timestamp, null = never read
}
```

### Unread Logic

A task is "unread" when:
- Status is `waiting`, `completed`, or `errored`
- AND (`readAt` is null OR `updatedAt > readAt`)

The `running` status is never considered unread (expected state during work).

## Components

### New Files

```
src/components/
  project-sidebar.tsx      → Secondary sidebar for project view
  task-list-item.tsx       → Single task row with status + unread badge
  status-indicator.tsx     → Colored dot for task status

src/routes/projects/
  $projectId.tsx           → Layout with project sidebar (modify existing)
  $projectId/
    index.tsx              → Redirect to first task or empty state
    details.tsx            → Project details/settings page
    tasks/
      new.tsx              → New task creation form
      $taskId.tsx          → Task panel placeholder
```

### Project Sidebar

- Width: 256px
- Header: Project color dot + name (links to `/projects/$projectId/details`)
- "New task" button (full-width, prominent)
- Scrollable task list (sorted by `createdAt` descending)

### Task List Item

Displays:
- Status indicator (colored dot)
  - Green: running
  - Yellow: waiting
  - Gray: completed
  - Red: errored
- Task name (truncated if long)
- Relative timestamp ("2m ago")
- Unread badge (small dot) when applicable

### Project Tile (Main Sidebar)

- Fetch tasks via `useProjectTasks(projectId)`
- Compute unread count client-side
- Show badge dot when unread > 0

## Pages

### Project Details (`/projects/$projectId/details`)

**Project info section:**
- Project name (editable input)
- Project path (read-only)
- Project type badge (local / git-provider)

**Appearance section:**
- Color picker (same palette as project creation)

**Danger zone:**
- Delete project button with confirmation

### Task Creation (`/projects/$projectId/tasks/new`)

**Form fields:**
- Task name (optional, auto-generate from prompt if empty)
- Prompt (multiline textarea, required)
- Use worktree checkbox (default: checked)

**Submit behavior:**
- Creates task with status `waiting` (agent integration deferred)
- Navigates to `/projects/$projectId/tasks/$newTaskId`

### Task Panel (`/projects/$projectId/tasks/$taskId`)

**Placeholder until Phase 2.3:**
- Task name + status badge + timestamp
- Displays the task prompt
- Message: "Agent session will appear here"

**Mark as read:**
- On mount, update `readAt` to current timestamp

## API Changes

### New Methods

```typescript
tasks: {
  // ... existing
  markAsRead: (id: string) => Promise<Task>;
}
```

### Migration

Create migration to add `readAt` column:

```sql
ALTER TABLE tasks ADD COLUMN readAt TEXT;
```

## Implementation Order

1. Database migration (add `readAt` column)
2. API changes (add `markAsRead`, update types)
3. Status indicator component
4. Task list item component
5. Project sidebar component
6. Route: `$projectId.tsx` layout (modify existing)
7. Route: `$projectId/index.tsx` (redirect/empty state)
8. Route: `$projectId/details.tsx`
9. Route: `$projectId/tasks/new.tsx`
10. Route: `$projectId/tasks/$taskId.tsx`
11. Update ProjectTile with unread badge
