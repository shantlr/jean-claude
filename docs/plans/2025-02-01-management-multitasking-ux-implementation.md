# Management & Multitasking UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a keyboard-driven, command palette-centric UX for rapid task switching and management, with deep Azure DevOps integration.

**Architecture:** React Context-based systems for keyboard bindings and command registration. Layered bindings allow context-aware shortcuts. Command palette aggregates commands from all mounted components.

**Tech Stack:** React, TypeScript, Zustand (state), TanStack Query (data), TanStack Router (navigation)

**Design Document:** `docs/plans/2025-02-01-management-multitasking-ux-design.md`

---

## Phase 1: Foundation (Keyboard Bindings + Command Palette Infrastructure)

### Task 1.1: Create Keyboard Bindings Types

**Files:**
- Create: `src/lib/keyboard-bindings/types.ts`

**Step 1: Create the types file**

```typescript
// src/lib/keyboard-bindings/types.ts

// Modifier keys
type CmdModifier = 'cmd';
type ShiftModifier = 'shift';
type AltModifier = 'alt';
type CtrlModifier = 'ctrl';

// Letter keys
type LetterKey =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z';

// Number keys
type NumberKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

// Special keys
type SpecialKey =
  | 'enter'
  | 'escape'
  | 'tab'
  | 'space'
  | 'backspace'
  | 'delete'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | '['
  | ']'
  | '\\'
  | '/'
  | '.'
  | ','
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'f9' | 'f10' | 'f11' | 'f12';

// Base key (letter, number, or special)
type BaseKey = LetterKey | NumberKey | SpecialKey;

// Binding key combinations (order enforced: cmd > ctrl > alt > shift > base)
export type BindingKey =
  | BaseKey
  | `shift+${BaseKey}`
  | `alt+${BaseKey}`
  | `alt+shift+${BaseKey}`
  | `ctrl+${BaseKey}`
  | `ctrl+shift+${BaseKey}`
  | `ctrl+alt+${BaseKey}`
  | `ctrl+alt+shift+${BaseKey}`
  | `cmd+${BaseKey}`
  | `cmd+shift+${BaseKey}`
  | `cmd+alt+${BaseKey}`
  | `cmd+alt+shift+${BaseKey}`
  | `cmd+ctrl+${BaseKey}`
  | `cmd+ctrl+shift+${BaseKey}`
  | `cmd+ctrl+alt+${BaseKey}`
  | `cmd+ctrl+alt+shift+${BaseKey}`;

// Handler returns true if event was handled (stops propagation)
export type BindingHandler = (event: KeyboardEvent) => boolean | void;

// Record of bindings
export type Bindings = Partial<Record<BindingKey, BindingHandler>>;

// Internal context registration
export interface BindingContext {
  id: string;
  bindings: React.RefObject<Bindings>;
}
```

**Step 2: Verify file created**

Run: `ls -la src/lib/keyboard-bindings/`

**Step 3: Commit**

```bash
git add src/lib/keyboard-bindings/types.ts
git commit -m "feat: add keyboard bindings type system"
```

---

### Task 1.2: Create Keyboard Event Utilities

**Files:**
- Create: `src/lib/keyboard-bindings/utils.ts`

**Step 1: Create the utils file**

