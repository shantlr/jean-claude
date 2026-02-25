# Timeline Prompt Navigator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add floating up/down navigation buttons on the timeline line that let users jump between user prompts, with a current/total counter.

**Architecture:** A `usePromptNavigation` hook tracks which user-prompt DOM elements are in view (via `data-prompt-index` attributes + scroll position). A `TimelinePromptNavigator` component renders a sticky vertical pill centered on the timeline line. Both are wired into the existing `MessageStream` component.

**Tech Stack:** React, Tailwind CSS, Lucide icons (ChevronUp/ChevronDown)

---

### Task 1: Create `usePromptNavigation` hook

**Files:**
- Create: `src/features/agent/ui-message-stream/use-prompt-navigation.ts`

**Reference:** `src/features/agent/ui-diff-view/use-change-navigator.ts` uses the same pattern (data attributes + scrollIntoView + rAF throttle + navigation lock).

**Step 1: Create the hook file**

```ts
// src/features/agent/ui-message-stream/use-prompt-navigation.ts
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export function usePromptNavigation({
  scrollContainerRef,
  totalPrompts,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  totalPrompts: number;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const rafRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Find the DOM element for a given prompt index
  const findPromptElement = useCallback(
    (index: number): Element | null => {
      const container = scrollContainerRef.current;
      if (!container) return null;
      return container.querySelector(`[data-prompt-index="${index}"]`);
    },
    [scrollContainerRef],
  );

  // Determine which prompt is "current" based on scroll position.
  // The last prompt whose top edge is at or above the viewport midpoint wins.
  const updateCurrentIndex = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || totalPrompts === 0) return;

    const midpoint = container.scrollTop + container.clientHeight / 3;
    let best = 0;

    for (let i = 0; i < totalPrompts; i++) {
      const el = findPromptElement(i);
      if (!el) continue;
      if ((el as HTMLElement).offsetTop <= midpoint) {
        best = i;
      } else {
        break;
      }
    }

    setCurrentIndex(best);
  }, [scrollContainerRef, totalPrompts, findPromptElement]);

  // Called by MessageStream's onScroll handler
  const handleScroll = useCallback(() => {
    if (isNavigatingRef.current) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      updateCurrentIndex();
      rafRef.current = null;
    });
  }, [updateCurrentIndex]);

  // Scroll to a specific prompt index
  const scrollToPrompt = useCallback(
    (index: number) => {
      const el = findPromptElement(index);
      if (!el) return;

      isNavigatingRef.current = true;
      if (navigationTimeoutRef.current !== null) {
        clearTimeout(navigationTimeoutRef.current);
      }

      setCurrentIndex(index);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      navigationTimeoutRef.current = setTimeout(() => {
        isNavigatingRef.current = false;
        navigationTimeoutRef.current = null;
      }, 500);
    },
    [findPromptElement],
  );

  const goToNext = useCallback(() => {
    if (totalPrompts === 0) return;
    const next = Math.min(currentIndex + 1, totalPrompts - 1);
    scrollToPrompt(next);
  }, [totalPrompts, currentIndex, scrollToPrompt]);

  const goToPrevious = useCallback(() => {
    if (totalPrompts === 0) return;
    const prev = Math.max(currentIndex - 1, 0);
    scrollToPrompt(prev);
  }, [totalPrompts, currentIndex, scrollToPrompt]);

  // Reset index when prompt count changes
  useEffect(() => {
    updateCurrentIndex();
  }, [totalPrompts, updateCurrentIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (navigationTimeoutRef.current !== null)
        clearTimeout(navigationTimeoutRef.current);
    };
  }, []);

  return {
    currentIndex,
    totalPrompts,
    goToNext,
    goToPrevious,
    handleScroll,
  };
}
```

**Step 2: Verify no type errors**

Run: `pnpm ts-check`
Expected: No new errors

---

### Task 2: Create `TimelinePromptNavigator` component

**Files:**
- Create: `src/features/agent/ui-message-stream/ui-timeline-prompt-navigator/index.tsx`

**Step 1: Create the component**

