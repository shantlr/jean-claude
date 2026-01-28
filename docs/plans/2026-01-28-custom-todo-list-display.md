# Custom Todo List Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display TodoWrite tool results as a visual checkbox list with change highlighting, instead of the generic collapsible tool entry.

**Architecture:** Extend `AgentMessage.tool_use_result` to a union type supporting both skill and todo data. Build a `parentMessageMap` that maps `tool_use_id` → parent `AgentMessage` and thread it through the rendering pipeline. Create a dedicated `TodoListEntry` component that renders checkboxes and highlights items that changed status.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons

---

### Task 1: Extend AgentMessage types for todo data

**Files:**
- Modify: `shared/agent-types.ts:38-41`

**Step 1: Add TodoItem and TodoToolUseResult types, extend tool_use_result union**

Add these new interfaces before the `AgentMessage` interface, and update the `tool_use_result` field:

```typescript
// Add after CompactMetadata interface (~line 22)

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export interface TodoToolUseResult {
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
}

export interface SkillToolUseResult {
  success: boolean;
  commandName: string;
}
```

Then update the `tool_use_result` field on `AgentMessage`:

```typescript
// Replace lines 36-41 in AgentMessage
  // SDK-provided fields for skill messages and todo updates
  isSynthetic?: boolean;
  tool_use_result?: SkillToolUseResult | TodoToolUseResult;
```

**Step 2: Add type guard helpers**

Add after the interfaces:

```typescript
export function isSkillToolUseResult(
  result: SkillToolUseResult | TodoToolUseResult,
): result is SkillToolUseResult {
  return 'commandName' in result;
}

export function isTodoToolUseResult(
  result: SkillToolUseResult | TodoToolUseResult,
): result is TodoToolUseResult {
  return 'newTodos' in result;
}
```

**Step 3: Update message-merger.ts to use the type guard**

In `src/features/agent/ui-message-stream/message-merger.ts`, update the skill launch check and the `skillName` extraction:

```typescript
// Line 1: Add import
import type {
  AgentMessage,
  CompactMetadata,
} from '../../../../shared/agent-types';
import { isSkillToolUseResult } from '../../../../shared/agent-types';

// Line 29-33: Update isSkillLaunchMessage
function isSkillLaunchMessage(message: AgentMessage): boolean {
  return (
    message.type === 'user' &&
    !!message.tool_use_result &&
    isSkillToolUseResult(message.tool_use_result) &&
    typeof message.tool_use_result.commandName === 'string'
  );
}

// Line 100: Update skillName extraction (inside the merge block)
skillName: (current.tool_use_result as { commandName: string }).commandName,
```

**Step 4: Verify no build errors**

Run: `cd /Users/plin/.idling/worktrees/idling/custom-todo-list-display-ui-n9az && pnpm lint`

**Step 5: Commit**

```bash
git add shared/agent-types.ts src/features/agent/ui-message-stream/message-merger.ts
git commit -m "feat: extend AgentMessage types to support todo tool_use_result data"
```

---

### Task 2: Build parentMessageMap and thread it to ToolEntry

**Files:**
- Modify: `src/features/agent/ui-message-stream/index.tsx`
- Modify: `src/features/agent/ui-timeline-entry/index.tsx`

**Step 1: Build parentMessageMap in MessageStream**

In `src/features/agent/ui-message-stream/index.tsx`, add a new map builder alongside `buildToolResultsMap`:

```typescript
// Add import for AgentMessage type (it's already imported as AgentMessageType)

// Add after buildToolResultsMap function (~line 52)
// Build a map of tool_use_id -> parent AgentMessage for user messages
// This gives ToolEntry access to the parent message's tool_use_result field
function buildParentMessageMap(
  messages: AgentMessageType[],
): Map<string, AgentMessageType> {
  const parentMap = new Map<string, AgentMessageType>();

  for (const message of messages) {
    if (message.type === 'user' && message.message) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            parentMap.set(block.tool_use_id, message);
          }
        }
      }
    }
  }

  return parentMap;
}
```

Then add the useMemo and pass it to TimelineEntry:

```typescript
// After the toolResultsMap useMemo (~line 72)
const parentMessageMap = useMemo(
  () => buildParentMessageMap(messages),
  [messages],
);

// In the TimelineEntry render (~line 149), add the new prop:
<TimelineEntry
  key={index}
  message={displayMessage.message}
  toolResultsMap={toolResultsMap}
  parentMessageMap={parentMessageMap}
  onFilePathClick={onFilePathClick}
/>
```

**Step 2: Thread parentMessageMap through TimelineEntry to ToolEntry**

In `src/features/agent/ui-timeline-entry/index.tsx`:

