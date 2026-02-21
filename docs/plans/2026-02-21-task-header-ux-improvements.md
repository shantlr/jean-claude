# Task Header UX Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collapse the two-row task header into a clean single row with an overflow menu, and relocate context usage to the input footer.

**Architecture:** Extend the existing `<Dropdown>` component with dividers, checked state, and info rows. Restructure the task header JSX from a two-row flex column to a single-row flex with three zones. Move `<ContextUsageDisplay>` from the header into `TaskInputFooter`. Register a `Cmd+M` shortcut to open the overflow menu.

**Tech Stack:** React, TypeScript, Tailwind CSS, Zustand, existing `<Dropdown>` component, `useCommands` hook

---

### Task 1: Extend `<Dropdown>` — Add `DropdownDivider` Component

**Files:**
- Modify: `src/common/ui/dropdown/index.tsx:265` (append after `DropdownItem`)

**Step 1: Add `DropdownDivider` component**

After the existing `DropdownItem` component (line 265), add:

```tsx
export function DropdownDivider() {
  return (
    <hr
      role="separator"
      className="my-1 border-t border-neutral-700"
    />
  );
}
```

**Step 2: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/common/ui/dropdown/index.tsx
git commit -m "feat(dropdown): add DropdownDivider separator component"
```

---

### Task 2: Extend `<DropdownItem>` — Add `checked` Prop

**Files:**
- Modify: `src/common/ui/dropdown/index.tsx:236-265` (`DropdownItem` component)

**Step 1: Add `checked` prop to `DropdownItem`**

Replace the current `DropdownItem` component (lines 236-265) with:

```tsx
export function DropdownItem({
  children,
  onClick,
  icon,
  variant = 'default',
  checked,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
  checked?: boolean;
}) {
  return (
    <button
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none',
        variant === 'danger' ? 'text-red-400' : 'text-neutral-300',
      )}
    >
      {icon && (
        <span className="h-3.5 w-3.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {checked !== undefined && (
        <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" />
      )}
    </button>
  );
}
```

Note: The checkmark is only shown when `checked` is explicitly `true`. When `checked` is `undefined` (not passed), no checkmark space is rendered. When `checked` is `false`, the check is hidden but the item is still a toggle-type item.

Wait — better approach: only show the check icon when `checked === true`:

```tsx
      {checked === true && (
        <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" />
      )}
```

**Step 2: Add `Check` import**

At the top of the file, `Check` from lucide-react is not yet imported. Add it. The file currently doesn't import from lucide-react at all, so add:

```tsx
import { Check } from 'lucide-react';
```

after the existing imports (after line 18).

**Step 3: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 4: Verify existing dropdown usages still work**

`checked` is optional, so all existing usages (worktree branch menu, backlog context menu) will continue working without changes since they don't pass `checked`.

**Step 5: Commit**

```bash
git add src/common/ui/dropdown/index.tsx
git commit -m "feat(dropdown): add checked prop to DropdownItem for toggle indicators"
```

---

### Task 3: Extend `<Dropdown>` — Add `DropdownInfo` Component

**Files:**
- Modify: `src/common/ui/dropdown/index.tsx` (append after `DropdownDivider`)

**Step 1: Add `DropdownInfo` component**

After `DropdownDivider`, add:

```tsx
export function DropdownInfo({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={onCopy ? -1 : undefined}
      onClick={onCopy}
      className={clsx(
        'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-sm',
        onCopy
          ? 'cursor-pointer transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none'
          : 'cursor-default',
      )}
    >
      <span className="text-neutral-500">{label}</span>
      <span className="truncate font-mono text-xs text-neutral-400">
        {value}
      </span>
    </div>
  );
}
```

Note: When `onCopy` is provided, the row is focusable and clickable (for Session ID copy). When not provided, it's a static read-only display (for Model).

**Step 2: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/common/ui/dropdown/index.tsx
git commit -m "feat(dropdown): add DropdownInfo component for read-only info rows"
```

---

### Task 4: Add `onOpen` Callback to `<Dropdown>`

The overflow menu needs to be openable programmatically via `Cmd+M`. The current `<Dropdown>` only opens via trigger click. We need to expose a way to open it externally.

**Files:**
- Modify: `src/common/ui/dropdown/index.tsx:31-234` (`Dropdown` component)

