# Overlay Context & Dropdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a centralized overlay click-outside detection system and a reusable portal-based Dropdown component.

**Architecture:** A React context (`RootOverlay`) mirrors the `RootKeyboardBindings` pattern — a single document-level `mousedown` listener with a priority-ordered handler registry. A `<Dropdown>` component registers with this context and renders portal content positioned relative to its trigger.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS 4, createPortal, cloneElement

---

### Task 1: Root Overlay Context

**Files:**
- Create: `src/common/context/overlay/index.tsx`

**Step 1: Create the overlay context provider and hook**

```tsx
// src/common/context/overlay/index.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

const RootOverlayContext = createContext<{
  register: (
    id: string,
    refs: RefObject<HTMLElement | null>[],
    onClose: () => void,
  ) => () => void;
} | null>(null);

export function RootOverlay({ children }: { children: ReactNode }) {
  const handlersRef = useRef<
    {
      id: string;
      refs: RefObject<HTMLElement | null>[];
      onClose: () => void;
    }[]
  >([]);

  const register = useCallback(
    (
      id: string,
      refs: RefObject<HTMLElement | null>[],
      onClose: () => void,
    ) => {
      // Remove existing if re-registering
      handlersRef.current = handlersRef.current.filter((h) => h.id !== id);

      // Add to end (highest priority)
      handlersRef.current.push({ id, refs, onClose });

      // Return unsubscribe
      return () => {
        handlersRef.current = handlersRef.current.filter((h) => h.id !== id);
      };
    },
    [],
  );

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;

      // Loop from end (most recently registered = highest priority)
      for (let i = handlersRef.current.length - 1; i >= 0; i--) {
        const handler = handlersRef.current[i];
        const isInside = handler.refs.some(
          (ref) => ref.current && ref.current.contains(target),
        );

        if (isInside) {
          // Click is inside this overlay — stop, don't close anything
          return;
        }

        // Click is outside this overlay — close it and stop
        handler.onClose();
        return;
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const value = useMemo(() => ({ register }), [register]);

  return (
    <RootOverlayContext.Provider value={value}>
      {children}
    </RootOverlayContext.Provider>
  );
}

function useRootOverlay() {
  const context = useContext(RootOverlayContext);
  if (!context) {
    throw new Error('useRootOverlay must be used within RootOverlay');
  }
  return context;
}

/**
 * Register an overlay element for click-outside detection.
 *
 * @param id - Unique identifier for this overlay
 * @param refs - Array of refs considered "inside" this overlay (e.g., trigger + content)
 * @param onClose - Called when a click outside is detected
 *
 * @example
 * ```tsx
 * useRegisterOverlay('my-dropdown', [triggerRef, contentRef], () => setOpen(false));
 * ```
 */
export function useRegisterOverlay(
  id: string,
  refs: RefObject<HTMLElement | null>[],
  onClose: () => void,
): void {
  const root = useRootOverlay();
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stable refs wrapper so registration doesn't churn
  const stableRefs = useRef(
    new Proxy({} as { current: RefObject<HTMLElement | null>[] }, {
      get: (_target, prop) => {
        if (prop === 'current') return refsRef.current;
        return undefined;
      },
    }),
  );

  useEffect(() => {
    // Create stable wrappers that delegate to current values
    const refsProxy = refsRef.current.map(
      (_, index) =>
        ({
          get current() {
            return refsRef.current[index]?.current ?? null;
          },
        }) as RefObject<HTMLElement | null>,
    );

    return root.register(id, refsProxy, () => onCloseRef.current());
  }, [id, root]);
}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS with no errors

**Step 3: Commit**

```bash
git add src/common/context/overlay/index.tsx
git commit -m "feat: add RootOverlay context for centralized click-outside detection"
```

---

### Task 2: Wire RootOverlay into App

**Files:**
- Modify: `src/app.tsx`

**Step 1: Add RootOverlay to the provider stack**

In `src/app.tsx`, import `RootOverlay` and wrap it around the existing tree, inside `RootKeyboardBindings`:

```tsx
import { RootOverlay } from './common/context/overlay';
```

Update the JSX in the `App` component:

```tsx
export default function App() {
  return (
    <>
      <DetectKeyboardLayout />
      <RootKeyboardBindings>
        <RootOverlay>
          <ModalProvider>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </ModalProvider>
        </RootOverlay>
      </RootKeyboardBindings>
    </>
  );
}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app.tsx
git commit -m "feat: wire RootOverlay into app provider stack"
```

---

### Task 3: Dropdown Component

**Files:**
- Create: `src/common/ui/dropdown/index.tsx`

**Step 1: Create the Dropdown and DropdownItem components**

The Dropdown component:
- Accepts `trigger` as either a `ReactElement` or a render function `(props: { triggerRef }) => ReactElement`
- If `trigger` is a ReactElement, uses `cloneElement` to attach a ref (composing with any existing ref via a callback ref)
- Manages its own `isOpen` state (uncontrolled)
- Renders content into a portal on `document.body`
- Positions content using `getBoundingClientRect()` of the trigger
- Registers with overlay context via `useRegisterOverlay`
- Registers `escape` keyboard binding via `useRegisterKeyboardBindings`
- Auto-flips direction (bottom/top) based on available viewport space
- Recalculates position on scroll/resize via passive event listeners

```tsx
// src/common/ui/dropdown/index.tsx
import clsx from 'clsx';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useRegisterOverlay } from '@/common/context/overlay';

