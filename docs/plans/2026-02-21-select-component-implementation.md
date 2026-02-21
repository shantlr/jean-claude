# Select Component Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a reusable `Select` component with imperative ref (next/prev/open/close) and built-in shortcut support, then refactor existing selectors to use it.

**Architecture:** A controlled `Select<T>` component in `src/common/ui/select/` that mirrors the `Dropdown` component's portal/overlay/keyboard internals but renders its own trigger button showing the selected value. Exposes `SelectRef` via `forwardRef`+`useImperativeHandle`. Optional `shortcut` prop registers a keyboard binding that cycles or opens the select.

**Tech Stack:** React 19 (forwardRef, useImperativeHandle, useId), createPortal, existing `useRegisterOverlay` + `useRegisterKeyboardBindings` hooks, Tailwind CSS, `Kbd` component.

**Design doc:** `docs/plans/2026-02-21-select-component-design.md`

---

### Task 1: Create the Select component

**Files:**
- Create: `src/common/ui/select/index.tsx`

**Step 1: Create the file with the full Select component**

Create `src/common/ui/select/index.tsx` with the following content. This is a single component that handles:
- Portal-based dropdown positioning (same algorithm as `src/common/ui/dropdown/index.tsx`)
- Click-outside via `useRegisterOverlay`
- Keyboard navigation when open via `useRegisterKeyboardBindings`
- Imperative ref with `next`/`prev`/`open`/`close`
- Optional shortcut binding with configurable behavior (`'cycle'` or `'open'`)