```tsx
// src/features/agent/ui-message-stream/ui-timeline-prompt-navigator/index.tsx
import { ChevronDown, ChevronUp } from 'lucide-react';

export function TimelinePromptNavigator({
  currentIndex,
  totalPrompts,
  onNext,
  onPrevious,
}: {
  currentIndex: number;
  totalPrompts: number;
  onNext: () => void;
  onPrevious: () => void;
}) {
  if (totalPrompts === 0) return null;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalPrompts - 1;

  return (
    // Sticky wrapper: h-0 so it takes no vertical space.
    // top-1/2 keeps it vertically centered in the scroll viewport.
    <div className="pointer-events-none sticky top-1/2 z-20 h-0">
      {/* Position centered on the timeline line (ml-3 = 12px from left) */}
      <div className="pointer-events-auto absolute -translate-y-1/2 left-[3px]">
        <div className="flex flex-col items-center gap-0.5 rounded-full border border-neutral-600 bg-neutral-800/90 px-0.5 py-1 shadow-lg backdrop-blur-sm">
          <button
            onClick={onPrevious}
            disabled={isFirst}
            className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
            aria-label="Previous prompt"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>

          <span className="text-[10px] tabular-nums leading-tight text-neutral-400">
            {currentIndex + 1}/{totalPrompts}
          </span>

          <button
            onClick={onNext}
            disabled={isLast}
            className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
            aria-label="Next prompt"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify no type errors**

Run: `pnpm ts-check`
Expected: No new errors

---

### Task 3: Wire into `MessageStream`

**Files:**
- Modify: `src/features/agent/ui-message-stream/index.tsx`

This is the main integration step. We need to:
1. Count user prompts across `displayMessages` and assign indices
2. Pass `data-prompt-index` via wrapper divs around prompt entries
3. Hook up `usePromptNavigation`
4. Render `TimelinePromptNavigator`
5. Feed scroll events to the hook

**Step 1: Update MessageStream**

Changes to `src/features/agent/ui-message-stream/index.tsx`:

a) Add imports:
```ts
import { usePromptNavigation } from './use-prompt-navigation';
import { TimelinePromptNavigator } from './ui-timeline-prompt-navigator';
```

b) After `displayMessages` useMemo, compute prompt index map — a Map<number, number> from displayMessage index to prompt index:
```ts
const promptIndexMap = useMemo(() => {
  const map = new Map<number, number>();
  let counter = 0;
  for (let i = 0; i < displayMessages.length; i++) {
    const dm = displayMessages[i];
    const isUserPrompt =
      (dm.kind === 'entry' &&
        dm.entry.type === 'user-prompt' &&
        dm.entry.value.trim() !== '') ||
      dm.kind === 'skill';
    if (isUserPrompt) {
      map.set(i, counter);
      counter++;
    }
  }
  return map;
}, [displayMessages]);

const totalPrompts = promptIndexMap.size;
```

c) Initialize the hook:
```ts
const { currentIndex, goToNext, goToPrevious, handleScroll: handlePromptScroll } =
  usePromptNavigation({
    scrollContainerRef,
    totalPrompts,
  });
```

d) Update the `handleScroll` callback to also call the hook's handler:
```ts
const handleScroll = useCallback(() => {
  isNearBottomRef.current = checkIfNearBottom();
  handlePromptScroll();
}, [checkIfNearBottom, handlePromptScroll]);
```

e) In the render, wrap prompt entries with `data-prompt-index`. In the `displayMessages.map(...)`:

For `kind === 'skill'` entries — wrap the `<SkillEntry>` with a div:
```tsx
if (displayMessage.kind === 'skill') {
  const promptIdx = promptIndexMap.get(index);
  return (
    <div
      key={index}
      {...(promptIdx !== undefined ? { 'data-prompt-index': promptIdx } : {})}
    >
      <SkillEntry ... />
    </div>
  );
}
```

For `kind === 'entry'` entries — wrap the `<TimelineEntry>` when it's a user prompt:
```tsx
const promptIdx = promptIndexMap.get(index);
if (promptIdx !== undefined) {
  return (
    <div key={index} data-prompt-index={promptIdx}>
      <TimelineEntry entry={displayMessage.entry} onFilePathClick={onFilePathClick} />
    </div>
  );
}
return (
  <TimelineEntry
    key={index}
    entry={displayMessage.entry}
    onFilePathClick={onFilePathClick}
  />
);
```

f) Render the navigator. Place it as the **first child** inside the scroll container div (before the timeline `border-l` div):
```tsx
return (
  <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-auto">
    <TimelinePromptNavigator
      currentIndex={currentIndex}
      totalPrompts={totalPrompts}
      onNext={goToNext}
      onPrevious={goToPrevious}
    />
    {/* Timeline vertical line */}
    <div className="relative ml-3 border-l border-neutral-700">
      ...
    </div>
  </div>
);
```

g) Remove the `console.log({ messages })` debug statement at line 77-79.

**Step 2: Verify no type errors**

Run: `pnpm ts-check`
Expected: No new errors

---

### Task 4: Lint and type-check

**Step 1: Run lint with autofix**

Run: `pnpm lint --fix`
Expected: Clean or only pre-existing warnings

**Step 2: Run type check**

Run: `pnpm ts-check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/features/agent/ui-message-stream/use-prompt-navigation.ts \
        src/features/agent/ui-message-stream/ui-timeline-prompt-navigator/index.tsx \
        src/features/agent/ui-message-stream/index.tsx
git commit -m "feat: add floating timeline prompt navigator

Adds up/down navigation buttons on the timeline line to jump between
user prompts. Shows current prompt index (e.g. 2/5), always visible
when messages exist. Uses sticky positioning to stay vertically centered."
```