**Step 1: Add imperative open via ref**

Add a `dropdownRef` prop to `Dropdown` that exposes `toggle()`:

In the `Dropdown` component props (line 37), add:

```tsx
  dropdownRef?: React.RefObject<{ toggle: () => void } | null>;
```

After the `toggle` callback definition (after line 71), add:

```tsx
  // Expose toggle to parent via ref
  useEffect(() => {
    if (dropdownRef) {
      dropdownRef.current = { toggle };
    }
    return () => {
      if (dropdownRef) {
        dropdownRef.current = null;
      }
    };
  }, [dropdownRef, toggle]);
```

Also add `dropdownRef` to the destructured props on line 31.

**Step 2: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/common/ui/dropdown/index.tsx
git commit -m "feat(dropdown): add dropdownRef prop for programmatic open/close"
```

---

### Task 5: Relocate `<ContextUsageDisplay>` to Footer

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx:662-675` (remove from header)
- Modify: `src/features/task/ui-task-panel/index.tsx:876-971` (`TaskInputFooter`)

**Step 1: Add `contextUsage` prop to `TaskInputFooter`**

In the `TaskInputFooter` component (line 876), add `contextUsage` to props:

Update the props type (lines 884-891) to include:

```tsx
  contextUsage: ContextUsage;
```

Add the import for `ContextUsage` type — it's already used in the file via `useContextUsage` hook (line 142). The type comes from `@/hooks/use-context-usage`.

Also add the `ContextUsageDisplay` import — it's already imported at line 23.

**Step 2: Render `ContextUsageDisplay` in the footer**

In the `TaskInputFooter` return JSX (line 941-969), add `ContextUsageDisplay` before the `ModeSelector`:

```tsx
  return (
    <div className="flex items-end gap-2 border-t border-neutral-700 bg-neutral-800 px-4 py-3">
      <ContextUsageDisplay contextUsage={contextUsage} />
      <ModeSelector
        ...
```

**Step 3: Pass `contextUsage` from `TaskPanel` to `TaskInputFooter`**

Find where `TaskInputFooter` is rendered in the `TaskPanel` component (around line 806). Add the `contextUsage` prop:

```tsx
<TaskInputFooter
  taskId={taskId}
  isRunning={isRunning}
  isStopping={isStopping}
  canSendMessage={canSendMessage}
  onSend={sendMessage}
  onQueue={queuePrompt}
  onStop={handleStop}
  contextUsage={contextUsage}
/>
```

**Step 4: Remove `ContextUsageDisplay` from the header**

In the header (lines 662-693), the right section renders model, context usage, and session ID. Remove the context usage line (line 675):

```tsx
{/* Context usage display */}
<ContextUsageDisplay contextUsage={contextUsage} />
```