```tsx
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { useRegisterOverlay } from '@/common/context/overlay';
import { Kbd } from '@/common/ui/kbd';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectRef {
  next: () => void;
  prev: () => void;
  open: () => void;
  close: () => void;
}

export const Select = forwardRef<
  SelectRef,
  {
    value: string;
    options: SelectOption<string>[];
    onChange: (value: string) => void;
    disabled?: boolean;
    label?: string;
    side?: 'top' | 'bottom';
    align?: 'left' | 'right';
    className?: string;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
  }
>(function Select(
  {
    value,
    options,
    onChange,
    disabled,
    label,
    side = 'bottom',
    align = 'left',
    className,
    shortcut,
    shortcutBehavior = 'cycle',
  },
  ref,
) {
  const id = useId();
  const listboxId = `select-listbox-${id}`;
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    actualSide: 'top' | 'bottom';
  } | null>(null);

  const selectedOption = options.find((o) => o.value === value) ?? options[0];
  const selectedIndex = options.findIndex((o) => o.value === value);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
  }, [disabled]);

  const toggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => {
      if (prev) {
        setFocusedIndex(-1);
        triggerRef.current?.focus();
      }
      return !prev;
    });
  }, [disabled]);

  const cycleNext = useCallback(() => {
    if (options.length === 0) return;
    const nextIndex =
      selectedIndex === -1 ? 0 : (selectedIndex + 1) % options.length;
    onChange(options[nextIndex].value);
  }, [options, selectedIndex, onChange]);

  const cyclePrev = useCallback(() => {
    if (options.length === 0) return;
    const prevIndex =
      selectedIndex <= 0 ? options.length - 1 : selectedIndex - 1;
    onChange(options[prevIndex].value);
  }, [options, selectedIndex, onChange]);

  // Imperative ref
  useImperativeHandle(
    ref,
    () => ({
      next: cycleNext,
      prev: cyclePrev,
      open,
      close,
    }),
    [cycleNext, cyclePrev, open, close],
  );

  // Get all option elements in the listbox
  const getOptionElements = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
  }, []);

  // Focus an option by index
  const focusOption = useCallback(
    (index: number) => {
      const items = getOptionElements();
      if (index >= 0 && index < items.length) {
        items[index].focus();
        setFocusedIndex(index);
      }
    },
    [getOptionElements],
  );

  // Auto-focus selected (or first) item when dropdown opens
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    const timer = requestAnimationFrame(() => {
      focusOption(selectedIndex >= 0 ? selectedIndex : 0);
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen, position, focusOption, selectedIndex]);

  // Click-outside detection
  useRegisterOverlay({
    id: `select-${id}`,
    refs: [triggerRef, contentRef],
    onClose: close,
  });

  // Keyboard bindings when open
  useRegisterKeyboardBindings(
    `select-${id}`,
    {
      escape: () => {
        close();
        return true;
      },
      down: () => {
        const items = getOptionElements();
        if (items.length === 0) return true;
        const next = focusedIndex < items.length - 1 ? focusedIndex + 1 : 0;
        focusOption(next);
        return true;
      },
      up: () => {
        const items = getOptionElements();
        if (items.length === 0) return true;
        const prev = focusedIndex > 0 ? focusedIndex - 1 : items.length - 1;
        focusOption(prev);
        return true;
      },
      enter: () => {
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          onChange(options[focusedIndex].value);
          close();
        }
        return true;
      },
      space: () => {
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          onChange(options[focusedIndex].value);
          close();
        }
        return true;
      },
      tab: () => {
        close();
        return true;
      },
    },
    { enabled: isOpen },
  );

  // Shortcut bindings (always active when mounted, ignoreIfInput)
  const shortcutKeys = shortcut
    ? Array.isArray(shortcut)
      ? shortcut
      : [shortcut]
    : [];
  const shortcutBindings = Object.fromEntries(
    shortcutKeys.map((key) => [
      key,
      {
        handler: () => {
          if (shortcutBehavior === 'open') {
            toggle();
          } else {
            cycleNext();
          }
          return true;
        },
        ignoreIfInput: true,
      },
    ]),
  );
  useRegisterKeyboardBindings(
    `select-shortcut-${id}`,
    shortcutBindings,
    { enabled: shortcutKeys.length > 0 && !disabled },
  );

  // Position calculation (same algorithm as Dropdown)
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const maxHeight = 320;
      const gap = 4;

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const actualSide =
        side === 'bottom'
          ? spaceBelow >= maxHeight || spaceBelow >= spaceAbove
            ? 'bottom'
            : 'top'
          : spaceAbove >= maxHeight || spaceAbove >= spaceBelow
            ? 'top'
            : 'bottom';

      const top = actualSide === 'bottom' ? rect.bottom + gap : rect.top - gap;
      const left = align === 'right' ? rect.right : rect.left;

      setPosition({ top, left, actualSide });
    };

    updatePosition();

    window.addEventListener('scroll', updatePosition, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', updatePosition, { passive: true });

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, side, align]);

  // Resolve display shortcut (first one for <Kbd>)
  const displayShortcut = shortcutKeys[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={label}
        className={clsx(
          'flex items-center gap-1.5 rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span>{selectedOption?.label}</span>
        {displayShortcut ? (
          <Kbd shortcut={displayShortcut} />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden />
        )}
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={contentRef}
            id={listboxId}
            role="listbox"
            aria-orientation="vertical"
            aria-label={label}
            className="fixed z-50 min-w-48 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg"
            style={{
              top:
                position.actualSide === 'bottom' ? position.top : undefined,
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
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                className={clsx(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none',
                  option.value === value
                    ? 'text-neutral-200'
                    : 'text-neutral-400',
                )}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {option.value === value && (
                    <Check className="h-3 w-3" />
                  )}
                </span>
                <div className="flex flex-col">
                  <span
                    className={clsx(
                      'text-sm',
                      option.value === value
                        ? 'font-medium text-neutral-200'
                        : 'text-neutral-300',
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-xs text-neutral-500">
                      {option.description}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}) as <T extends string>(
  props: {
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
    disabled?: boolean;
    label?: string;
    side?: 'top' | 'bottom';
    align?: 'left' | 'right';
    className?: string;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    ref?: React.Ref<SelectRef>;
  },
) => React.ReactElement;
```

Key implementation notes:
- The `as` type assertion at the end enables generic `<T extends string>` on the component while using `forwardRef`. Without it, TypeScript loses the generic parameter.
- Two separate `useRegisterKeyboardBindings` calls: one for open-state navigation (enabled only when open), one for the shortcut (always enabled when mounted + not disabled).
- Shortcut bindings use `ignoreIfInput: true` so they don't fire when the user is typing in a textarea/input.
- Auto-focuses the currently selected option (not always the first) when the dropdown opens.

**Step 2: Verify the component compiles**