```typescript
// Update TimelineEntryProps (~line 23)
interface TimelineEntryProps {
  message: AgentMessage;
  toolResultsMap?: Map<string, ToolResultBlock>;
  parentMessageMap?: Map<string, AgentMessage>;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}

// Update TimelineEntry function signature (~line 534)
export function TimelineEntry({
  message,
  toolResultsMap,
  parentMessageMap,
  onFilePathClick,
}: TimelineEntryProps) {

// Update ToolEntry call (~line 601)
const parentMessage = parentMessageMap?.get(block.id);
entries.push(
  <ToolEntry
    key={i}
    block={block}
    result={result}
    parentMessage={parentMessage}
  />,
);
```

Update `ToolEntry` to accept the new prop:

```typescript
// Update ToolEntry component (~line 305)
function ToolEntry({
  block,
  result,
  parentMessage,
}: {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  parentMessage?: AgentMessage;
}) {
```

No behavior change yet — just threading the data through.

**Step 3: Verify no build errors**

Run: `cd /Users/plin/.idling/worktrees/idling/custom-todo-list-display-ui-n9az && pnpm lint`

**Step 4: Commit**

```bash
git add src/features/agent/ui-message-stream/index.tsx src/features/agent/ui-timeline-entry/index.tsx
git commit -m "feat: thread parentMessageMap to ToolEntry for todo data access"
```

---

### Task 3: Create TodoListEntry component

**Files:**
- Create: `src/features/agent/ui-todo-list-entry/index.tsx`

**Step 1: Create the component**

Create `src/features/agent/ui-todo-list-entry/index.tsx`:

```tsx
import { Check, Circle, Loader2 } from 'lucide-react';

import type { TodoItem } from '../../../../shared/agent-types';

/**
 * Determine which items changed status between old and new todo lists.
 * Returns a Set of indices (in newTodos) that changed.
 */
function getChangedIndices(
  oldTodos: TodoItem[],
  newTodos: TodoItem[],
): Set<number> {
  const changed = new Set<number>();

  for (let i = 0; i < newTodos.length; i++) {
    const oldItem = oldTodos[i];
    const newItem = newTodos[i];

    if (!oldItem) {
      // New item that didn't exist before
      changed.add(i);
    } else if (oldItem.status !== newItem.status) {
      // Status changed
      changed.add(i);
    }
  }

  return changed;
}

function TodoCheckbox({ item, isChanged }: { item: TodoItem; isChanged: boolean }) {
  const isCompleted = item.status === 'completed';
  const isInProgress = item.status === 'in_progress';

  return (
    <div
      className={`flex items-start gap-2 rounded px-2 py-1 ${
        isChanged
          ? isCompleted
            ? 'bg-green-500/10'
            : isInProgress
              ? 'bg-blue-500/10'
              : 'bg-neutral-500/10'
          : ''
      }`}
    >
      {/* Checkbox icon */}
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {isCompleted ? (
          <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm ${
            isChanged ? 'bg-green-500' : 'bg-neutral-600'
          }`}>
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </div>
        ) : isInProgress ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-neutral-600" />
        )}
      </div>

      {/* Label */}
      <span
        className={`text-xs leading-relaxed ${
          isCompleted
            ? 'text-neutral-500 line-through'
            : isInProgress
              ? 'text-blue-300'
              : 'text-neutral-400'
        }`}
      >
        {item.content}
      </span>
    </div>
  );
}

