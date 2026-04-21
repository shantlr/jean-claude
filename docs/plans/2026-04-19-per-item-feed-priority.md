# Per-Item Feed Priority Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the project-level feed priority with per-item priority (`high | normal | low`) on individual PRs and work items, giving users granular control over feed ranking.

**Architecture:** The current system has two layers: a project-level `priority` field in the DB (unused for actual sorting) and a per-item `lowPriority: string[]` array in the Zustand feed store. We replace `lowPriority: string[]` with `itemPriority: Record<string, 'high' | 'low'>` (normal items are absent from the map). The context menu gets a priority submenu instead of a simple "mark low priority" toggle. Sorting in `use-feed.ts` gains a high-priority zone between running and normal. The project-level priority field in settings and DB remains untouched — it's orthogonal.

**Tech Stack:** React, Zustand (persisted to localStorage), TypeScript, Lucide icons, TanStack Router

---

### Task 1: Add `ItemPriority` type and update Zustand store

**Files:**
- Modify: `shared/feed-types.ts`
- Modify: `src/stores/feed.ts`

**Step 1: Add `ItemPriority` type to shared types**

In `shared/feed-types.ts`, add after the `ProjectPriority` type (line 17):

```ts
export type ItemPriority = 'high' | 'normal' | 'low';
```

**Step 2: Replace `lowPriority` with `itemPriority` in Zustand store**

In `src/stores/feed.ts`, replace the store interface and implementation:

Replace the `lowPriority: string[]` field with `itemPriority: Record<string, 'high' | 'low'>`. The key is the feed item ID, and the value is only stored when it differs from `'normal'` (normal = absent from map).

Replace `toggleLowPriority` with `setItemPriority(id: string, priority: ItemPriority)`:
- If priority is `'normal'`, delete the key from the map.
- Otherwise, set the key to the priority value.

Update `reconcile()` to reset `itemPriority` entries (instead of `lowPriority` entries) when an item's attention changes.

Update the `partialize` function to persist `itemPriority` instead of `lowPriority`.

The full updated store shape:

```ts
import type { FeedItemAttention, ItemPriority } from '@shared/feed-types';

interface FeedOverridesState {
  pinned: PinnedItem[];
  dismissed: string[];
  itemPriority: Record<string, 'high' | 'low'>;
  lastAttention: Record<string, FeedItemAttention>;

  pin: (id: string) => void;
  unpin: (id: string) => void;
  reorderPinned: (orderedIds: string[]) => void;
  dismiss: (id: string) => void;
  undismiss: (id: string) => void;
  setItemPriority: (id: string, priority: ItemPriority) => void;
  reconcile: (items: { id: string; attention: FeedItemAttention }[]) => void;
}
```

For `setItemPriority`:

```ts
setItemPriority: (id, priority) =>
  set((state) => {
    const next = { ...state.itemPriority };
    if (priority === 'normal') {
      delete next[id];
    } else {
      next[id] = priority;
    }
    return { itemPriority: next };
  }),
```

For `reconcile`, replace the `lowPriority` cleanup block with:

```ts
const newItemPriority = { ...state.itemPriority };
// ...inside the loop:
if (prevAttention && prevAttention !== item.attention) {
  if (item.id in newItemPriority) {
    delete newItemPriority[item.id];
    itemPriorityChanged = true;
  }
}
```

**Step 3: Add localStorage migration for existing `lowPriority` data**

In the `persist` config, add a `migrate` function that converts old `lowPriority: string[]` to `itemPriority: Record<string, 'high' | 'low'>`:

```ts
migrate: (persisted: unknown) => {
  const state = persisted as Record<string, unknown>;
  if (Array.isArray(state.lowPriority)) {
    const itemPriority: Record<string, 'high' | 'low'> = {};
    for (const id of state.lowPriority as string[]) {
      itemPriority[id] = 'low';
    }
    state.itemPriority = itemPriority;
    delete state.lowPriority;
  }
  return state as FeedOverridesState;
},
version: 1,
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

This will produce errors in files that reference `lowPriority` and `toggleLowPriority` — those are fixed in subsequent tasks.

**Step 5: Commit**

```
feat: replace lowPriority array with itemPriority map in feed store
```

---

### Task 2: Update `use-feed.ts` to categorize by item priority

**Files:**
- Modify: `src/hooks/use-feed.ts`

**Step 1: Replace `lowPriorityIds` with `itemPriority` map**

Replace:
```ts
const lowPriority = useFeedStore((s) => s.lowPriority);
const lowPriorityIds = useMemo(() => new Set(lowPriority), [lowPriority]);
```

With:
```ts
const itemPriority = useFeedStore((s) => s.itemPriority);
```

**Step 2: Add `highPriorityItems` to the categorization**

In the `useMemo` block (line ~134), add a `high` array alongside `actionNeeded`, `running`, `rest`, `low`:

```ts
const high: FeedItem[] = [];
```

Update the categorization loop: after checking pinned/dismissed/action-needed, check `itemPriority[item.id]`:

```ts
const priority = itemPriority[item.id]; // 'high' | 'low' | undefined
if (ACTION_NEEDED_ATTENTIONS.has(item.attention)) {
  actionNeeded.push(item);
} else if (priority === 'low') {
  low.push(item);
} else if (priority === 'high') {
  high.push(item);
} else if (item.attention === 'running') {
  running.push(item);
} else {
  rest.push(item);
}
```

Sort `high` with the same `bySourceThenTimestamp` comparator.

Return `highPriorityItems: high` from the memo.

**Step 3: Include `highPriorityItems` in `allVisibleItems`**

Update `allVisibleItems` to include high-priority items after action-needed:

```ts
const allVisibleItems = useMemo(
  () => [
    ...pinnedItems,
    ...actionNeededItems,
    ...highPriorityItems,
    ...runningItems,
    ...normalItems,
  ],
  [pinnedItems, actionNeededItems, highPriorityItems, runningItems, normalItems],
);
```

Return `highPriorityItems` from the hook.

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 5: Commit**

```
feat: categorize feed items by per-item priority (high/normal/low)
```

---

### Task 3: Update feed-item-card context menu

**Files:**
- Modify: `src/features/feed/ui-feed-list/feed-item-card.tsx`

**Step 1: Replace `toggleLowPriority` with `setItemPriority`**

Replace:
```ts
const toggleLowPriority = useFeedStore((s) => s.toggleLowPriority);
const isLowPriority = useFeedStore((s) => s.lowPriority.includes(item.id));
```

With:
```ts
import type { ItemPriority } from '@shared/feed-types';

const setItemPriority = useFeedStore((s) => s.setItemPriority);
const currentPriority: ItemPriority = useFeedStore(
  (s) => s.itemPriority[item.id] ?? 'normal',
);
```

**Step 2: Replace the low-priority toggle handler**

Replace `handleToggleLowPriority` with `handleSetPriority`:

```ts
const handleSetPriority = useCallback(
  (priority: ItemPriority) => {
    setItemPriority(item.id, priority);
    menuRef.current?.toggle();
  },
  [setItemPriority, item.id],
);
```

**Step 3: Replace the single "Mark low priority" menu item with priority submenu**

Replace the existing low-priority `DropdownItem` with three items showing the current selection. Import `ArrowUpNarrowWide` from lucide-react (alongside the existing `ArrowDownNarrowWide`), and `Check` icon.

```tsx
<DropdownItem
  onClick={() => handleSetPriority('high')}
  icon={<ArrowUpNarrowWide className="text-ink-2" />}
  suffix={currentPriority === 'high' ? <Check className="text-acc-ink h-3.5 w-3.5" /> : undefined}
>
  High priority
</DropdownItem>
<DropdownItem
  onClick={() => handleSetPriority('normal')}
  icon={<span className="h-4 w-4" />}
  suffix={currentPriority === 'normal' ? <Check className="text-acc-ink h-3.5 w-3.5" /> : undefined}
>
  Normal priority
</DropdownItem>
<DropdownItem
  onClick={() => handleSetPriority('low')}
  icon={<ArrowDownNarrowWide className="text-ink-2" />}
  suffix={currentPriority === 'low' ? <Check className="text-acc-ink h-3.5 w-3.5" /> : undefined}
>
  Low priority