Run: `pnpm ts-check`
Expected: No new type errors.

**Step 3: Verify lint passes**

Run: `pnpm lint --fix`
Expected: Clean or auto-fixed.

---

### Task 2: Refactor ModeSelector to use Select

**Files:**
- Modify: `src/features/agent/ui-mode-selector/index.tsx`

**Step 1: Replace ModeSelector internals with Select**

Replace the entire file content. The component becomes a thin wrapper that passes mode-specific options to `Select`:

```tsx
import { forwardRef } from 'react';

import { Select, type SelectRef } from '@/common/ui/select';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import type { InteractionMode } from '@shared/types';

const MODES = [
  { value: 'ask' as const, label: 'Ask', description: 'All tools require approval' },
  { value: 'auto' as const, label: 'Auto', description: 'All tools auto-approved' },
  { value: 'plan' as const, label: 'Plan', description: 'Planning only, no execution' },
];

export const ModeSelector = forwardRef<
  SelectRef,
  {
    value: InteractionMode;
    onChange: (mode: InteractionMode) => void;
    disabled?: boolean;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
  }
>(function ModeSelector({ value, onChange, disabled, shortcut, shortcutBehavior, side, className }, ref) {
  return (
    <Select
      ref={ref}
      value={value}
      options={MODES}
      onChange={onChange}
      disabled={disabled}
      label="Interaction mode"
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
    />
  );
});
```

**Step 2: Update all ModeSelector usages**

Search for imports of `ModeSelector` and update them. The main usage is in the task settings pane. The new task overlay uses inline buttons (handled in Task 5), not ModeSelector directly.

Check: `src/features/task/ui-task-settings-pane/index.tsx` — update the `<ModeSelector>` usage if it exists. The component API is backward-compatible (same `value`/`onChange`/`disabled` props), so most usages just need to verify they still compile.

**Step 3: Verify**

Run: `pnpm ts-check`
Expected: No new type errors.

Run: `pnpm lint --fix`
Expected: Clean.

---

### Task 3: Refactor ModelSelector to use Select

**Files:**
- Modify: `src/features/agent/ui-model-selector/index.tsx`

**Step 1: Replace ModelSelector internals with Select**

```tsx
import { forwardRef, useMemo } from 'react';

import { Select, type SelectRef, type SelectOption } from '@/common/ui/select';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import type { ModelPreference } from '@shared/types';

import type { BackendModelOption } from '../ui-backend-selector';

const DEFAULT_MODELS: BackendModelOption[] = [
  { value: 'default', label: 'Default', description: 'Use the default model' },
  { value: 'opus', label: 'Opus', description: 'Most capable model' },
  { value: 'claude-opus-4-5', label: 'Opus 4.5', description: '' },
  { value: 'sonnet', label: 'Sonnet', description: 'Balanced speed & quality' },
  { value: 'haiku', label: 'Haiku', description: 'Fastest, lightweight tasks' },
];

export const MODEL_PREFERENCES = DEFAULT_MODELS.map((m) => m.value);

export const ModelSelector = forwardRef<
  SelectRef,
  {
    value: ModelPreference;
    onChange: (model: ModelPreference) => void;
    disabled?: boolean;
    models?: BackendModelOption[];
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
  }
>(function ModelSelector({ value, onChange, disabled, models, shortcut, shortcutBehavior, side, className }, ref) {
  const effectiveModels = useMemo(
    () =>
      (models ?? DEFAULT_MODELS).map(
        (m): SelectOption<string> => ({
          value: m.value,
          label: m.label,
          description: m.description,
        }),
      ),
    [models],
  );

  return (
    <Select
      ref={ref}
      value={value}
      options={effectiveModels}
      onChange={onChange as (v: string) => void}
      disabled={disabled}
      label="Model"
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
    />
  );
});
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No new type errors.

Run: `pnpm lint --fix`
Expected: Clean.

---

### Task 4: Refactor BackendSelector to use Select

**Files:**
- Modify: `src/features/agent/ui-backend-selector/index.tsx` (only the `BackendSelector` component; keep all utility functions and hooks)

**Step 1: Replace the BackendSelector component**

Keep everything above the `BackendSelector` function (lines 1–183) exactly as-is. Replace only the `BackendSelector` component (lines 185–266):

```tsx
export const BackendSelector = forwardRef<
  SelectRef,
  {
    value: AgentBackendType;
    onChange: (backend: AgentBackendType) => void;
    disabled?: boolean;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
  }