export function TodoListEntry({
  oldTodos,
  newTodos,
}: {
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
}) {
  const changedIndices = getChangedIndices(oldTodos, newTodos);
  const completedCount = newTodos.filter((t) => t.status === 'completed').length;

  return (
    <div className="relative pl-6">
      {/* Dot - indigo for TodoWrite */}
      <div className="absolute -left-1 top-2.5 h-2 w-2 rounded-full bg-indigo-500" />

      <div className="py-1.5 pr-3">
        {/* Summary header */}
        <div className="mb-1.5 text-xs text-neutral-400">
          Updated todo list ({completedCount}/{newTodos.length} completed)
        </div>

        {/* Checkbox list */}
        <div className="space-y-0.5">
          {newTodos.map((item, i) => (
            <TodoCheckbox
              key={i}
              item={item}
              isChanged={changedIndices.has(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify no build errors**

Run: `cd /Users/plin/.idling/worktrees/idling/custom-todo-list-display-ui-n9az && pnpm lint`

**Step 3: Commit**

```bash
git add src/features/agent/ui-todo-list-entry/index.tsx
git commit -m "feat: create TodoListEntry component with checkbox display and change highlighting"
```

---

### Task 4: Wire TodoListEntry into ToolEntry

**Files:**
- Modify: `src/features/agent/ui-timeline-entry/index.tsx`
- Modify: `src/features/agent/ui-timeline-entry/tool-summary.tsx`

**Step 1: Import and use TodoListEntry in ToolEntry**

In `src/features/agent/ui-timeline-entry/index.tsx`:

```typescript
// Add imports (~line 7)
import type {
  AgentMessage,
  // ...existing imports...
} from '../../../../shared/agent-types';
import { isTodoToolUseResult } from '../../../../shared/agent-types';
import { TodoListEntry } from '../ui-todo-list-entry';

// Inside ToolEntry component, at the very top of the function body (~line 312):
// Check if this is a TodoWrite tool with todo data
if (block.name === 'TodoWrite' && parentMessage?.tool_use_result && isTodoToolUseResult(parentMessage.tool_use_result)) {
  return (
    <TodoListEntry
      oldTodos={parentMessage.tool_use_result.oldTodos}
      newTodos={parentMessage.tool_use_result.newTodos}
    />
  );
}

// The rest of the existing ToolEntry logic continues as fallback
```

**Step 2: Update tool-summary.tsx to show count (for when todo data is NOT available)**

In `src/features/agent/ui-timeline-entry/tool-summary.tsx`, update the TodoWrite case to provide a better fallback summary. The `input.todos` array contains the new todos:

```typescript
case 'TodoWrite': {
  const todos = input.todos as Array<{ status: string }> | undefined;
  if (todos) {
    const completed = todos.filter((t) => t.status === 'completed').length;
    if (hasResult) return `Updated todo list (${completed}/${todos.length} completed)`;
    return `Updating todo list (${todos.length} items)...`;
  }
  if (hasResult) return 'Updated todo list';
  return 'Updating todo list...';
}
```

**Step 3: Verify no build errors**

Run: `cd /Users/plin/.idling/worktrees/idling/custom-todo-list-display-ui-n9az && pnpm lint`

**Step 4: Commit**

```bash
git add src/features/agent/ui-timeline-entry/index.tsx src/features/agent/ui-timeline-entry/tool-summary.tsx
git commit -m "feat: wire TodoListEntry into ToolEntry for TodoWrite tool results"
```

---

### Task 5: Visual polish and edge cases

**Files:**
- Modify: `src/features/agent/ui-todo-list-entry/index.tsx`
- Modify: `src/features/agent/ui-timeline-entry/index.tsx`

**Step 1: Handle pending state (no result yet)**

When the TodoWrite tool hasn't completed yet, we should still show the todo list from `block.input.todos` (the input to the tool) with a loading state. Update the ToolEntry logic:

```typescript
// In ToolEntry, update the TodoWrite check to also handle the pending case
if (block.name === 'TodoWrite') {
  // Case 1: Result available with tool_use_result containing todo data
  if (parentMessage?.tool_use_result && isTodoToolUseResult(parentMessage.tool_use_result)) {
    return (
      <TodoListEntry
        oldTodos={parentMessage.tool_use_result.oldTodos}
        newTodos={parentMessage.tool_use_result.newTodos}
      />
    );
  }

  // Case 2: Pending (no result yet) — show from input
  if (!result && Array.isArray(block.input.todos)) {
    const todos = block.input.todos as TodoItem[];
    return (
      <TodoListEntry
        oldTodos={[]}
        newTodos={todos}
        isPending
      />
    );
  }
}
```

**Step 2: Add isPending prop to TodoListEntry**

```tsx
// In ui-todo-list-entry/index.tsx, add isPending prop
export function TodoListEntry({
  oldTodos,
  newTodos,
  isPending = false,
}: {
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
  isPending?: boolean;
}) {
  // ... existing logic ...

  return (
    <div className="relative pl-6">
      {/* Dot - indigo for TodoWrite, with pulse if pending */}
      <div className={`absolute -left-1 top-2.5 h-2 w-2 rounded-full bg-indigo-500 ${isPending ? 'animate-pulse' : ''}`} />

      <div className="py-1.5 pr-3">
        {/* Summary header */}
        <div className="mb-1.5 flex items-center gap-2 text-xs text-neutral-400">
          {isPending && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          )}
          <span>
            {isPending
              ? `Updating todo list (${newTodos.length} items)...`
              : `Updated todo list (${completedCount}/${newTodos.length} completed)`}
          </span>
        </div>

        {/* Checkbox list */}
        <div className="space-y-0.5">
          {newTodos.map((item, i) => (
            <TodoCheckbox
              key={i}
              item={item}
              isChanged={changedIndices.has(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Verify no build errors**

Run: `cd /Users/plin/.idling/worktrees/idling/custom-todo-list-display-ui-n9az && pnpm lint`

**Step 4: Commit**

```bash
git add src/features/agent/ui-todo-list-entry/index.tsx src/features/agent/ui-timeline-entry/index.tsx
git commit -m "feat: handle pending TodoWrite state and add loading indicator"
```

---

### Task 6: Final verification

**Step 1: Run lint**

Run: `cd /Users/plin/.idling/worktrees/idling/custom-todo-list-display-ui-n9az && pnpm lint`

**Step 2: Run build**

Run: `cd /Users/plin/.idling/worktrees/idling/custom-todo-list-display-ui-n9az && pnpm build`

**Step 3: Fix any errors, re-lint, re-build, and commit if changes were needed**