</DropdownItem>
```

Check if `DropdownItem` supports a `suffix` prop. If not, use the label text with a check mark character or a right-side element approach. Look at the `DropdownItem` component interface first.

**Step 4: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 5: Commit**

```
feat: add priority submenu (high/normal/low) to feed item context menu
```

---

### Task 4: Update FeedList to render high-priority zone

**Files:**
- Modify: `src/features/feed/ui-feed-list/index.tsx`

**Step 1: Replace `toggleLowPriority` with `setItemPriority`**

Replace:
```ts
const toggleLowPriority = useFeedStore((s) => s.toggleLowPriority);
```

With:
```ts
const setItemPriority = useFeedStore((s) => s.setItemPriority);
```

**Step 2: Consume `highPriorityItems` from `useFeed()`**

Add `highPriorityItems` to the destructured result from `useFeed()`.

**Step 3: Render high-priority zone**

Add a high-priority section between the running zone and the normal zone. Use a similar pattern to the running zone but without stacking:

```tsx
{/* High priority zone */}
{highPriorityItems.length > 0 && (
  <div className="flex flex-col gap-1.5">
    {highPriorityItems.map((item) => (
      <FeedCard
        key={item.id}
        item={item}
        isSelected={isItemSelected(item)}
        isDraggable
        onDragStart={() => setDraggedId(item.id)}
        onDragEnd={handleDragEnd}
      />
    ))}
  </div>
)}
```

Add a dashed divider between high-priority and normal items when both exist.

**Step 4: Update the keyboard shortcut**

Replace the `cmd+shift+l` shortcut handler to cycle through priorities instead of toggling:

```ts
{
  label: 'Cycle Priority on Selected Feed Item',
  shortcut: 'cmd+shift+l',
  handler: () => {
    if (!currentItem) return;
    const current = useFeedStore.getState().itemPriority[currentItem.id] ?? 'normal';
    const next = current === 'normal' ? 'high' : current === 'high' ? 'low' : 'normal';
    setItemPriority(currentItem.id, next);
  },
  hideInCommandPalette: true,
},
```

**Step 5: Update `totalCount` to include high-priority items**

```ts
const totalCount =
  pinnedItems.length +
  actionNeededItems.length +
  highPriorityItems.length +
  runningItems.length +
  normalItems.length +
  lowPriorityItems.length;
```

**Step 6: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 7: Commit**

```
feat: render high-priority zone in feed list with keyboard cycling
```

---

### Task 5: Remove project-level feed priority from settings UI

**Files:**
- Modify: `src/features/project/ui-project-settings/index.tsx`

**Step 1: Remove the "Feed priority" section from the project settings Details tab**

Remove the entire `<div>` block containing the "Feed priority" label, `<Select>`, and description text (lines ~393-410).

**Step 2: Remove `priority` from local state and `handleSave`**

Remove:
- `const [priority, setPriority] = useState<ProjectPriority>('normal');`
- `setPriority(project.priority ?? 'normal');` from the sync effect
- `priority` from the `handleSave` data object
- `priority !== (project.priority ?? 'normal')` from the dirty check (if one exists)
- The `ProjectPriority` import from `@shared/feed-types` (if no longer used)

**Step 3: Verify TypeScript compiles**

Run: `pnpm ts-check`

**Step 4: Commit**

```
refactor: remove project-level feed priority from settings UI
```

---

### Task 6: Final lint and verify

**Step 1: Install dependencies**

Run: `pnpm install`

**Step 2: Auto-fix lint errors**

Run: `pnpm lint --fix`

**Step 3: TypeScript check**

Run: `pnpm ts-check`

**Step 4: Fix any remaining lint errors**

Run: `pnpm lint`

**Step 5: Commit any lint fixes**

```
chore: lint fixes for per-item feed priority
```

---

## Implementation Notes

### What's NOT changing

- **`projectPriority` on `FeedItem` / DB schema / feed-service**: The project-level priority field stays in the database and continues to be populated on `FeedItem.projectPriority`. It's not used for sorting today and we're not removing it — it could be useful later as a default for new items. We only remove the UI for setting it.
- **Pinned / dismissed behavior**: Unchanged.
- **`reconcile()` auto-reset**: Still resets overrides when attention changes — now applies to `itemPriority` entries.

### Feed zone rendering order (top to bottom)

1. **Pinned** — manually ordered
2. **Action needed** — permissions, questions, errors (sticky, stacked)
3. **High priority** — user-marked high
4. **Running** — active agent tasks (stacked)
5. **Normal** — everything else
6. **Low priority** — collapsed section

### DropdownItem suffix

Before implementing Task 3 Step 3, check if `DropdownItem` supports a `suffix` or `rightElement` prop. If not, there are two options:
- Add a `suffix` prop to the `DropdownItem` component (preferred)
- Use a simpler approach: show a bullet/dot prefix in the label text for the active priority
