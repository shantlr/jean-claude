# Subagent Todo Progress Preview — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the subagent's current todo progress (in-progress task name + completed/total count) in the collapsed subagent preview in the message stream.

**Architecture:** Add a `getTodoProgress()` extraction function that scans child entries for the latest `todo-write`, then render its output as a persistent line in the collapsed `SubagentEntry` preview, above the existing last-activity line.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react icons

---

## Context

### Key type: Normalized `todo-write` tool use

In `shared/normalized-message-v2.ts`, the `todo-write` tool use has:
- `input.todos[]` — array of `{ content, description?, status }` (description carries the `activeForm` value from the SDK)
- `result.newTodos[]` — same shape, represents the final state after the tool completes

### Key component: `SubagentEntry`

Located at `src/features/agent/ui-message-stream/ui-subagent-entry/index.tsx`. When collapsed, shows:
1. Header row (icon + description + agentType + model + chevron)
2. Last activity line via `getLastActivitySummary()` from `./last-activity.ts`
3. Result preview (first 140 chars, only when complete)

### Normalizer detail

The Claude normalizer (`electron/services/agent-backends/claude/normalize-claude-message-v2.ts`) maps `activeForm` from the original SDK input into the `description` field of the normalized todo item (see `mapTodoItem` at ~line 659).

---

### Task 1: Add `getTodoProgress()` function

**Files:**
- Modify: `src/features/agent/ui-message-stream/ui-subagent-entry/last-activity.ts`

**Step 1: Add the `getTodoProgress` function**

Add this exported function after the existing `getLastActivitySummary` function:

```typescript
/**
 * Extract todo progress from the most recent todo-write entry.
 * Returns the in-progress task label and completed/total counts.
 */
export function getTodoProgress(
  entries: NormalizedEntry[],
): { activeTask: string | null; completed: number; total: number } | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== 'tool-use' || entry.name !== 'todo-write') continue;

    const todoEntry = entry as ToolUseByName<'todo-write'>;
    const todos = todoEntry.result?.newTodos ?? todoEntry.input.todos;
    if (!todos || todos.length === 0) continue;

    const completed = todos.filter((t) => t.status === 'completed').length;
    const inProgress = todos.find((t) => t.status === 'in_progress');
    // description carries activeForm from normalizer, fall back to content
    const activeTask = inProgress
      ? (inProgress.description ?? inProgress.content)
      : null;

    return { activeTask, completed, total: todos.length };
  }
  return null;
}
```

Note: `ToolUseByName` is already imported at line 4 of this file. `NormalizedEntry` is already imported at line 2.

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

**Step 3: Commit**

```
git add src/features/agent/ui-message-stream/ui-subagent-entry/last-activity.ts
git commit -m "feat: add getTodoProgress extraction function for subagent entries"
```

---

### Task 2: Render todo progress in collapsed `SubagentEntry`

**Files:**
- Modify: `src/features/agent/ui-message-stream/ui-subagent-entry/index.tsx`

**Step 1: Add import and compute todo progress**

Add `Check` to the existing lucide-react import (line 1 already has `Bot, ChevronDown, ChevronRight, Loader2`):

```typescript
import { Bot, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
```

Add `getTodoProgress` to the existing import from `./last-activity` (line 14):

```typescript
import { getLastActivitySummary, getTodoProgress } from './last-activity';
```

Inside the `SubagentEntry` component, after the existing `lastActivity` useMemo (line 72-75), add:

```typescript
  // Get todo progress from child entries
  const todoProgress = useMemo(
    () => getTodoProgress(childEntries),
    [childEntries],
  );
```

**Step 2: Add the todo progress line in the collapsed preview**

Replace the existing collapsed preview block (lines 136-146):

```tsx
        {/* Todo progress (always shown when collapsed and has todos) */}
        {!isExpanded && todoProgress && (
          <div className="ml-5 flex items-center gap-1.5 text-xs">
            {todoProgress.activeTask ? (
              <>
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-indigo-400" />
                <span className="text-indigo-300">
                  {todoProgress.activeTask}
                </span>
                <span className="text-neutral-500">
                  ({todoProgress.completed}/{todoProgress.total})
                </span>
              </>
            ) : (
              <>
                <Check className="h-3 w-3 shrink-0 text-green-400" />
                <span className="text-green-400">
                  {todoProgress.completed}/{todoProgress.total} completed
                </span>
              </>
            )}
          </div>
        )}

        {/* Last activity preview (only when collapsed and has activity) */}
        {!isExpanded && lastActivity && (
          <div className="ml-5 text-xs text-neutral-500">{lastActivity}</div>
        )}

        {/* Sub-agent result preview (only when collapsed and available) */}
        {!isExpanded && resultPreview && (
          <div className="ml-5 max-h-9 overflow-hidden text-xs text-neutral-400">
            Result: {resultPreview}
          </div>
        )}
```

**Step 3: Lint and verify**

Run: `pnpm lint --fix && pnpm ts-check && pnpm lint`
Expected: No errors

**Step 4: Commit**

```
git add src/features/agent/ui-message-stream/ui-subagent-entry/index.tsx
git commit -m "feat: show todo progress in collapsed subagent preview"
```