Leave model and session ID in place for now (they'll move to the overflow menu in a later task).

**Step 5: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 6: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: relocate context usage display from header to input footer"
```

---

### Task 6: Collapse Header to Single Row + Overflow Menu

This is the main task — restructure the header from two rows to one row with an overflow menu.

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx:492-695` (header JSX)
- Modify: `src/features/task/ui-task-panel/constants.ts:7` (header height)

**Step 1: Update header height constant**

In `src/features/task/ui-task-panel/constants.ts`, change:

```ts
export const TASK_PANEL_HEADER_HEIGHT_CLS = 'min-h-[44px]';
```

This changes from 52px to 44px since we're going to a single row.

**Step 2: Add imports**

In `src/features/task/ui-task-panel/index.tsx`, add these imports:

```tsx
import { MoreHorizontal } from 'lucide-react';
```

(Add `MoreHorizontal` to the existing lucide-react import on lines 3-15)

```tsx
import { Dropdown, DropdownItem, DropdownDivider, DropdownInfo } from '@/common/ui/dropdown';
```

**Step 3: Add dropdown ref state**

In the `TaskPanel` component, near the other refs (around line 159), add:

```tsx
const overflowMenuRef = useRef<{ toggle: () => void } | null>(null);
```

**Step 4: Replace the entire header JSX**

Replace lines 492-695 (the `<div>` with `TASK_PANEL_HEADER_HEIGHT_CLS` through its closing tag) with:

```tsx
        <div
          className={clsx(
            'flex items-center gap-3 border-b border-neutral-700 px-3',
            TASK_PANEL_HEADER_HEIGHT_CLS,
          )}
        >
          {/* Left: Task title */}
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-200">
            {task.name ?? task.prompt.split('\n')[0]}
          </h1>

          {/* Center: Branch, PR badge, Work items */}
          <div className="flex shrink items-center gap-2">
            {/* Branch chip */}
            {(task.worktreePath || task.branchName) && (
              <span className="flex max-w-48 min-w-0 items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {task.branchName ??
                    getBranchFromWorktreePath(task.worktreePath!)}
                </span>
              </span>
            )}

            {/* PR badge */}
            {task.pullRequestId && task.pullRequestUrl && (
              <PrBadge
                pullRequestId={task.pullRequestId}
                pullRequestUrl={task.pullRequestUrl}
              />
            )}

            {/* Work item badges */}
            {task.workItemIds &&
              task.workItemIds.length > 0 &&
              task.workItemIds.map((workItemId, index) => {
                const workItemUrl = task.workItemUrls?.[index];
                return (
                  <button
                    key={workItemId}
                    onClick={() => {
                      if (workItemUrl) {
                        window.open(workItemUrl, '_blank');
                      }
                    }}
                    disabled={!workItemUrl}
                    className="flex items-center rounded px-1.5 py-0.5 text-xs font-medium text-blue-400 transition-colors hover:bg-neutral-700 hover:text-blue-300 disabled:cursor-default disabled:text-neutral-500 disabled:hover:bg-transparent"
                    title={
                      workItemUrl
                        ? `Open work item #${workItemId} in browser`
                        : `Work item #${workItemId}`
                    }
                  >
                    #{workItemId}
                  </button>
                );
              })}
          </div>

          {/* Right: Run + Overflow menu */}
          <div className="flex shrink-0 items-center gap-2">
            <RunButton
              projectId={project.id}
              workingDir={task.worktreePath ?? project.path}
            />

            {/* Overflow menu */}
            <Dropdown
              trigger={
                <button
                  className="flex items-center rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
                  title="Task menu (⌘M)"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
              align="right"
              dropdownRef={overflowMenuRef}
            >
              {/* Group 1: View toggles */}
              <DropdownItem
                icon={<FolderTree />}
                onClick={() => {
                  if (rightPane?.type === 'fileExplorer') {
                    closeRightPane();
                  } else {
                    openFileExplorer();
                  }
                }}
                checked={rightPane?.type === 'fileExplorer'}
              >
                Files
              </DropdownItem>
              {task.worktreePath && (
                <DropdownItem
                  icon={<GitCompare />}
                  onClick={toggleDiffView}
                  checked={isDiffViewOpen}
                >
                  Diff
                </DropdownItem>
              )}

              <DropdownDivider />

              {/* Group 2: Actions */}
              <DropdownItem
                icon={<ExternalLink />}
                onClick={handleOpenInEditor}
              >
                Open in {editorSetting ? getEditorLabel(editorSetting) : 'Editor'}
              </DropdownItem>
              {task.worktreePath && (
                <DropdownItem
                  icon={<ExternalLink />}
                  onClick={handleOpenWorktreeInEditor}
                >
                  Open Worktree in Editor
                </DropdownItem>
              )}
              <DropdownItem
                icon={<Settings />}
                onClick={handleToggleSettingsPane}
                checked={rightPane?.type === 'settings'}
              >
                Task Settings
              </DropdownItem>
              {!isRunning && (
                <DropdownItem
                  icon={<Trash2 />}
                  variant="danger"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  Delete Task
                </DropdownItem>
              )}

              {/* Group 3: Info (only when session data exists) */}
              {(task.sessionId || model) && (
                <>
                  <DropdownDivider />
                  {model && (
                    <DropdownInfo
                      label="Model"
                      value={formatModelName(model)}
                    />
                  )}
                  {task.sessionId && (
                    <DropdownInfo
                      label="Session"
                      value={`${task.sessionId.slice(0, 8)}...`}
                      onCopy={handleCopySessionId}
                    />
                  )}
                </>
              )}
            </Dropdown>
          </div>
        </div>
```

**Step 5: Clean up unused imports**

After removing the second row, these components/imports are no longer used in the header:
- `StatusIndicator` — remove import (line 36) and usage
- `PendingMessageInput` — remove import (line 81) and usage
- `WorktreeBranchMenu` — remove import (line 33) and usage (the branch name is now a static chip, not a dropdown with actions; the "Open in Editor" and "Delete Worktree" actions move into the overflow menu)
- `Copy`, `Check` icons — check if still needed (may be needed if `handleCopySessionId` still uses `copiedSessionId` state — but now the copy is handled by `DropdownInfo`, so `copiedSessionId` state, `Copy`, and `Check` can likely be removed)
- `formatKeyForDisplay` — check if still referenced (was used in title attributes for file explorer and diff buttons — now those are in the overflow menu without shortcut hints in the title)

Review each import and remove any that are no longer referenced.

**Step 6: Remove the `copiedSessionId` state if no longer needed**

If `handleCopySessionId` is now only used inside the `DropdownInfo` `onCopy` prop, check if the `copiedSessionId` state and its `setTimeout` logic (lines 154, 182-188) can be simplified. The copy action itself (writing to clipboard) should stay, but the visual feedback (showing a Check icon) is now handled differently — the `DropdownInfo` component could handle its own feedback, or we keep it simple and just copy without visual feedback in the menu since the menu closes on click.

Simplify `handleCopySessionId` to just:

```tsx
const handleCopySessionId = useCallback(async () => {
  if (task?.sessionId) {
    await navigator.clipboard.writeText(task.sessionId);
  }
}, [task?.sessionId]);
```

Remove `copiedSessionId` state and its `useState`.

**Step 7: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 8: Run lint**

Run: `pnpm lint --fix`
Expected: No errors (auto-fix any import ordering issues)

**Step 9: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx src/features/task/ui-task-panel/constants.ts
git commit -m "feat: collapse task header to single row with overflow menu"
```

---

### Task 7: Register `Cmd+M` Keyboard Shortcut

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx:376-470` (`useCommands` registration)

**Step 1: Add the Task Menu command**

In the `useCommands('task-panel', [...])` array (line 376), add a new entry:

```tsx
    {
      label: 'Task Menu',
      shortcut: 'cmd+m',
      section: 'Task',
      handler: () => {
        overflowMenuRef.current?.toggle();
      },
    },
```

Add this as the first entry in the array for visibility.

**Step 2: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/features/task/ui-task-panel/index.tsx
git commit -m "feat: add Cmd+M shortcut to open task overflow menu"
```

---

### Task 8: Remove Stale Code — `PendingMessageInput` and `StatusIndicator`

**Files:**
- Modify: `src/features/task/ui-task-panel/index.tsx` (clean up imports)
- Potentially delete: `src/features/task/ui-task-panel/pending-message-input.tsx` (if only used in header)

**Step 1: Check if `PendingMessageInput` is used anywhere else**

Search for imports of `PendingMessageInput` across the codebase. If it's only used in the task panel header, and we've removed it, the file `pending-message-input.tsx` can be deleted.

**Step 2: Check if `StatusIndicator` is used anywhere else**

Search for imports of `StatusIndicator` across the codebase. It's likely used in task list items too, so don't delete the component — just remove the import from `index.tsx`.

**Step 3: Remove unused imports from `index.tsx`**

Remove any imports that are no longer referenced after the header refactor. Candidates:
- `StatusIndicator` import (line 36) — if no longer used in this file
- `PendingMessageInput` import (line 81) — if no longer used
- `WorktreeBranchMenu` import (line 33) — replaced by static branch chip + overflow menu items
- `Copy`, `Check` from lucide-react (lines 5-6) — if `copiedSessionId` state was removed
- `formatKeyForDisplay` (line 18) — if no longer referenced
- `copiedSessionId` state (line 154) — if simplified

**Step 4: Delete `pending-message-input.tsx` if orphaned**

Only if no other file imports it.

**Step 5: Verify build**

Run: `pnpm ts-check`
Expected: No type errors

**Step 6: Run lint**

Run: `pnpm lint --fix`
Expected: No errors

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove stale imports and unused pending message input"
```

---

### Task 9: Final Verification

**Step 1: Full type check**

Run: `pnpm ts-check`
Expected: No type errors

**Step 2: Full lint check**

Run: `pnpm lint --fix`
Expected: No errors

**Step 3: Build check**

Run: `pnpm build`
Expected: Successful build

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final cleanup after task header UX overhaul"
```