```typescript
// src/lib/keyboard-bindings/utils.ts
import type { BindingKey } from './types';

const KEY_MAP: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  ' ': 'space',
  Backspace: 'backspace',
  Delete: 'delete',
};

function normalizeKey(key: string): string {
  return KEY_MAP[key] ?? key.toLowerCase();
}

export function formatKeyboardEvent(event: KeyboardEvent): BindingKey {
  const parts: string[] = [];

  // Order: cmd > ctrl > alt > shift > base
  if (event.metaKey) parts.push('cmd');
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');

  const key = normalizeKey(event.key);
  parts.push(key);

  return parts.join('+') as BindingKey;
}

// Global shortcuts that should work even when typing in an input
const GLOBAL_SHORTCUTS: Set<BindingKey> = new Set([
  'cmd+p',
  'cmd+n',
  'cmd+,',
  'cmd+1',
  'cmd+2',
  'cmd+3',
  'cmd+4',
  'cmd+5',
  'cmd+6',
  'cmd+7',
  'cmd+8',
  'cmd+9',
  'escape',
]);

export function isGlobalShortcut(event: KeyboardEvent): boolean {
  const key = formatKeyboardEvent(event);
  return GLOBAL_SHORTCUTS.has(key);
}

export function isTypingInInput(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  const tagName = target.tagName.toLowerCase();
  const isEditable = target.isContentEditable;
  const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  return isEditable || isInput;
}

// Format for display (e.g., "cmd+shift+p" -> "⌘⇧P")
export function formatKeyForDisplay(key: BindingKey): string {
  return key
    .replace('cmd+', '⌘')
    .replace('ctrl+', '⌃')
    .replace('alt+', '⌥')
    .replace('shift+', '⇧')
    .replace('enter', '↵')
    .replace('escape', 'Esc')
    .replace('tab', 'Tab')
    .replace('up', '↑')
    .replace('down', '↓')
    .replace('left', '←')
    .replace('right', '→')
    .toUpperCase();
}
```

**Step 2: Commit**

```bash
git add src/lib/keyboard-bindings/utils.ts
git commit -m "feat: add keyboard event formatting utilities"
```

---

### Task 1.3: Create RootKeyboardBindings Context

**Files:**
- Create: `src/lib/keyboard-bindings/root-keyboard-bindings.tsx`

**Step 1: Create the context provider**

```tsx
// src/lib/keyboard-bindings/root-keyboard-bindings.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { BindingContext, Bindings } from './types';
import { formatKeyboardEvent, isGlobalShortcut, isTypingInInput } from './utils';

interface RootKeyboardBindingsContextValue {
  register: (id: string, bindings: React.RefObject<Bindings>) => () => void;
}

const RootKeyboardBindingsContext = createContext<RootKeyboardBindingsContextValue | null>(null);

export function RootKeyboardBindings({ children }: { children: ReactNode }) {
  const contextsRef = useRef<BindingContext[]>([]);

  const register = useCallback((id: string, bindings: React.RefObject<Bindings>) => {
    // Remove existing if re-registering
    contextsRef.current = contextsRef.current.filter((c) => c.id !== id);

    // Add to end of list
    contextsRef.current.push({ id, bindings });

    // Return unsubscribe
    return () => {
      contextsRef.current = contextsRef.current.filter((c) => c.id !== id);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if typing in input unless it's a global shortcut
      if (isTypingInInput(event) && !isGlobalShortcut(event)) {
        return;
      }

      const key = formatKeyboardEvent(event);

      // Loop from end (most recently registered first)
      for (let i = contextsRef.current.length - 1; i >= 0; i--) {
        const context = contextsRef.current[i];
        const handler = context.bindings.current?.[key];
        if (handler) {
          const handled = handler(event);
          if (handled !== false) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = useMemo(() => ({ register }), [register]);

  return (
    <RootKeyboardBindingsContext.Provider value={value}>
      {children}
    </RootKeyboardBindingsContext.Provider>
  );
}

export function useRootKeyboardBindings(): RootKeyboardBindingsContextValue {
  const context = useContext(RootKeyboardBindingsContext);
  if (!context) {
    throw new Error('useRootKeyboardBindings must be used within RootKeyboardBindings');
  }
  return context;
}
```

**Step 2: Commit**

```bash
git add src/lib/keyboard-bindings/root-keyboard-bindings.tsx
git commit -m "feat: add RootKeyboardBindings context provider"
```

---

### Task 1.4: Create useKeyboardBindings Hook

**Files:**
- Create: `src/lib/keyboard-bindings/use-keyboard-bindings.ts`

**Step 1: Create the hook**

```typescript
// src/lib/keyboard-bindings/use-keyboard-bindings.ts
import { useEffect, useRef } from 'react';
import { useRootKeyboardBindings } from './root-keyboard-bindings';
import type { Bindings } from './types';

export function useKeyboardBindings(id: string, bindings: Bindings): void {
  const root = useRootKeyboardBindings();
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    return root.register(id, bindingsRef);
  }, [id, root]);
}
```