export function Dropdown({
  trigger,
  children,
  align = 'left',
  side = 'bottom',
  className,
}: {
  trigger:
    | ReactElement
    | ((props: { triggerRef: RefObject<HTMLElement | null> }) => ReactElement);
  children: ReactNode;
  align?: 'left' | 'right';
  side?: 'bottom' | 'top';
  className?: string;
}) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    actualSide: 'top' | 'bottom';
  } | null>(null);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Register with overlay context for click-outside detection
  useRegisterOverlay(
    `dropdown-${id}`,
    [triggerRef, contentRef],
    close,
  );

  // Register escape to close
  useRegisterKeyboardBindings(
    `dropdown-${id}`,
    isOpen
      ? {
          escape: () => {
            close();
            return true;
          },
        }
      : {},
  );

  // Calculate position when opening
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const dropdownMaxHeight = 320;
      const gap = 4;

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const actualSide =
        side === 'bottom'
          ? spaceBelow >= dropdownMaxHeight || spaceBelow >= spaceAbove
            ? 'bottom'
            : 'top'
          : spaceAbove >= dropdownMaxHeight || spaceAbove >= spaceBelow
            ? 'top'
            : 'bottom';

      const top =
        actualSide === 'bottom' ? rect.bottom + gap : rect.top - gap;

      const left = align === 'right' ? rect.right : rect.left;

      setPosition({ top, left, actualSide });
    };

    updatePosition();

    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, side, align]);

  // Build trigger element
  let triggerElement: ReactElement;
  if (typeof trigger === 'function') {
    triggerElement = trigger({ triggerRef });
  } else if (isValidElement(trigger)) {
    triggerElement = cloneElement(trigger as ReactElement<Record<string, unknown>>, {
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node;
        // Preserve original ref if any
        const originalRef = (trigger as unknown as { ref?: unknown }).ref;
        if (typeof originalRef === 'function') {
          originalRef(node);
        } else if (originalRef && typeof originalRef === 'object' && 'current' in originalRef) {
          (originalRef as { current: unknown }).current = node;
        }
      },
      onClick: (e: React.MouseEvent) => {
        // Call original onClick if present
        const originalProps = trigger.props as Record<string, unknown>;
        if (typeof originalProps.onClick === 'function') {
          (originalProps.onClick as (e: React.MouseEvent) => void)(e);
        }
        toggle();
      },
    });
  } else {
    throw new Error('Dropdown trigger must be a ReactElement or render function');
  }

  return (
    <>
      {triggerElement}
      {isOpen &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            className={clsx(
              'fixed z-50 min-w-48 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg',
              className,
            )}
            style={{
              top:
                position.actualSide === 'bottom'
                  ? position.top
                  : undefined,
              bottom:
                position.actualSide === 'top'
                  ? window.innerHeight - position.top
                  : undefined,
              left: align === 'left' ? position.left : undefined,
              right:
                align === 'right'
                  ? window.innerWidth - position.left
                  : undefined,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function DropdownItem({
  children,
  onClick,
  icon,
  variant = 'default',
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700',
        variant === 'danger' ? 'text-red-400' : 'text-neutral-300',
      )}
    >
      {icon && <span className="h-3.5 w-3.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">{icon}</span>}
      {children}
    </button>
  );
}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/common/ui/dropdown/index.tsx
git commit -m "feat: add Dropdown and DropdownItem components with portal and overlay integration"
```

---

### Task 4: Refactor WorktreeBranchMenu to use Dropdown

**Files:**
- Modify: `src/features/agent/ui-worktree-branch-menu/index.tsx`

**Step 1: Rewrite WorktreeBranchMenu using Dropdown**

Replace the entire file. Remove manual click-outside and escape listeners, replacing with `<Dropdown>`:

```tsx
// src/features/agent/ui-worktree-branch-menu/index.tsx
import { ExternalLink, GitBranch, Trash2 } from 'lucide-react';

import { Dropdown, DropdownItem } from '@/common/ui/dropdown';

export function WorktreeBranchMenu({
  branchName,
  onOpenInEditor,
  onDeleteWorktree,
}: {
  branchName: string;
  onOpenInEditor: () => void;
  onDeleteWorktree: () => void;
}) {
  return (
    <Dropdown
      trigger={
        <button
          className="flex max-w-48 min-w-0 items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          title="Worktree branch actions"
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{branchName}</span>
        </button>
      }
    >
      <DropdownItem icon={<ExternalLink />} onClick={onOpenInEditor}>
        Open in Editor
      </DropdownItem>
      <DropdownItem
        icon={<Trash2 />}
        variant="danger"
        onClick={onDeleteWorktree}
      >
        Delete Worktree
      </DropdownItem>
    </Dropdown>
  );
}
```

**Step 2: Run lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/features/agent/ui-worktree-branch-menu/index.tsx
git commit -m "refactor: rewrite WorktreeBranchMenu to use Dropdown component"
```

---

### Task 5: Final verification

**Step 1: Run full lint and type check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS with no errors

**Step 2: Run build**

Run: `pnpm build`
Expected: PASS