>(function BackendSelector(
  { value, onChange, disabled, shortcut, shortcutBehavior, side, className },
  ref,
) {
  const { visible, visibleBackends } = useBackendSelector({
    value,
    onChange,
  });

  if (!visible) return null;

  const options = visibleBackends.map((b) => ({
    value: b.value,
    label: b.label,
    description: b.description,
  }));

  return (
    <Select
      ref={ref}
      value={value}
      options={options}
      onChange={onChange as (v: string) => void}
      disabled={disabled}
      label="Agent backend"
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
    />
  );
});
```

Add imports at the top of the file:
```tsx
import { forwardRef } from 'react';
import { Select, type SelectRef } from '@/common/ui/select';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
```

Also re-export `SelectRef` so consumers can reference it:
```tsx
export type { SelectRef } from '@/common/ui/select';
```

**Step 2: Verify**

Run: `pnpm ts-check`
Expected: No new type errors.

Run: `pnpm lint --fix`
Expected: Clean.

---

### Task 5: Refactor NewTaskOverlay footer to use Select components

**Files:**
- Modify: `src/features/new-task/ui-new-task-overlay/index.tsx`

This is the biggest payoff. The overlay currently has:
- `toggleInteractionMode` callback (lines 276–281) — replaced by `shortcut="cmd+i"` on ModeSelector
- `toggleModelPreference` callback (lines 298–304) — replaced by `shortcut="cmd+l"` on ModelSelector
- `backendInfo.toggle` call (line 672) — replaced by `shortcut="cmd+j"` on BackendSelector
- Three `useCommands` entries for these toggles (lines 654–673) — removed (shortcuts now handled by Select)
- Three inline `<button>` elements in the footer (lines 880–908) — replaced by `<ModeSelector>`, `<ModelSelector>`, `<BackendSelector>`

**Step 1: Remove toggle callbacks and useCommands entries**

Delete the `toggleInteractionMode` callback, the `toggleModelPreference` callback, and the three command entries (`Toggle Interaction Mode`, `Toggle Model`, `Toggle Agent Backend`) from the `useCommands` array.

**Step 2: Replace footer buttons with Select-based components**

Replace the three inline buttons in the footer (interaction mode, model, backend) with:

```tsx
<ModeSelector
  value={draft?.interactionMode ?? 'ask'}
  onChange={(mode) => updateDraft({ interactionMode: mode })}
  shortcut="cmd+i"
  side="top"
/>

<ModelSelector
  value={draft?.modelPreference ?? 'default'}
  onChange={(model) => updateDraft({ modelPreference: model })}
  models={backendModelOptions}
  shortcut="cmd+l"
  side="top"
/>

{backendInfo.visible && (
  <BackendSelector
    value={draft?.agentBackend ?? 'claude-code'}
    onChange={(backend) => updateDraft({ agentBackend: backend })}
    shortcut="cmd+j"
    side="top"
  />
)}
```

Note: `side="top"` because the footer is at the bottom of the overlay, so the dropdown should open upward.

**Step 3: Update imports**

Add imports for `ModeSelector` and `ModelSelector` if not already imported. Remove unused `ChevronDown` if no longer needed. Remove `Kbd` import if no longer used in the footer (check other usages first).

**Step 4: Verify**

Run: `pnpm ts-check`
Expected: No new type errors.

Run: `pnpm lint --fix`
Expected: Clean.

---

### Task 6: Final verification and cleanup

**Step 1: Run full type check**

Run: `pnpm ts-check`
Expected: Zero errors.

**Step 2: Run linter**

Run: `pnpm lint --fix`
Expected: Clean.

**Step 3: Search for unused imports or dead code**

Check that no file still imports the old manual click-outside pattern from the refactored selectors. Search for `handleClickOutside` in the modified files to confirm it's gone.

**Step 4: Verify the `Dropdown` component is untouched**

Confirm `src/common/ui/dropdown/index.tsx` has no changes — the Select is a separate component, not a modification of Dropdown.