**Step 2: Commit**

```bash
git add src/lib/keyboard-bindings/use-keyboard-bindings.ts
git commit -m "feat: add useKeyboardBindings hook"
```

---

### Task 1.5: Create Keyboard Bindings Index Export

**Files:**
- Create: `src/lib/keyboard-bindings/index.ts`

**Step 1: Create barrel export**

```typescript
// src/lib/keyboard-bindings/index.ts
export { RootKeyboardBindings, useRootKeyboardBindings } from './root-keyboard-bindings';
export { useKeyboardBindings } from './use-keyboard-bindings';
export { formatKeyForDisplay, formatKeyboardEvent } from './utils';
export type { BindingHandler, BindingKey, Bindings } from './types';
```

**Step 2: Commit**

```bash
git add src/lib/keyboard-bindings/index.ts
git commit -m "feat: add keyboard bindings module exports"
```

---

### Task 1.6: Create Command Palette Types

**Files:**
- Create: `src/lib/command-palette/types.ts`

**Step 1: Create types**

```typescript
// src/lib/command-palette/types.ts

export type CommandSection = 'current-task' | 'sessions' | 'commands';

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  keywords?: string[];
  section?: CommandSection;
  onSelect: () => void;
}

export interface CommandSource {
  id: string;
  commands: React.RefObject<Command[]>;
}

export interface CommandPaletteContextValue {
  registerCommands: (id: string, commands: React.RefObject<Command[]>) => () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  getCommands: () => Command[];
}
```

**Step 2: Commit**

```bash
git add src/lib/command-palette/types.ts
git commit -m "feat: add command palette types"
```

---

### Task 1.7: Create RootCommandPalette Context

**Files:**
- Create: `src/lib/command-palette/root-command-palette.tsx`

**Step 1: Create context provider**

```tsx
// src/lib/command-palette/root-command-palette.tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Command, CommandPaletteContextValue, CommandSource } from './types';

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function RootCommandPalette({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const sourcesRef = useRef<CommandSource[]>([]);

  const registerCommands = useCallback(
    (id: string, commands: React.RefObject<Command[]>) => {
      sourcesRef.current = sourcesRef.current.filter((s) => s.id !== id);
      sourcesRef.current.push({ id, commands });

      return () => {
        sourcesRef.current = sourcesRef.current.filter((s) => s.id !== id);
      };
    },
    []
  );

  const getCommands = useCallback(() => {
    return sourcesRef.current.flatMap((source) => source.commands.current ?? []);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const value = useMemo(
    () => ({
      registerCommands,
      isOpen,
      open,
      close,
      toggle,
      getCommands,
    }),
    [registerCommands, isOpen, open, close, toggle, getCommands]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within RootCommandPalette');
  }
  return context;
}
```

**Step 2: Commit**

```bash
git add src/lib/command-palette/root-command-palette.tsx
git commit -m "feat: add RootCommandPalette context provider"
```

---

### Task 1.8: Create useCommands Hook

**Files:**
- Create: `src/lib/command-palette/use-commands.ts`

**Step 1: Create hook**

```typescript
// src/lib/command-palette/use-commands.ts
import { useEffect, useRef } from 'react';
import { useCommandPalette } from './root-command-palette';
import type { Command } from './types';

export function useCommands(id: string, commands: Command[]): void {
  const palette = useCommandPalette();
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    return palette.registerCommands(id, commandsRef);
  }, [id, palette]);
}
```

**Step 2: Commit**

```bash
git add src/lib/command-palette/use-commands.ts
git commit -m "feat: add useCommands hook"
```

---

### Task 1.9: Create Command Palette Index Export

**Files:**
- Create: `src/lib/command-palette/index.ts`

**Step 1: Create barrel export**

```typescript
// src/lib/command-palette/index.ts
export { RootCommandPalette, useCommandPalette } from './root-command-palette';
export { useCommands } from './use-commands';
export type { Command, CommandPaletteContextValue, CommandSection } from './types';
```

**Step 2: Commit**

```bash
git add src/lib/command-palette/index.ts
git commit -m "feat: add command palette module exports"
```

