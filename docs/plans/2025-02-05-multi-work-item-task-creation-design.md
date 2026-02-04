# Multi-Work-Item Task Creation Design

## Overview

Enable selecting multiple Azure DevOps work items when creating a task, with a two-step flow: select work items → compose prompt with preview.

## Data Model Changes

### Draft State (`src/stores/new-task-draft.ts`)

```typescript
export interface NewTaskDraft {
  inputMode: InputMode;
  interactionMode: InteractionMode;
  // Search mode state - changed from single to array
  workItemIds: string[];           // was: workItemId: string | null
  workItemsFilter: string;
  // Prompt mode state
  prompt: string;
  // Shared state
  createWorktree: boolean;
  sourceBranch: string | null;
  // NEW: Track which "step" we're on in search mode
  searchStep: 'select' | 'compose';
}
```

### Task Data Model (`shared/types.ts` + database)

```typescript
// Task interface changes
workItemIds: string[] | null;   // replaces workItemId
workItemUrls: string[] | null;  // replaces workItemUrl (parallel array)
```

### Database Migration

- Add `work_item_ids` column (JSON array as text)
- Add `work_item_urls` column (JSON array as text)
- Migrate existing single values to arrays
- Drop old columns

## UI Flow

### Step 1: Select Work Items

```
┌─────────────────────────────────────────────────────────────┐
│  [Search filter input]                                       │
├─────────────────────────────────────────────────────────────┤
│  [All] [Project1] [Project2] ...                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┬───────────────────────────┐   │
│  │ Work Items (12)    Next →│  Work Item Details        │   │
│  │ ☑ #123 Fix login bug     │  #456 "Add dark mode"     │   │
│  │ ☐ #456 Add dark mode     │  Type: User Story         │   │
│  │ ☑ #789 Update API        │  State: Active            │   │
│  └─────────────────────────┴───────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Step 2: Compose Prompt

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────┬───────────────────────────┐   │
│  │ Prompt             Back │  Preview                  │   │
│  │                          │                           │   │
│  │ Implement the following  │  Implement the following  │   │
│  │ work items:              │  work items:              │   │
│  │                          │                           │   │
│  │ {#123}                   │  ## Work Item #123        │   │
│  │ {#789}                   │  "Fix login bug"          │   │
│  │                          │  Users cannot login...    │   │
│  │ [editable textarea]      │                           │   │
│  └─────────────────────────┴───────────────────────────┘   │
│                                                             │
│  [Worktree ☑] [Mode: plan] [Branch: main]    [Create Task] │
└─────────────────────────────────────────────────────────────┘
```

## Keyboard Shortcuts

| Step | Action | Result |
|------|--------|--------|
| select | Click work item | Toggle selection (checkbox) |
| select | ↑/↓ arrows | Move highlight (for details preview) |
| select | Enter | Toggle selection of highlighted item |
| select | Cmd+Enter | Go to compose step (if ≥1 selected) |
| compose | Edit textarea | Update prompt template |
| compose | Cmd+Enter | Create task |
| compose | Escape | Go back to select step |

## Prompt Template Format

### Template Syntax

```
Implement the following work items:

{#123}
{#456}
```

### Placeholder Expansion

Each `{#id}` expands to:

```markdown
## Work Item #123 "Fix login bug"

Users cannot login when their password contains special characters.

---
```

### Initial Template Generation

```typescript
const generateInitialTemplate = (workItemIds: string[]) => {
  const header = workItemIds.length === 1
    ? 'Implement the following work item:'
    : 'Implement the following work items:';

  const placeholders = workItemIds.map(id => `{#${id}}`).join('\n\n');

  return `${header}\n\n${placeholders}`;
};
```

## Files to Change

1. `electron/database/migrations/XXX_multi_work_items.ts`
2. `electron/database/schema.ts`
3. `shared/types.ts`
4. `src/stores/new-task-draft.ts`
5. `src/features/new-task/ui-new-task-overlay/index.tsx`
6. `src/features/new-task/ui-work-item-list/index.tsx`
7. `src/features/new-task/ui-prompt-composer/index.tsx` (NEW)
8. `src/hooks/use-tasks.ts`
9. `electron/ipc/handlers.ts`
10. `electron/database/repositories/task-repository.ts`

## Implementation Order

1. Database migration & types
2. Update draft store
3. Update WorkItemList with checkboxes
4. Create PromptComposer component
5. Wire up NewTaskOverlay two-step flow
6. Update task creation path
