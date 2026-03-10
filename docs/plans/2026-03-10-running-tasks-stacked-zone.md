# Running Tasks Stacked Zone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Running tasks appear as a stacked/collapsed group below pinned items but above everything else in the feed, spreading out on hover.

**Architecture:** Split the `normalItems` array in `useFeed` into `runningItems` and `restItems`. The feed list renders a new "running zone" between pinned and auto-sorted. The running zone uses CSS negative margins to stack cards with small peeks, and on mouse-enter of the container (with state + delayed collapse for dropdown portal safety), transitions to normal spacing.

**Tech Stack:** React, Tailwind CSS, CSS transitions, useState for hover state

---

### Task 1: Extract running items from normalItems in `useFeed`

**Files:**
- Modify: `src/hooks/use-feed.ts`

**What to do:**

In the `useMemo` that computes `pinnedItems`/`normalItems`/etc, split the current `normal` array into two: `running` (items with `attention === 'running'`) and `rest` (everything else). Running items excluded from low-priority check — if a user marks a running task as low priority it stays in the low zone.

Replace the existing loop and sort block:

```ts
const running: FeedItem[] = [];
const rest: FeedItem[] = [];

for (const item of items) {
  if (pinnedIds.has(item.id)) continue;
  if (dismissedIds.has(item.id)) {
    dCount++;
    continue;
  }
  if (lowPriorityIds.has(item.id)) {
    low.push(item);
  } else if (item.attention === 'running') {
    running.push(item);
  } else {
    rest.push(item);
  }
}

// Running items: sort by timestamp desc (all same attention score)
running.sort(
  (a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
);

// Rest: sort by score then timestamp (existing logic, applied to `rest`)
rest.sort((a, b) => {
  const scoreA = computeFeedScore({ attention: a.attention, projectPriority: a.projectPriority, isLowPriority: false });
  const scoreB = computeFeedScore({ attention: b.attention, projectPriority: b.projectPriority, isLowPriority: false });
  if (scoreB !== scoreA) return scoreB - scoreA;
  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
});
```

Return value changes:
- Rename `normalItems` → keep as `normalItems` but now contains only non-running items
- Add `runningItems` to the returned object

Update `allVisibleItems`:
```ts
const allVisibleItems = useMemo(
  () => [...pinnedItems, ...runningItems, ...normalItems],
  [pinnedItems, runningItems, normalItems],
);
```

Update `totalCount` to include `runningItems.length`.

---

### Task 2: Render the running zone in `FeedList`

**Files:**
- Modify: `src/features/feed/ui-feed-list/index.tsx`

**What to do:**

**2a: State-based hover expansion (NOT group-hover)**

The `Dropdown` in `FeedItemCard` uses `createPortal` to `document.body`. Pure CSS `group-hover` would collapse the stack when the mouse moves to the portal dropdown. Use state + delayed collapse instead:

```tsx
const [runningExpanded, setRunningExpanded] = useState(false);
const collapseTimer = useRef<ReturnType<typeof setTimeout>>();

const handleRunningEnter = useCallback(() => {
  clearTimeout(collapseTimer.current);
  setRunningExpanded(true);
}, []);

const handleRunningLeave = useCallback(() => {
  collapseTimer.current = setTimeout(() => setRunningExpanded(false), 300);
}, []);
```

**2b: Destructure `runningItems` and update counts**

```ts
const { pinnedItems, runningItems, normalItems, lowPriorityItems, isLoading } = useFeed();
```

Update `totalCount`:
```ts
const totalCount = pinnedItems.length + runningItems.length + normalItems.length + lowPriorityItems.length;
```

Update `allVisibleItems`:
```ts
const allVisibleItems = useMemo(
  () => [...pinnedItems, ...runningItems, ...normalItems],
  [pinnedItems, runningItems, normalItems],
);
```

**2c: Add the running zone JSX**

Insert between the pinned divider and the auto-sorted `<div>`:

```tsx
{/* Running tasks zone - stacked, spreads on hover */}
{runningItems.length > 0 && (
  <div
    className="flex flex-col py-0.5"
    onMouseEnter={handleRunningEnter}
    onMouseLeave={handleRunningLeave}
  >
    {runningItems.map((item, index) => (
      <div
        key={item.id}
        className={clsx(
          'relative transition-[margin] duration-200 ease-out',
          index > 0 && (runningExpanded ? 'mt-1.5' : '-mt-7'),
        )}
        style={{ zIndex: runningItems.length - index }}
      >
        <FeedCard
          item={item}
          isSelected={isItemSelected(item)}
          isDraggable
          onDragStart={() => setDraggedId(item.id)}
          onDragEnd={handleDragEnd}
        />
      </div>
    ))}
  </div>
)}

{/* Divider between running and auto-sorted */}
{runningItems.length > 0 && normalItems.length > 0 && (
  <div className="mx-2 my-1 border-t border-dashed border-neutral-700/50" />
)}
```

Key details:
- Single wrapper div per card (no nested wrappers)
- `-mt-7` (28px) overlap — cards are ~52px tall, so ~24px of each stacked card peeks out (enough to see the title row)
- `zIndex: runningItems.length - index` — first card on top since it's newest
- `transition-[margin] duration-200 ease-out` — smooth expand/collapse
- `mt-1.5` when expanded — matches the `gap-1.5` used in other zones
- Single running task: `index > 0` guard means no stacking applied

---

### Task 3: Lint and type-check

**Step 1:** `pnpm install && pnpm lint --fix`
**Step 2:** `pnpm ts-check`
**Step 3:** `pnpm lint`