---

### Task 1.10: Create Command Palette Overlay Component

**Files:**
- Create: `src/features/command-palette/ui-command-palette-overlay/index.tsx`

**Step 1: Create component**

```tsx
// src/features/command-palette/ui-command-palette-overlay/index.tsx
import { useState, useMemo, useCallback } from 'react';
import { useCommandPalette, type Command } from '@/lib/command-palette';
import { useKeyboardBindings, formatKeyForDisplay } from '@/lib/keyboard-bindings';
import { cn } from '@/lib/utils';

function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;
  const lowerQuery = query.toLowerCase();
  return commands.filter((cmd) => {
    const matchesLabel = cmd.label.toLowerCase().includes(lowerQuery);
    const matchesKeywords = cmd.keywords?.some((k) => k.toLowerCase().includes(lowerQuery));
    return matchesLabel || matchesKeywords;
  });
}

function groupBySection(commands: Command[]): Record<string, Command[]> {
  const groups: Record<string, Command[]> = {};
  for (const cmd of commands) {
    const section = cmd.section ?? 'commands';
    if (!groups[section]) groups[section] = [];
    groups[section].push(cmd);
  }
  return groups;
}

const SECTION_LABELS: Record<string, string> = {
  'current-task': 'Current Task',
  sessions: 'Sessions',
  commands: 'Commands',
};

export function CommandPaletteOverlay() {
  const { close, getCommands } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = getCommands();
  const filteredCommands = useMemo(() => filterCommands(commands, query), [commands, query]);
  const groupedCommands = useMemo(() => groupBySection(filteredCommands), [filteredCommands]);

  const handleSelect = useCallback(
    (command: Command) => {
      close();
      command.onSelect();
    },
    [close]
  );

  useKeyboardBindings('command-palette-overlay', {
    escape: () => {
      close();
      return true;
    },
    enter: () => {
      const cmd = filteredCommands[selectedIndex];
      if (cmd) handleSelect(cmd);
      return true;
    },
    up: () => {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return true;
    },
    down: () => {
      setSelectedIndex((i) => Math.min(filteredCommands.length - 1, i + 1));
      return true;
    },
  });

  // Reset selection when query changes
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  };

  let itemIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={close}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-border px-4 py-3">
          <span className="mr-2 text-muted-foreground">⌘P</span>
          <input
            type="text"
            placeholder="Search..."
            autoFocus
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No matching commands
            </div>
          ) : (
            Object.entries(groupedCommands).map(([section, cmds]) => (
              <div key={section} className="mb-2">
                <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                  {SECTION_LABELS[section] ?? section}
                </div>
                {cmds.map((cmd) => {
                  const currentIndex = itemIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleSelect(cmd)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      )}
                    >
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <span className="text-xs text-muted-foreground">
                          {formatKeyForDisplay(cmd.shortcut as any)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/command-palette/ui-command-palette-overlay/index.tsx
git commit -m "feat: add CommandPaletteOverlay component"
```

---

### Task 1.11: Integrate Keyboard Bindings and Command Palette into App

**Files:**
- Modify: `src/app.tsx` (or main app entry point)

**Step 1: Read current app structure**

Run: Read the main app file to understand current structure.

**Step 2: Wrap app with RootKeyboardBindings and RootCommandPalette**

Add providers near the root of the app, wrapping the router/layout:

```tsx
import { RootKeyboardBindings } from '@/lib/keyboard-bindings';
import { RootCommandPalette } from '@/lib/command-palette';
import { CommandPaletteOverlay } from '@/features/command-palette/ui-command-palette-overlay';

// In the provider tree, add:
<RootKeyboardBindings>
  <RootCommandPalette>
    {/* Existing app content */}
    <CommandPaletteOverlayContainer />
  </RootCommandPalette>
</RootKeyboardBindings>

// CommandPaletteOverlayContainer conditionally renders the overlay
function CommandPaletteOverlayContainer() {
  const { isOpen } = useCommandPalette();
  if (!isOpen) return null;
  return <CommandPaletteOverlay />;
}
```

**Step 3: Add global keyboard binding for cmd+p**

Create a GlobalBindings component that registers the cmd+p shortcut:

```tsx
function GlobalBindings() {
  const { toggle } = useCommandPalette();

  useKeyboardBindings('global', {
    'cmd+p': () => {
      toggle();
      return true;
    },
  });

  return null;
}
```

**Step 4: Commit**

```bash
git add src/app.tsx
git commit -m "feat: integrate keyboard bindings and command palette into app"
```

---

### Task 1.12: Add Global Commands Registration

**Files:**
- Create: `src/features/command-palette/global-commands.tsx`

**Step 1: Create global commands component**

```tsx
// src/features/command-palette/global-commands.tsx
import { useNavigate } from '@tanstack/react-router';
import { useCommands } from '@/lib/command-palette';

export function GlobalCommands() {
  const navigate = useNavigate();

  useCommands('global', [
    {
      id: 'new-task',
      label: 'New task...',
      shortcut: 'cmd+n',
      section: 'commands',
      keywords: ['create', 'add', 'start', 'spawn'],
      onSelect: () => {
        // TODO: Open spotlight when implemented
        console.log('Open new task spotlight');
      },
    },
    {
      id: 'settings',
      label: 'Settings...',
      shortcut: 'cmd+,',
      section: 'commands',
      keywords: ['preferences', 'config', 'configuration'],
      onSelect: () => navigate({ to: '/settings' }),
    },
  ]);

  return null;
}
```

**Step 2: Add to app**

Mount `<GlobalCommands />` inside the RootCommandPalette provider.

**Step 3: Commit**

```bash
git add src/features/command-palette/global-commands.tsx
git commit -m "feat: add global commands registration"
```

---

### Task 1.13: Run Lint and Fix Issues

**Step 1: Run lint**

Run: `pnpm lint --fix`

**Step 2: Fix any remaining issues**

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: lint issues in keyboard bindings and command palette"
```

---

## Phase 2: Session List Redesign

### Task 2.1: Update Navigation Store for Project Filter

**Files:**
- Modify: `src/stores/navigation.ts`

**Step 1: Read current navigation store**

**Step 2: Add projectFilter state**

Add to the store:
- `projectFilter: string | 'all'` - defaults to `'all'`
- `setProjectFilter: (filter: string | 'all') => void`

**Step 3: Commit**

```bash
git add src/stores/navigation.ts
git commit -m "feat: add projectFilter to navigation store"
```

---

### Task 2.2: Create useAllActiveTasks Hook

**Files:**
- Create: `src/hooks/use-all-active-tasks.ts`

**Step 1: Create hook**

```typescript
// src/hooks/use-all-active-tasks.ts
import { useQuery } from '@tanstack/react-query';

export function useAllActiveTasks() {
  return useQuery({
    queryKey: ['tasks', 'all-active'],
    queryFn: async () => {
      return window.api.getAllActiveTasks();
    },
  });
}
```

**Step 2: Add IPC handler** (if not exists)

Add `getAllActiveTasks` to the API and IPC handlers.

**Step 3: Commit**

```bash
git add src/hooks/use-all-active-tasks.ts
git commit -m "feat: add useAllActiveTasks hook"
```

---

### Task 2.3: Create Session Card Component

**Files:**
- Create: `src/features/task/ui-session-card/index.tsx`

**Step 1: Create component**

A minimal card showing: status icon, name, project tag, time, number badge.

**Step 2: Commit**

```bash
git add src/features/task/ui-session-card/index.tsx
git commit -m "feat: add SessionCard component"
```

---

### Task 2.4: Create Project Filter Tabs Component

**Files:**
- Create: `src/features/project/ui-project-filter-tabs/index.tsx`

**Step 1: Create component**

Horizontal tabs: All | project1 | project2 | ...
Keyboard: cmd+tab / cmd+shift+tab to navigate.

**Step 2: Commit**

```bash
git add src/features/project/ui-project-filter-tabs/index.tsx
git commit -m "feat: add ProjectFilterTabs component"
```

---

### Task 2.5: Create Session List Component

**Files:**
- Create: `src/features/task/ui-session-list/index.tsx`

**Step 1: Create component**

Combines ProjectFilterTabs + list of SessionCards filtered by selected project.

**Step 2: Add keyboard bindings for cmd+1-9 and cmd+up/down**

**Step 3: Commit**

```bash
git add src/features/task/ui-session-list/index.tsx
git commit -m "feat: add SessionList component with keyboard navigation"
```

---

### Task 2.6: Integrate Session List into Layout

**Files:**
- Modify: `src/layout/` (sidebar component)

**Step 1: Replace project sidebar with new session list**

**Step 2: Test navigation**

**Step 3: Commit**

```bash
git add src/layout/
git commit -m "feat: integrate session list into app layout"
```

---

## Phase 3: New Task Spotlight

### Task 3.1: Create Spotlight Store

**Files:**
- Create: `src/stores/spotlight.ts`

**Step 1: Create Zustand store for spotlight state**

```typescript
// src/stores/spotlight.ts
import { create } from 'zustand';

interface SpotlightDraft {
  projectId: string | null;
  workItemId: string | null;
  prompt: string;
  createWorktree: boolean;
  workItemsFilter: string;
}

interface SpotlightStore {
  isOpen: boolean;
  draft: SpotlightDraft | null;
  open: () => void;
  close: () => void;
  discardDraft: () => void;
  updateDraft: (update: Partial<SpotlightDraft>) => void;
  clearDraft: () => void;
}

const defaultDraft: SpotlightDraft = {
  projectId: null,
  workItemId: null,
  prompt: '',
  createWorktree: true,
  workItemsFilter: '',
};

export const useSpotlightStore = create<SpotlightStore>((set) => ({
  isOpen: false,
  draft: null,
  open: () => set((state) => ({
    isOpen: true,
    draft: state.draft ?? { ...defaultDraft }
  })),
  close: () => set({ isOpen: false }),
  discardDraft: () => set({ isOpen: false, draft: null }),
  updateDraft: (update) => set((state) => ({
    draft: state.draft ? { ...state.draft, ...update } : { ...defaultDraft, ...update },
  })),
  clearDraft: () => set({ draft: null }),
}));
```

**Step 2: Commit**

```bash
git add src/stores/spotlight.ts
git commit -m "feat: add spotlight store with draft persistence"
```

---

### Task 3.2: Create Spotlight Overlay Component

**Files:**
- Create: `src/features/spotlight/ui-spotlight-overlay/index.tsx`

**Step 1: Create main spotlight overlay**

Full implementation with:
- Project tiles (horizontal)
- Work items list + details panel
- Input field (search or prompt mode)
- Keyboard navigation

**Step 2: Commit**

```bash
git add src/features/spotlight/ui-spotlight-overlay/index.tsx
git commit -m "feat: add SpotlightOverlay component"
```

---

### Task 3.3: Create Work Item List Component

**Files:**
- Create: `src/features/spotlight/ui-work-item-list/index.tsx`

**Step 1: Create component**

List of work items with:
- Type icon (bug, story)
- ID and title
- Highlight vs selected states

**Step 2: Commit**

```bash
git add src/features/spotlight/ui-work-item-list/index.tsx
git commit -m "feat: add WorkItemList component for spotlight"
```

---

### Task 3.4: Create Work Item Details Component

**Files:**
- Create: `src/features/spotlight/ui-work-item-details/index.tsx`

**Step 1: Create component**

Shows:
- Title
- Metadata (assigned, state, sprint)
- Full description

**Step 2: Commit**

```bash
git add src/features/spotlight/ui-work-item-details/index.tsx
git commit -m "feat: add WorkItemDetails component for spotlight"
```

---

### Task 3.5: Integrate Spotlight into App

**Files:**
- Modify: `src/app.tsx`

**Step 1: Add SpotlightOverlay to app**

**Step 2: Add cmd+n global binding**

**Step 3: Add draft indicator to "+ New" button**

**Step 4: Commit**

```bash
git add src/app.tsx
git commit -m "feat: integrate spotlight into app"
```

---

## Phase 4: Annotated Diff (Can run in parallel with Phase 2-3)

### Task 4.1: Create Task Summaries Migration

**Files:**
- Create: `electron/database/migrations/XXX_add_task_summaries.ts`

**Step 1: Create migration**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('task_summaries')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('task_id', 'text', (col) => col.notNull().references('tasks.id').onDelete('cascade'))
    .addColumn('commit_hash', 'text', (col) => col.notNull())
    .addColumn('summary', 'text', (col) => col.notNull())
    .addColumn('annotations', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('task_summaries_task_commit_unique', ['task_id', 'commit_hash'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('task_summaries').execute();
}
```

**Step 2: Register migration**

**Step 3: Commit**

```bash
git add electron/database/migrations/
git commit -m "feat: add task_summaries table migration"
```

---

### Task 4.2: Create TaskSummary Repository

**Files:**
- Create: `electron/database/repositories/task-summary-repository.ts`

**Step 1: Create repository**

CRUD operations for task summaries.

**Step 2: Commit**

```bash
git add electron/database/repositories/task-summary-repository.ts
git commit -m "feat: add TaskSummaryRepository"
```

---

### Task 4.3: Add Summary Generation IPC Handler

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Step 1: Add handler for generating summaries**

Uses agent to generate summary and annotations from diff.

**Step 2: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat: add summary generation IPC handler"
```

---

### Task 4.4: Create Summary Panel Component

**Files:**
- Create: `src/features/agent/ui-summary-panel/index.tsx`

**Step 1: Create collapsible panel**

Shows "What I Did" and "Key Decisions".

**Step 2: Commit**

```bash
git add src/features/agent/ui-summary-panel/index.tsx
git commit -m "feat: add SummaryPanel component"
```

---

### Task 4.5: Add Gutter Annotations to Diff View

**Files:**
- Modify: `src/features/agent/ui-worktree-diff-view/` (or wherever diff is rendered)

**Step 1: Add gutter icons**

**Step 2: Add expandable annotation popover**

**Step 3: Commit**

```bash
git add src/features/agent/
git commit -m "feat: add gutter annotations to diff view"
```

---

### Task 4.6: Create useTaskSummary Hook

**Files:**
- Create: `src/hooks/use-task-summary.ts`

**Step 1: Create hook**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useTaskSummary(taskId: string) {
  return useQuery({
    queryKey: ['task-summary', taskId],
    queryFn: () => window.api.getTaskSummary(taskId),
  });
}

export function useGenerateSummary(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.generateTaskSummary(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-summary', taskId] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-task-summary.ts
git commit -m "feat: add useTaskSummary and useGenerateSummary hooks"
```

---

## Phase 5: Polish & Cleanup

### Task 5.1: Add Keyboard Help Overlay

**Files:**
- Create: `src/features/common/ui-keyboard-help/index.tsx`

**Step 1: Create overlay showing all shortcuts**

Triggered by `cmd+/` or `?`.

**Step 2: Commit**

```bash
git add src/features/common/ui-keyboard-help/index.tsx
git commit -m "feat: add keyboard help overlay"
```

---

### Task 5.2: Add Tooltips with Shortcut Hints

**Files:**
- Modify various button components

**Step 1: Add shortcut hints to tooltips**

**Step 2: Commit**

```bash
git commit -m "feat: add shortcut hints to button tooltips"
```

---

### Task 5.3: Final Lint and Cleanup

**Step 1: Run lint**

Run: `pnpm lint --fix`

**Step 2: Fix any issues**

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: final lint cleanup"
```

---

## Summary

| Phase | Tasks | Risk Level |
|-------|-------|------------|
| Phase 1: Foundation | 1.1 - 1.13 | Low |
| Phase 2: Session List | 2.1 - 2.6 | Medium |
| Phase 3: Spotlight | 3.1 - 3.5 | Medium |
| Phase 4: Annotated Diff | 4.1 - 4.6 | Medium |
| Phase 5: Polish | 5.1 - 5.3 | Low |

**Total Tasks:** ~30

**Estimated Time:** Phase 1 can be completed first, enabling keyboard-driven workflow. Phases 2-4 can be parallelized. Phase 5 is final polish.
